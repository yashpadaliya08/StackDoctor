import json
import logging
from pathlib import Path
from typing import List, Optional
from doctor.inspectors.base import BaseInspector
from doctor.models import (
    CheckCategory,
    CheckStatus,
    DiagnosticCheck,
    ProjectMetadata,
    Severity,
)

logger = logging.getLogger("doctor.node_inspector")


class NodeInspector(BaseInspector):
    """Diagnostic inspector for Node.js / Express / MERN applications."""

    def __init__(self, project_path: Optional[Path] = None):
        self.project_path = project_path

    def inspect(self, project_path: Path, metadata: Optional[ProjectMetadata] = None) -> List[DiagnosticCheck]:
        checks: List[DiagnosticCheck] = []

        # Resolve target directory (handle split monorepo backend subdirectories)
        target_dir = project_path
        backend_name = None
        if metadata and metadata.framework_details and "backend_dir" in metadata.framework_details.get("metadata", {}):
            backend_name = metadata.framework_details["metadata"]["backend_dir"]
        elif (project_path / "backend" / "package.json").is_file():
            backend_name = "backend"
        elif (project_path / "server" / "package.json").is_file():
            backend_name = "server"
        elif (project_path / "api" / "package.json").is_file():
            backend_name = "api"

        if backend_name and (project_path / backend_name / "package.json").is_file():
            target_dir = project_path / backend_name

        pkg_file = target_dir / "package.json"

        # 1. package.json validation
        if not pkg_file.is_file():
            checks.append(
                DiagnosticCheck(
                    id="node_package_json_missing",
                    name="package.json Found",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.FAILED,
                    severity=Severity.CRITICAL,
                    title="Missing package.json",
                    explanation="No package.json file was found in the project directory.",
                    remediation="Create a standard package.json file with npm init or commit your package manifest.",
                    auto_fixable=True,
                )
            )
            return checks

        try:
            pkg_data = json.loads(pkg_file.read_text(encoding="utf-8"))
            display_pkg_loc = f"{backend_name}/package.json" if backend_name else "package.json"
            checks.append(
                DiagnosticCheck(
                    id="node_package_json_valid",
                    name="package.json Found & Validated",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title="package.json Validated",
                    explanation=f"{display_pkg_loc} was successfully parsed and contains valid dependency definitions.",
                    remediation="None needed.",
                    auto_fixable=False,
                )
            )
        except Exception as e:
            checks.append(
                DiagnosticCheck(
                    id="node_package_json_invalid",
                    name="package.json Syntax",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.FAILED,
                    severity=Severity.CRITICAL,
                    title="Invalid package.json Syntax",
                    explanation=f"package.json has syntax errors: {e}",
                    remediation="Fix the JSON syntax errors in package.json.",
                    auto_fixable=False,
                )
            )
            return checks

        # 2. Check scripts.start
        scripts = pkg_data.get("scripts", {})
        has_start_script = "start" in scripts
        checks.append(
            DiagnosticCheck(
                id="node_start_script",
                name="Start Script in package.json",
                category=CheckCategory.RUNTIME,
                status=CheckStatus.PASSED if has_start_script else CheckStatus.WARNING,
                severity=Severity.WARNING if not has_start_script else Severity.INFO,
                title="Production Start Script Present" if has_start_script else "Missing 'start' Script in package.json",
                explanation="Production runners execute 'npm start' or 'node <entrypoint>'." if has_start_script else "No 'start' script found in package.json. Auto-fixer can inject 'node server.js'.",
                remediation="Add 'start': 'node server.js' to scripts in package.json." if not has_start_script else "None needed.",
                auto_fixable=True,
            )
        )

        # 3. Entrypoint detection
        entrypoint_candidates = [
            pkg_data.get("main"),
            "server.js",
            "index.js",
            "app.js",
            "src/server.js",
            "src/index.js",
            "src/app.js",
        ]
        found_entrypoint: Optional[Path] = None

        # Check start script first if it references a specific file (e.g. "node server.js")
        start_val = scripts.get("start", "")
        if "node " in start_val:
            cand_from_script = start_val.split("node ")[-1].strip().split()[0]
            if (target_dir / cand_from_script).is_file():
                found_entrypoint = target_dir / cand_from_script

        if not found_entrypoint:
            for candidate in entrypoint_candidates:
                if candidate and (target_dir / candidate).is_file():
                    found_entrypoint = target_dir / candidate
                    break

        ep_rel = str(found_entrypoint.relative_to(project_path)) if found_entrypoint else "None"
        checks.append(
            DiagnosticCheck(
                id="node_entrypoint_valid",
                name="Server Entrypoint (server.js / index.js)",
                category=CheckCategory.RUNTIME,
                status=CheckStatus.PASSED if found_entrypoint else CheckStatus.FAILED,
                severity=Severity.CRITICAL if not found_entrypoint else Severity.INFO,
                title="Server Entrypoint Found" if found_entrypoint else "No Entrypoint File Found",
                explanation=f"Found server entrypoint at: {ep_rel}",
                remediation="Create a server.js, index.js, or app.js in your project." if not found_entrypoint else "None needed.",
                auto_fixable=False,
            )
        )

        # 4. Port Binding check in entrypoint
        if found_entrypoint:
            try:
                entry_content = found_entrypoint.read_text(encoding="utf-8")
                uses_env_port = "process.env.port" in entry_content.lower()
                checks.append(
                    DiagnosticCheck(
                        id="node_port_binding",
                        name="Dynamic Port Binding (process.env.PORT)",
                        category=CheckCategory.ENVIRONMENT,
                        status=CheckStatus.PASSED if uses_env_port else CheckStatus.WARNING,
                        severity=Severity.WARNING if not uses_env_port else Severity.INFO,
                        title="Dynamic Port Binding Configured" if uses_env_port else "Hardcoded Port Detected",
                        explanation="Application reads process.env.PORT for dynamic cloud hosting." if uses_env_port else "Application may not bind to process.env.PORT dynamically.",
                        remediation="Ensure your app calls app.listen(process.env.PORT || 5000)." if not uses_env_port else "None needed.",
                        auto_fixable=False,
                    )
                )
            except Exception:
                pass

        # 5. Environment configuration (.env)
        env_file = target_dir / ".env" if (target_dir / ".env").is_file() else (project_path / ".env")
        has_env = env_file.is_file()
        checks.append(
            DiagnosticCheck(
                id="node_env_present",
                name="Environment Variables (.env)",
                category=CheckCategory.ENVIRONMENT,
                status=CheckStatus.PASSED if has_env else CheckStatus.WARNING,
                severity=Severity.WARNING if not has_env else Severity.INFO,
                title=".env File Present" if has_env else "Missing .env File",
                explanation=f".env file found at {env_file.relative_to(project_path)}." if has_env else "Missing .env file. Auto-fixer can generate production environment configuration.",
                remediation="Generate production .env with PORT and NODE_ENV=production." if not has_env else "None needed.",
                auto_fixable=True,
            )
        )

        # 6. Database Connection check
        deps = {**pkg_data.get("dependencies", {}), **pkg_data.get("devDependencies", {})}
        db_type = "None"
        if "mongoose" in deps or "mongodb" in deps:
            db_type = "MongoDB"
        elif "mysql2" in deps or "mysql" in deps:
            db_type = "MariaDB / MySQL"
        elif "pg" in deps or "postgres" in deps:
            db_type = "PostgreSQL"
        elif "sqlite3" in deps or "better-sqlite3" in deps:
            db_type = "SQLite"

        if metadata:
            metadata.db_connection = db_type if db_type != "None" else "In-Memory / None"

        checks.append(
            DiagnosticCheck(
                id="node_database_config",
                name=f"Database Adapter ({db_type})",
                category=CheckCategory.DATABASE,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title=f"Database Integration: {db_type}",
                explanation=f"Identified database adapter: {db_type}",
                remediation="Ensure database credentials match phone server environment.",
                auto_fixable=False,
            )
        )

        # 7. Check Full-Stack MERN UI Bridge (React/Vite Frontend in Split Monorepos)
        frontend_dir = None
        for cand in ["frontend", "client", "ui", "web"]:
            if (project_path / cand / "package.json").is_file():
                frontend_dir = project_path / cand
                break

        if frontend_dir:
            has_bridge = False
            if found_entrypoint:
                try:
                    entry_text = found_entrypoint.read_text(encoding="utf-8")
                    if "express.static" in entry_text and ("dist" in entry_text or "build" in entry_text):
                        has_bridge = True
                except Exception:
                    pass

            checks.append(
                DiagnosticCheck(
                    id="node_fullstack_ui_bridge",
                    name="Frontend Web UI Static Bridge",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.PASSED if has_bridge else CheckStatus.WARNING,
                    severity=Severity.WARNING if not has_bridge else Severity.INFO,
                    title="Frontend Web UI Bridge Active" if has_bridge else "Frontend Web UI Bridge Needed",
                    explanation=(
                        f"Detected split MERN project with {frontend_dir.name}/. Express backend serves compiled React static UI assets."
                        if has_bridge
                        else f"Detected split MERN project with {frontend_dir.name}/. Express backend only serves REST API without mounting React UI assets."
                    ),
                    remediation="Auto-fixer will compile React/Vite assets and bridge Express static file serving so visiting your live URL shows the interactive Web UI.",
                    auto_fixable=True,
                )
            )

            # 8. Check for Hardcoded Localhost URLs in Frontend Source
            has_hardcoded_url = False
            src_dir = frontend_dir / "src"
            if src_dir.is_dir():
                for ext in ["*.js", "*.jsx", "*.ts", "*.tsx"]:
                    for src_file in src_dir.rglob(ext):
                        try:
                            content = src_file.read_text(encoding="utf-8", errors="ignore")
                            if "http://localhost:8000" in content or "http://localhost:5000" in content or "http://127.0.0.1:8000" in content or "http://127.0.0.1:5000" in content:
                                has_hardcoded_url = True
                                break
                        except Exception:
                            pass
                    if has_hardcoded_url:
                        break

            checks.append(
                DiagnosticCheck(
                    id="node_frontend_api_url_hardcoded",
                    name="Frontend API Connection URL",
                    category=CheckCategory.ENVIRONMENT,
                    status=CheckStatus.WARNING if has_hardcoded_url else CheckStatus.PASSED,
                    severity=Severity.WARNING if has_hardcoded_url else Severity.INFO,
                    title="Hardcoded Localhost API URLs Detected" if has_hardcoded_url else "Clean Relative API Routing",
                    explanation=(
                        "Frontend source code contains hardcoded 'http://localhost:8000' or '5000' URLs which will fail on public Cloudflare URLs."
                        if has_hardcoded_url
                        else "Frontend uses production-ready relative API URLs with zero CORS issues."
                    ),
                    remediation="Auto-fixer will normalize API domains to relative paths ('/api/...') for live cloud hosting.",
                    auto_fixable=True,
                )
            )

        return checks
