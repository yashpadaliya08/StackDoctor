import asyncio
import base64
import os
import re
import shlex
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import sqlite3
from fastapi import APIRouter, HTTPException, UploadFile, File, Response, Depends, Request
from pydantic import BaseModel

from server.config import PROJECTS_DIR
from server.orchestrator.driver import PhoneRemoteDriver
from server.orchestrator.pipeline import orchestrator
from server.orchestrator.registry import deployment_registry
from server.orchestrator.watchdog import watchdog
from server.orchestrator.audit_log import audit_logger

router = APIRouter(prefix="/api/manage", tags=["Management Suite"])

# Security filter regex for destructive system-level commands and reverse shells
DANGEROUS_CMD_PATTERNS = [
    r"\brm\s+-[rfRF]{1,4}\s+/\b",
    r"\brm\s+-[rfRF]{1,4}\s+(~|\$HOME|/data/data/com\.termux/files/home)\b",
    r"\bmkfs\b",
    r"\bdd\s+if=",
    r"\b(shutdown|reboot|poweroff|init\s+0)\b",
    r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;",
    r">\s*/dev/(sd[a-z]|nvme|loop)",
    r"\bchmod\s+-[rR]\s+777\s+/\b",
    r"\b(nc|ncat|netcat)\s+.*-[ec]\b",
    r"/dev/tcp/[0-9]",
    r"\bmkfifo\s+/tmp",
]


def require_management_access(request: Request) -> None:
    """
    Verifies management access.
    If STACKDOCTOR_API_KEY is configured in the environment, enforces matching API key or Bearer token.
    """
    expected = os.environ.get("STACKDOCTOR_API_KEY")
    if expected:
        api_key = request.headers.get("X-API-Key", "")
        auth_header = request.headers.get("Authorization", "")
        bearer = auth_header[7:] if auth_header.startswith("Bearer ") else ""
        if api_key != expected and bearer != expected:
            raise HTTPException(status_code=401, detail="Unauthorized: invalid or missing management API key.")


class ExecRequest(BaseModel):
    command: str


class DbQueryRequest(BaseModel):
    query: str


class EnvUpdateRequest(BaseModel):
    env: Dict[str, str]


def _get_deployment_or_404(identifier: str):
    rec = deployment_registry.get(identifier)
    if not rec:
        raise HTTPException(status_code=404, detail=f"Deployment '{identifier}' not found in registry.")
    return rec


# ==========================================
# 1. 📜 APPLICATION LOGS STREAMER
# ==========================================


@router.get("/{identifier}/logs")
async def get_app_logs(identifier: str, lines: int = 150) -> dict:
    rec = _get_deployment_or_404(identifier)
    lines = min(max(lines, 20), 500)

    if rec.target == "phone":
        remote_dir = f"/data/data/com.termux/files/home/apps/{rec.project_id}"
        probe_cmd = (
            f"echo '===SERVER_LOG==='; tail -n {lines} {remote_dir}/server.log 2>/dev/null || echo 'No server.log yet.';\n"
            f"echo '===LARAVEL_LOG==='; tail -n {lines} {remote_dir}/storage/logs/laravel.log 2>/dev/null || echo 'No laravel.log yet.';"
        )
        loop = asyncio.get_running_loop()
        code, out, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, probe_cmd, 15)

        server_out = ""
        laravel_out = ""
        current = None
        for line in out.splitlines():
            if line.strip() == "===SERVER_LOG===":
                current = "server"
            elif line.strip() == "===LARAVEL_LOG===":
                current = "laravel"
            elif current == "server":
                server_out += line + "\n"
            elif current == "laravel":
                laravel_out += line + "\n"

        return {
            "project_id": rec.project_id,
            "project_name": rec.project_name,
            "server_log": server_out.strip(),
            "laravel_log": laravel_out.strip(),
            "target": "phone",
            "retrieved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    else:
        # Local host fallback
        local_dir = PROJECTS_DIR / rec.project_id
        laravel_log_file = local_dir / "storage" / "logs" / "laravel.log"
        laravel_content = ""
        if laravel_log_file.exists():
            laravel_content = "\n".join(laravel_log_file.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:])
        return {
            "project_id": rec.project_id,
            "project_name": rec.project_name,
            "server_log": "Local execution running under host loopback.",
            "laravel_log": laravel_content,
            "target": "local",
            "retrieved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }


@router.post("/{identifier}/logs/clear")
async def clear_app_logs(identifier: str) -> dict:
    rec = _get_deployment_or_404(identifier)
    if rec.target == "phone":
        remote_dir = f"/data/data/com.termux/files/home/apps/{rec.project_id}"
        clear_cmd = f"> {remote_dir}/server.log 2>/dev/null; > {remote_dir}/storage/logs/laravel.log 2>/dev/null; echo CLEARED"
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, clear_cmd, 10)
    return {"status": "SUCCESS", "message": "Application log files truncated."}


# ==========================================
# 2. ⚡ IN-BROWSER COMMAND RUNNER
# ==========================================


@router.post("/{identifier}/exec", dependencies=[Depends(require_management_access)])
async def execute_command(identifier: str, req: ExecRequest) -> dict:
    rec = _get_deployment_or_404(identifier)
    cmd = req.command.strip()
    if not cmd:
        raise HTTPException(status_code=400, detail="Command cannot be empty.")

    # Validate against destructive commands
    for pattern in DANGEROUS_CMD_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            raise HTTPException(
                status_code=403,
                detail=f"Security alert: Command matches forbidden destructive pattern [{pattern}]."
            )

    if rec.target == "phone":
        remote_dir = f"/data/data/com.termux/files/home/apps/{rec.project_id}"
        wrapped_cmd = f"cd {remote_dir} && {cmd}"
        loop = asyncio.get_running_loop()
        start = time.time()
        code, out, err = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, wrapped_cmd, 60)
        elapsed = round(time.time() - start, 2)
        audit_logger.record(
            action="EXEC_COMMAND",
            project_id=rec.project_id,
            actor="operator",
            details=f"Ran: {cmd[:60]} (exit {code}, {elapsed}s)",
            status="SUCCESS" if code == 0 else "FAILED",
        )
        return {
            "command": cmd,
            "exit_code": code,
            "stdout": out,
            "stderr": err,
            "execution_time_sec": elapsed,
        }
    else:
        # Local execution
        local_dir = PROJECTS_DIR / rec.project_id
        start = time.time()
        proc = await asyncio.create_subprocess_shell(
            cmd,
            cwd=str(local_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_b, stderr_b = await proc.communicate()
        elapsed = round(time.time() - start, 2)
        return {
            "command": cmd,
            "exit_code": proc.returncode,
            "stdout": stdout_b.decode("utf-8", errors="replace"),
            "stderr": stderr_b.decode("utf-8", errors="replace"),
            "execution_time_sec": elapsed,
        }


# ==========================================
# 3. 🗄️ IN-BROWSER DATABASE VIEWER & SQL RUNNER
# ==========================================


async def _resolve_project_db_name(project_id: str, target: str) -> str:
    """Reads DB_DATABASE from remote or local .env, or falls back to project db naming."""
    clean_project_id = re.sub(r"[^a-zA-Z0-9_\-]", "", project_id)
    default_db = f"db_{re.sub(r'[^a-zA-Z0-9_]', '', clean_project_id)[:8]}"
    if target == "phone":
        remote_env_file = f"/data/data/com.termux/files/home/apps/{clean_project_id}/.env"
        cmd = f"grep '^DB_DATABASE=' {shlex.quote(remote_env_file)} 2>/dev/null | cut -d= -f2- | tr -d '\"' | tr -d \"'\""
        loop = asyncio.get_running_loop()
        _, out, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, cmd, 5)
        parsed = out.strip()
        if parsed and re.match(r"^[a-zA-Z0-9_]{1,64}$", parsed):
            return parsed
    return default_db


@router.get("/{identifier}/db/tables")
async def get_database_tables(identifier: str) -> dict:
    rec = _get_deployment_or_404(identifier)
    db_name = await _resolve_project_db_name(rec.project_id, rec.target)
    if not re.match(r"^[a-zA-Z0-9_]{1,64}$", db_name):
        raise HTTPException(status_code=400, detail="Invalid database name identifier.")

    sql = (
        f"SELECT table_name, table_rows, round(((data_length + index_length) / 1024), 2) as size_kb "
        f"FROM information_schema.tables WHERE table_schema = '{db_name}' ORDER BY table_name;"
    )
    cmd = f"mariadb -u root -e {shlex.quote(sql)} --batch --raw 2>&1"
    loop = asyncio.get_running_loop()
    code, out, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, cmd, 15)

    tables = []
    lines = out.strip().splitlines()
    if len(lines) > 1:
        # First line is header
        for line in lines[1:]:
            parts = line.split("\t")
            if len(parts) >= 2:
                tables.append({
                    "name": parts[0],
                    "rows": int(parts[1]) if parts[1].isdigit() else 0,
                    "size_kb": float(parts[2]) if len(parts) > 2 and parts[2].replace(".", "", 1).isdigit() else 0.0,
                })

    return {
        "database": db_name,
        "tables": tables,
        "total_tables": len(tables),
    }


@router.get("/{identifier}/db/table/{table_name}")
async def get_table_data(identifier: str, table_name: str, page: int = 1, limit: int = 50) -> dict:
    rec = _get_deployment_or_404(identifier)
    clean_table = re.sub(r"[^a-zA-Z0-9_]", "", table_name)
    if not clean_table or len(clean_table) > 64:
        raise HTTPException(status_code=400, detail="Invalid table name.")

    db_name = await _resolve_project_db_name(rec.project_id, rec.target)
    if not re.match(r"^[a-zA-Z0-9_]{1,64}$", db_name):
        raise HTTPException(status_code=400, detail="Invalid database name identifier.")
    page = max(page, 1)
    limit = min(max(limit, 10), 100)
    offset = (page - 1) * limit

    loop = asyncio.get_running_loop()

    # 1. Get schema structure
    desc_sql = f"DESCRIBE `{db_name}`.`{clean_table}`;"
    _, desc_out, _ = await loop.run_in_executor(
        None, PhoneRemoteDriver.exec_ssh_quick, f"mariadb -u root -e {shlex.quote(desc_sql)} --batch --raw", 10
    )
    columns = []
    for line in desc_out.strip().splitlines()[1:]:
        p = line.split("\t")
        if p:
            columns.append({"field": p[0], "type": p[1] if len(p) > 1 else "", "null": p[2] if len(p) > 2 else ""})

    # 2. Get total rows
    cnt_sql = f"SELECT COUNT(*) FROM `{db_name}`.`{clean_table}`;"
    _, cnt_out, _ = await loop.run_in_executor(
        None, PhoneRemoteDriver.exec_ssh_quick, f"mariadb -u root -e {shlex.quote(cnt_sql)} --batch --skip-column-names", 10
    )
    total_rows = int(cnt_out.strip()) if cnt_out.strip().isdigit() else 0

    # 3. Get rows
    data_sql = f"SELECT * FROM `{db_name}`.`{clean_table}` LIMIT {limit} OFFSET {offset};"
    _, data_out, _ = await loop.run_in_executor(
        None, PhoneRemoteDriver.exec_ssh_quick, f"mariadb -u root -e {shlex.quote(data_sql)} --batch --raw", 15
    )

    rows = []
    lines = data_out.strip().splitlines()
    if len(lines) > 1:
        header = lines[0].split("\t")
        for l in lines[1:]:
            cells = l.split("\t")
            row_dict = {header[i]: cells[i] if i < len(cells) else None for i in range(len(header))}
            rows.append(row_dict)

    return {
        "database": db_name,
        "table": clean_table,
        "columns": columns,
        "rows": rows,
        "total_rows": total_rows,
        "page": page,
        "limit": limit,
    }


@router.post("/{identifier}/db/query", dependencies=[Depends(require_management_access)])
async def execute_sql_query(identifier: str, req: DbQueryRequest) -> dict:
    rec = _get_deployment_or_404(identifier)
    raw_query = req.query.strip()
    if not raw_query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # Guard: prevent touching other databases or mysql system table
    blocked = [r"\buse\s+(mysql|information_schema|performance_schema)\b", r"\bdrop\s+database\b"]
    for b in blocked:
        if re.search(b, raw_query, re.IGNORECASE):
            raise HTTPException(status_code=403, detail="Direct modification of system databases is prohibited.")

    db_name = await _resolve_project_db_name(rec.project_id, rec.target)
    scoped_sql = f"USE `{db_name}`;\n{raw_query}"

    loop = asyncio.get_running_loop()
    start = time.time()
    cmd = f"mariadb -u root -e {shlex.quote(scoped_sql)} --batch --raw 2>&1"
    code, out, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, cmd, 20)
    elapsed = round(time.time() - start, 3)

    audit_logger.record(
        action="DB_QUERY",
        project_id=rec.project_id,
        actor="operator",
        details=f"SQL: {raw_query[:50]} ({elapsed}s)",
        status="SUCCESS" if code == 0 and not out.startswith("ERROR") else "FAILED",
    )

    if code != 0 or out.startswith("ERROR"):
        return {
            "success": False,
            "error": out.strip(),
            "execution_time_sec": elapsed,
        }

    lines = out.strip().splitlines()
    if not lines:
        return {
            "success": True,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "message": "Query executed successfully with no output (e.g. DDL / UPDATE).",
            "execution_time_sec": elapsed,
        }

    header = lines[0].split("\t")
    rows = []
    for l in lines[1:]:
        cells = l.split("\t")
        row_dict = {header[i]: cells[i] if i < len(cells) else None for i in range(len(header))}
        rows.append(row_dict)

    return {
        "success": True,
        "columns": header,
        "rows": rows,
        "row_count": len(rows),
        "execution_time_sec": elapsed,
    }


def _sqlite_to_mysql_sql(sqlite_path: Path) -> tuple[list[str], int, str]:
    """Reads tables and rows from a local SQLite database and converts to MariaDB INSERT statements."""
    conn = sqlite3.connect(str(sqlite_path))
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations';")
    tables = [row[0] for row in cursor.fetchall()]

    statements = []
    total_rows = 0
    synced_tables = []

    for table in tables:
        cursor.execute(f"SELECT * FROM `{table}`;")
        rows = cursor.fetchall()
        if not rows:
            continue
        cursor.execute(f"PRAGMA table_info(`{table}`);")
        cols = [col[1] for col in cursor.fetchall()]
        cols_str = ", ".join(f"`{c}`" for c in cols)

        for row in rows:
            vals = []
            for v in row:
                if v is None:
                    vals.append("NULL")
                elif isinstance(v, (int, float)):
                    vals.append(str(v))
                else:
                    escaped = str(v).replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r")
                    vals.append(f"'{escaped}'")
            statements.append(f"INSERT IGNORE INTO `{table}` ({cols_str}) VALUES ({', '.join(vals)});")
            total_rows += 1
        synced_tables.append(table)

    conn.close()
    return synced_tables, total_rows, "\n".join(statements)


@router.post("/{identifier}/db/sync-local")
async def sync_local_database(identifier: str) -> dict:
    """Clones local PC SQLite or .sql records or seeds directly into the phone's live MariaDB schema."""
    rec = _get_deployment_or_404(identifier)
    local_dir = PROJECTS_DIR / rec.project_id
    db_name = await _resolve_project_db_name(rec.project_id, rec.target)
    loop = asyncio.get_running_loop()

    synced_sources = []
    total_records = 0

    # 1. Check for local SQLite file (e.g. database/database.sqlite)
    sqlite_file = local_dir / "database" / "database.sqlite"
    if not sqlite_file.exists():
        sqlite_file = local_dir / "database.sqlite"

    if sqlite_file.exists():
        try:
            tables, count, sql_str = _sqlite_to_mysql_sql(sqlite_file)
            if sql_str.strip():
                full_sql = f"USE `{db_name}`;\nSET FOREIGN_KEY_CHECKS=0;\n{sql_str}\nSET FOREIGN_KEY_CHECKS=1;"
                b64_sql = base64.b64encode(full_sql.encode("utf-8")).decode("ascii")
                cmd = f"echo {b64_sql} | base64 -d | mariadb -u root 2>&1"
                code, out, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, cmd, 30)
                if code == 0:
                    synced_sources.append(f"SQLite ({len(tables)} tables, {count} records)")
                    total_records += count
        except Exception as e:
            pass

    # 2. Check for any .sql dump file in project
    sql_files = list(local_dir.glob("*.sql")) + list((local_dir / "database").glob("*.sql"))
    for s_file in sql_files[:2]:
        try:
            sql_content = s_file.read_text(encoding="utf-8", errors="replace")
            if sql_content.strip():
                scoped_sql = f"USE `{db_name}`;\nSET FOREIGN_KEY_CHECKS=0;\n{sql_content}\nSET FOREIGN_KEY_CHECKS=1;"
                b64_dump = base64.b64encode(scoped_sql.encode("utf-8")).decode("ascii")
                cmd = f"echo {b64_dump} | base64 -d | mariadb -u root 2>&1"
                code, out, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, cmd, 45)
                if code == 0:
                    synced_sources.append(f"{s_file.name}")
        except Exception:
            pass

    # 3. Run Laravel seeder on phone to populate demo records
    if rec.target == "phone":
        remote_app_dir = f"/data/data/com.termux/files/home/apps/{rec.project_id}"
        seed_cmd = f"cd {remote_app_dir} && php artisan db:seed --force 2>&1"
        code_seed, out_seed, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, seed_cmd, 30)
        if code_seed == 0:
            synced_sources.append("DatabaseSeeder (seeded demo records)")

    if not synced_sources:
        return {
            "status": "NO_LOCAL_DATA",
            "message": "No local SQLite database or .sql dumps found. You can import a custom .sql file using the Import button.",
            "synced_sources": [],
            "total_records": 0,
        }

    return {
        "status": "SYNCED",
        "message": f"Successfully synced local data into live schema `{db_name}`!",
        "synced_sources": synced_sources,
        "total_records": total_records,
    }


@router.post("/{identifier}/db/import-sql")
async def import_sql_dump(identifier: str, file: UploadFile = File(...)) -> dict:
    """Imports an uploaded .sql dump file directly into the deployment's live MariaDB schema."""
    rec = _get_deployment_or_404(identifier)
    if not file.filename or not file.filename.lower().endswith(".sql"):
        raise HTTPException(status_code=400, detail="Only .sql files are supported for database import.")

    content_bytes = await file.read()
    if len(content_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50 MB).")

    db_name = await _resolve_project_db_name(rec.project_id, rec.target)
    sql_text = content_bytes.decode("utf-8", errors="replace")

    # Compatibility Transforms:
    # 1. Convert 'CREATE TABLE ...' to 'CREATE TABLE IF NOT EXISTS ...' so already-migrated tables don't crash
    sql_text = re.sub(r"\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\b)", "CREATE TABLE IF NOT EXISTS ", sql_text, flags=re.IGNORECASE)
    # 2. Convert 'INSERT INTO' to 'INSERT IGNORE INTO' to gracefully bypass duplicate primary keys
    sql_text = re.sub(r"\bINSERT\s+INTO\s+", "INSERT IGNORE INTO ", sql_text, flags=re.IGNORECASE)

    scoped_sql = f"USE `{db_name}`;\nSET FOREIGN_KEY_CHECKS=0;\n{sql_text}\nSET FOREIGN_KEY_CHECKS=1;"
    b64_sql = base64.b64encode(scoped_sql.encode("utf-8")).decode("ascii")

    loop = asyncio.get_running_loop()
    # Use -f (--force) flag so MariaDB continues executing remaining insert statements even if minor DDL notices occur
    cmd = f"echo {b64_sql} | base64 -d | mariadb -u root -f 2>&1"
    code, out, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, cmd, 90)

    # Filter out ignorable DDL notices (e.g. phpMyAdmin trying to re-add existing primary keys or indexes)
    IGNORABLE_NOTICES = [
        "already exists",
        "multiple primary key defined",
        "duplicate key name",
        "duplicate column name",
        "duplicate entry",
        "warning",
    ]
    filtered_errors = [
        line for line in out.strip().splitlines()
        if "ERROR" in line and not any(ign in line.lower() for ign in IGNORABLE_NOTICES)
    ]

    if filtered_errors:
        return {
            "success": False,
            "error": "\n".join(filtered_errors[:10]),
        }

    return {
        "success": True,
        "message": f"Successfully imported '{file.filename}' into database `{db_name}` (tables & data populated).",
    }


@router.get("/{identifier}/db/export-sql")
async def export_sql_dump(identifier: str):
    """Exports and downloads a complete .sql backup dump of the live phone database."""
    rec = _get_deployment_or_404(identifier)
    db_name = await _resolve_project_db_name(rec.project_id, rec.target)

    loop = asyncio.get_running_loop()
    cmd = f"mariadb-dump -u root '{db_name}' 2>/dev/null || mysqldump -u root '{db_name}' 2>/dev/null"
    code, out, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, cmd, 60)

    if not out.strip() or code != 0:
        raise HTTPException(status_code=500, detail="Failed to dump live database.")

    filename = f"{rec.project_name}_{db_name}_{time.strftime('%Y%m%d_%H%M%S')}.sql"
    return Response(
        content=out,
        media_type="application/sql",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""},
    )


# ==========================================
# 4. 🔐 LIVE ENVIRONMENT & SECRETS MANAGER
# ==========================================

SECRET_KEY_KEYWORDS = ["KEY", "SECRET", "PASS", "TOKEN", "PWD", "AUTH", "SALT", "PRIVATE"]


@router.get("/{identifier}/env")
async def get_env_variables(identifier: str) -> dict:
    rec = _get_deployment_or_404(identifier)
    content = ""
    if rec.target == "phone":
        remote_env = f"/data/data/com.termux/files/home/apps/{rec.project_id}/.env"
        loop = asyncio.get_running_loop()
        code, out, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, f"cat {remote_env} 2>/dev/null", 5)
        if code == 0:
            content = out
    else:
        local_env = PROJECTS_DIR / rec.project_id / ".env"
        if local_env.exists():
            content = local_env.read_text(encoding="utf-8", errors="replace")

    env_items = []
    for line in content.splitlines():
        line_str = line.strip()
        if not line_str or line_str.startswith("#") or "=" not in line_str:
            continue
        k, v = line_str.split("=", 1)
        k_clean = k.strip()
        v_clean = v.strip().strip("'").strip('"')
        is_sec = any(kw in k_clean.upper() for kw in SECRET_KEY_KEYWORDS)
        env_items.append({
            "key": k_clean,
            "value": v_clean,
            "is_secret": is_sec,
        })

    return {
        "project_id": rec.project_id,
        "env_items": env_items,
        "total_variables": len(env_items),
    }


@router.post("/{identifier}/env", dependencies=[Depends(require_management_access)])
async def update_env_variables(identifier: str, req: EnvUpdateRequest) -> dict:
    rec = _get_deployment_or_404(identifier)
    sanitized: Dict[str, str] = {}

    for k, v in req.env.items():
        k_str = re.sub(r"[^a-zA-Z0-9_]", "", str(k).strip())
        if not k_str:
            continue
        v_str = str(v).replace("\r", "").replace("\n", "")
        sanitized[k_str] = v_str

    if not sanitized:
        raise HTTPException(status_code=400, detail="No valid environment variables provided.")

    env_lines = [f"{k}={v}" for k, v in sanitized.items()]
    new_content = "\n".join(env_lines) + "\n"

    if rec.target == "phone":
        b64_content = base64.b64encode(new_content.encode("utf-8")).decode("ascii")
        remote_app_dir = f"/data/data/com.termux/files/home/apps/{rec.project_id}"
        write_cmd = (
            f"echo {b64_content} | base64 -d > {remote_app_dir}/.env && "
            f"cd {remote_app_dir} && php artisan config:clear 2>/dev/null || true && php artisan cache:clear 2>/dev/null || true"
        )
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, write_cmd, 15)

        # Hot restart application process to reload variables into runtime memory
        restart_res = await orchestrator.restart_project(rec.project_id)
        return {
            "status": "HOT_RELOADED",
            "message": "Environment variables saved and server hot-restarted.",
            "live_url": restart_res.get("live_url", rec.live_url),
        }
    else:
        local_env = PROJECTS_DIR / rec.project_id / ".env"
        local_env.write_text(new_content, encoding="utf-8")
        return {
            "status": "SAVED",
            "message": "Environment variables saved locally.",
        }


# ==========================================
# 5. 🛡️ 24/7 HEALTH WATCHDOG
# ==========================================


@router.get("/watchdog/status")
async def get_watchdog_status() -> dict:
    return watchdog.get_status()


@router.post("/watchdog/toggle")
async def toggle_watchdog() -> dict:
    new_state = watchdog.toggle()
    return {"enabled": new_state, "status": "ACTIVE" if new_state else "PAUSED"}
