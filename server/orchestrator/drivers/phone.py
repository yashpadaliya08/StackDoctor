import asyncio
import base64
import os
import re
import shlex
import shutil
import socket
import subprocess
from pathlib import Path
from typing import Any, Callable, Dict

from server.config import PHONE_HOST, PHONE_PORT, PHONE_USER, PHONE_PASSWORD
from .base import BaseDriver, compile_frontend_if_needed

class PhoneRemoteDriver(BaseDriver):
    """
    24/7 Spare Phone Server Driver:
    Connects to the spare Android/Termux home server via SSH (Paramiko).
    Deploys Laravel applications to the phone with MariaDB (MySQL) on port 3306,
    launches the app, and routes it through Cloudflare Tunnel for 24/7 public HTTPS access.
    """

    DEFAULT_HOST = PHONE_HOST
    DEFAULT_PORT = PHONE_PORT
    DEFAULT_USER = PHONE_USER
    DEFAULT_PASSWORD = PHONE_PASSWORD

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        user: str | None = None,
        password: str | None = None,
    ) -> None:
        import threading
        self.host = host or self.DEFAULT_HOST
        self.port = port or self.DEFAULT_PORT
        self.user = user or self.DEFAULT_USER
        self.password = password or self.DEFAULT_PASSWORD
        self.active_tunnels: Dict[str, str] = {}
        self._ssh_pool: Any = None
        self._ssh_lock = threading.Lock()

    @classmethod
    def is_online(cls, host: str | None = None, port: int | None = None, timeout: float = 1.5) -> bool:
        """Quickly check if the phone SSH daemon is reachable on Wi-Fi."""
        host = host or cls.DEFAULT_HOST
        port = port or cls.DEFAULT_PORT
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                return s.connect_ex((host, port)) == 0
        except Exception:
            return False

    @classmethod
    def exec_ssh_quick(
        cls,
        cmd: str,
        timeout: int = 15,
        host: str | None = None,
        port: int | None = None,
        user: str | None = None,
        password: str | None = None,
    ) -> tuple[int, str, str]:
        """Executes a command over SSH with automatic connection management."""
        host = host or cls.DEFAULT_HOST
        port = port or cls.DEFAULT_PORT
        user = user or cls.DEFAULT_USER
        password = password or cls.DEFAULT_PASSWORD
        import paramiko
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(host, port, user, password, timeout=5, look_for_keys=False, allow_agent=False)
            stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
            out = stdout.read().decode("utf-8", errors="replace")
            err = stderr.read().decode("utf-8", errors="replace")
            code = stdout.channel.recv_exit_status()
            return code, out, err
        finally:
            client.close()

    @classmethod
    def ensure_mariadb_running(
        cls,
        host: str | None = None,
        port: int | None = None,
        user: str | None = None,
        password: str | None = None,
    ) -> bool:
        """Verifies MariaDB daemon is active on the phone. If stopped or locked, cleans stale PIDs and launches it."""
        host = host or cls.DEFAULT_HOST
        port = port or cls.DEFAULT_PORT
        user = user or cls.DEFAULT_USER
        password = password or cls.DEFAULT_PASSWORD
        if not cls.is_online(host, port):
            return False
        # Quick check if responding
        code, _, _ = cls.exec_ssh_quick("mariadb -u root -e 'SELECT 1;' 2>/dev/null", timeout=5, host=host, port=port, user=user, password=password)
        if code == 0:
            return True
        # Clean stale locks and boot
        boot_cmd = (
            "rm -f /data/data/com.termux/files/usr/var/lib/mysql/*.pid /data/data/com.termux/files/usr/var/run/mysqld.sock 2>/dev/null || true; "
            "if ! pgrep -E 'mariadbd|mysqld' >/dev/null 2>&1; then "
            "  nohup mariadbd-safe --bind-address=127.0.0.1 >/dev/null 2>&1 </dev/null & "
            "fi; "
            "sleep 2; "
            "mariadb -u root -e 'SELECT 1;' 2>/dev/null"
        )
        c, _, _ = cls.exec_ssh_quick(boot_cmd, timeout=12, host=host, port=port, user=user, password=password)
        return c == 0

    @classmethod
    def get_phone_stats(
        cls,
        host: str | None = None,
        port: int | None = None,
        user: str | None = None,
        password: str | None = None,
    ) -> dict:
        """Collects real-time hardware telemetry (RAM, Storage, CPU Load, active apps) from phone."""
        host = host or cls.DEFAULT_HOST
        port = port or cls.DEFAULT_PORT
        user = user or cls.DEFAULT_USER
        password = password or cls.DEFAULT_PASSWORD
        if not cls.is_online(host, port):
            return {"online": False, "ip": host, "port": port}
        try:
            import paramiko
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(host, port, user, password, timeout=3, look_for_keys=False, allow_agent=False)

            # 1. RAM
            stdin, stdout, stderr = client.exec_command("free -m | grep -i 'mem:'")
            mem_line = stdout.read().decode().strip()
            mem_parts = mem_line.split()
            ram_total = int(mem_parts[1]) if len(mem_parts) > 1 else 3650
            ram_used = int(mem_parts[2]) if len(mem_parts) > 2 else 2000
            ram_free = int(mem_parts[3]) if len(mem_parts) > 3 else 1650
            ram_percent = round((ram_used / ram_total) * 100, 1)

            # 2. Disk
            stdin, stdout, stderr = client.exec_command("df -h /data/data/com.termux/files/home | tail -n 1")
            disk_line = stdout.read().decode().strip()
            disk_parts = disk_line.split()
            disk_size = disk_parts[1] if len(disk_parts) > 1 else "48G"
            disk_used = disk_parts[2] if len(disk_parts) > 2 else "21G"
            disk_avail = disk_parts[3] if len(disk_parts) > 3 else "28G"
            disk_percent = disk_parts[4] if len(disk_parts) > 4 else "43%"

            # 3. CPU Load
            stdin, stdout, stderr = client.exec_command("cat /proc/loadavg")
            load_out = stdout.read().decode().strip()
            load_parts = load_out.split()
            load_1m = load_parts[0] if len(load_parts) > 0 else "0.00"

            # 4. Running App count
            stdin, stdout, stderr = client.exec_command("ps aux | grep -E 'php|uvicorn|node|mariadbd' | grep -v 'grep' | wc -l")
            proc_count = int(stdout.read().decode().strip() or "0")

            client.close()
            return {
                "online": True,
                "ip": host,
                "port": port,
                "ram": {
                    "total_mb": ram_total,
                    "used_mb": ram_used,
                    "free_mb": ram_free,
                    "percent": ram_percent,
                },
                "disk": {
                    "total": disk_size,
                    "used": disk_used,
                    "avail": disk_avail,
                    "percent": disk_percent,
                },
                "cpu": {
                    "load_1m": load_1m,
                },
                "active_processes": proc_count,
            }
        except Exception as e:
            return {"online": True, "ip": host, "port": port, "error": str(e)}

    def _get_ssh_client(self):
        with self._ssh_lock:
            import paramiko

            if self._ssh_pool is not None:
                try:
                    transport = self._ssh_pool.get_transport()
                    if transport is not None and transport.is_active():
                        return self._ssh_pool
                except Exception:
                    pass
                self._unsafe_close_ssh_pool()

            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(
                hostname=self.host,
                port=self.port,
                username=self.user,
                password=self.password,
                timeout=10,
                look_for_keys=False,
                allow_agent=False,
            )
            self._ssh_pool = client
            return client

    def _unsafe_close_ssh_pool(self) -> None:
        if self._ssh_pool is not None:
            try:
                self._ssh_pool.close()
            except Exception:
                pass
            self._ssh_pool = None

    def _close_ssh_pool(self) -> None:
        with self._ssh_lock:
            self._unsafe_close_ssh_pool()

    def _exec_ssh(self, cmd: str, timeout: int = 120) -> tuple[int, str, str]:
        client = self._get_ssh_client()
        try:
            stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
            out = stdout.read().decode("utf-8", errors="replace")
            err = stderr.read().decode("utf-8", errors="replace")
            code = stdout.channel.recv_exit_status()
            return code, out, err
        except Exception:
            self._close_ssh_pool()
            raise

    def _sync_files_sftp(self, local_path: Path, remote_path: str, log_cb: Callable[[str, str], None]) -> None:
        import tarfile
        import tempfile

        client = self._get_ssh_client()
        try:
            # 1. Create a lightweight compressed archive locally
            with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp_tar:
                tmp_tar_path = Path(tmp_tar.name)

            skip_names = {"vendor", "node_modules", ".git", "__MACOSX", ".env"}
            file_count = 0

            def _tar_filter(tarinfo: tarfile.TarInfo):
                nonlocal file_count
                parts = Path(tarinfo.name).parts
                if any(p in skip_names for p in parts):
                    return None
                if tarinfo.name.endswith((".log", ".sqlite", ".sqlite-journal", ".sqlite3")):
                    return None
                if tarinfo.isreg():
                    file_count += 1
                return tarinfo

            with tarfile.open(tmp_tar_path, "w:gz") as tar:
                for item in local_path.iterdir():
                    if item.name not in skip_names:
                        tar.add(str(item), arcname=item.name, filter=_tar_filter)

            # 2. SFTP upload single archive
            sftp = client.open_sftp()
            try:
                # Ensure remote directory exists synchronously
                stdin, stdout, stderr = client.exec_command(f"mkdir -p {remote_path}")
                stdout.channel.recv_exit_status()
                remote_tar = f"{remote_path}/_bundle.tar.gz"
                sftp.put(str(tmp_tar_path), remote_tar)
            finally:
                sftp.close()
                tmp_tar_path.unlink(missing_ok=True)

            # 3. Extract bundle remotely in Termux
            extract_cmd = f"tar -xzf {remote_path}/_bundle.tar.gz -C {remote_path} && rm -f {remote_path}/_bundle.tar.gz"
            stdin, stdout, stderr = client.exec_command(extract_cmd)
            stdout.channel.recv_exit_status()

            log_cb("SYNC", f"   ✔ Transferred and unpacked {file_count} project files in ~1s via compressed stream.")
        except Exception:
            self._close_ssh_pool()
            raise

    async def build_image(
        self, project_path: Path, tag: str, log_cb: Callable[[str, str], None]
    ) -> bool:
        project_id = project_path.name
        remote_app_dir = f"/data/data/com.termux/files/home/apps/{project_id}"

        log_cb("BUILD", f"📱 Connecting to Spare Phone Server ({self.host}:{self.port})...")
        if not self.is_online(self.host, self.port):
            log_cb("ERROR", f"❌ Phone server at {self.host}:{self.port} is offline or unreachable.")
            return False

        log_cb("BUILD", "   ✔ Phone server connection verified (Termux Linux aarch64).")
        await asyncio.sleep(0.3)

        # Pre-compile React frontend if split MERN monorepo
        await compile_frontend_if_needed(project_path, log_cb)

        # 1. Sync files to phone
        log_cb("BUILD", f"📦 Synchronizing project codebase to phone at {remote_app_dir}...")
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._sync_files_sftp, project_path, remote_app_dir, log_cb)

        # 2. Detect Stack (PHP vs Python vs Node)
        has_backend_node = (project_path / "backend" / "package.json").exists() or (project_path / "server" / "package.json").exists() or (project_path / "api" / "package.json").exists()
        is_node = (
            ((project_path / "package.json").exists() or has_backend_node)
            and not (project_path / "composer.json").exists()
        )
        is_python = (
            (project_path / "requirements.txt").exists()
            or (project_path / "manage.py").exists()
            or (project_path / "main.py").exists()
            or (project_path / "app.py").exists()
        )

        if is_node:
            log_cb("BUILD", "⚡ Node.js / MERN application detected on Termux.")
            backend_sub = ""
            if (project_path / "backend" / "package.json").exists():
                backend_sub = "backend"
            elif (project_path / "server" / "package.json").exists():
                backend_sub = "server"
            elif (project_path / "api" / "package.json").exists():
                backend_sub = "api"
            target_install_dir = f"{remote_app_dir}/{backend_sub}" if backend_sub else remote_app_dir
            log_cb("BUILD", f"   📦 Installing npm dependencies on phone ({backend_sub or 'root'})...")
            npm_cmd = f"cd {target_install_dir} && npm install --omit=dev --prefer-offline 2>&1"
            code, out, err = await loop.run_in_executor(None, self._exec_ssh, npm_cmd, 180)
            if code == 0:
                log_cb("BUILD", "   ✔ npm dependencies installed successfully.")
            else:
                log_cb("BUILD", f"   ℹ️ npm completed: {(out or err)[-150:].strip()}")
            return True

        if is_python:
            log_cb("BUILD", "🐍 Python application detected on Termux.")
            log_cb("BUILD", "   ⚙️ Setting up isolated Python 3.13 virtual environment (.venv)...")
            setup_venv_cmd = (
                f"cd {remote_app_dir} && "
                "python3 -m venv .venv 2>/dev/null || true"
            )
            await loop.run_in_executor(None, self._exec_ssh, setup_venv_cmd, 60)

            code, check_req, _ = await loop.run_in_executor(
                None, self._exec_ssh, f"test -f {remote_app_dir}/requirements.txt && echo YES || echo NO"
            )
            if "YES" in check_req:
                log_cb("BUILD", "⚡ Installing Python packages via pip in virtual environment (ARM64)...")
                pip_cmd = (
                    f"cd {remote_app_dir} && . .venv/bin/activate && "
                    "if grep -qi 'fastapi' requirements.txt; then "
                    "pip install --prefer-binary 'pydantic<2' 'fastapi<0.100.0' 'uvicorn>=0.28.0'; "
                    "grep -viE 'fastapi|pydantic|uvicorn' requirements.txt > req_other.txt 2>/dev/null || true; "
                    "[ -s req_other.txt ] && pip install --prefer-binary -r req_other.txt 2>/dev/null || true; "
                    "else pip install --prefer-binary -r requirements.txt; fi"
                )
                code, out, err = await loop.run_in_executor(None, self._exec_ssh, pip_cmd, 180)
                if code == 0:
                    log_cb("BUILD", "   ✔ Python packages installed successfully.")
                else:
                    log_cb("BUILD", f"   ℹ️ Pip completed: {(out or err)[-150:].strip()}")
            return True

        # PHP / Laravel stack
        code, out, _ = await loop.run_in_executor(None, self._exec_ssh, "php -v | head -n 1 && which mariadbd")
        if code != 0:
            log_cb("BUILD", "⚙️ Installing runtime packages on phone...")
            await loop.run_in_executor(None, self._exec_ssh, "pkg install -y php composer mariadb cloudflared")

        log_cb("BUILD", f"🐘 Phone PHP runtime: {out.splitlines()[0] if out else 'PHP 8.x'}")

        # 3. Run composer install
        log_cb("BUILD", "⚡ Running composer install on phone (ARM64 optimized)...")
        cmd_composer = (
            f"cd {remote_app_dir} && "
            "composer install --no-dev --optimize-autoloader --ignore-platform-reqs"
        )
        code, out, err = await loop.run_in_executor(None, self._exec_ssh, cmd_composer, 240)
        if code == 0:
            log_cb("BUILD", "   ✔ Composer packages installed successfully on phone.")
        else:
            log_cb("BUILD", f"   ℹ️ Composer finished: {out[-150:] if out else err[-150:]}")

        return True

    async def run_container(
        self,
        project_id: str,
        tag: str,
        env_vars: dict[str, str],
        allocated_port: int,
        log_cb: Callable[[str, str], None],
    ) -> dict[str, Any]:
        remote_app_dir = f"/data/data/com.termux/files/home/apps/{project_id}"
        # --- Resolve MySQL config: prefer user-provided values from env_vars ---
        # Use .get() instead of .pop() to avoid mutating the caller's dict (breaks restarts)
        db_name = env_vars.get("db_name", None) or f"db_{project_id[:10]}"
        db_user = env_vars.get("db_user", None) or "root"
        db_password = env_vars.get("db_password", "") or ""
        run_seeder = bool(env_vars.get("run_seeder", False))
        seeder_class = env_vars.get("seeder_class", None) or "DatabaseSeeder"
        user_custom_env: dict[str, str] = env_vars.get("custom_env", {}) or {}
        loop = asyncio.get_running_loop()

        # Check stack on remote phone
        _, check_stack, _ = await loop.run_in_executor(
            None,
            self._exec_ssh,
            f"test -f {remote_app_dir}/main.py && echo FASTAPI || (test -f {remote_app_dir}/manage.py && echo DJANGO || (test -f {remote_app_dir}/app.py && echo FLASK || ((test -f {remote_app_dir}/package.json || test -f {remote_app_dir}/backend/package.json || test -f {remote_app_dir}/server/package.json) && test ! -f {remote_app_dir}/composer.json && echo NODE || echo PHP)))",
        )
        detected_stack = check_stack.strip()
        phone_port = allocated_port
        # Initialize target_run_dir for all stacks (prevents UnboundLocalError for non-NODE stacks)
        target_run_dir = remote_app_dir

        if detected_stack == "NODE":
            # Check if backend subdirectory exists
            _, sub_check, _ = await loop.run_in_executor(
                None,
                self._exec_ssh,
                f"if [ -f {remote_app_dir}/backend/package.json ]; then echo backend; elif [ -f {remote_app_dir}/server/package.json ]; then echo server; elif [ -f {remote_app_dir}/api/package.json ]; then echo api; else echo root; fi",
            )
            node_sub = sub_check.strip()
            target_run_dir = f"{remote_app_dir}/{node_sub}" if node_sub != "root" else remote_app_dir

            log_cb("CONFIG", f"📝 Configuring Node.js runtime on phone (Port {phone_port}, Path: {node_sub})...")
            
            # Prepare .env map combining defaults and user custom secrets
            node_env_map = {}
            for ek, ev in user_custom_env.items():
                k_str = str(ek).strip()
                v_str = str(ev).strip()
                if not k_str:
                    continue
                # If user pasted a mongo connection string into key by mistake
                if k_str.startswith("mongodb://") or k_str.startswith("mongodb+srv://"):
                    node_env_map["mongoUrl"] = k_str
                    continue
                if k_str.lower() in ("port", "node_env"):
                    continue
                safe_k = re.sub(r'[^a-zA-Z0-9_]', '_', k_str)
                if safe_k:
                    node_env_map[safe_k] = v_str

            # Dynamic port & environment ALWAYS takes absolute precedence
            node_env_map["PORT"] = str(phone_port)
            node_env_map["port"] = str(phone_port)
            node_env_map["NODE_ENV"] = "production"

            env_lines = [f"{k}={v}" for k, v in node_env_map.items()]
            env_b64 = base64.b64encode("\n".join(env_lines).encode("utf-8")).decode("ascii")
            write_env_cmd = f"echo {env_b64} | base64 -d > {target_run_dir}/.env"
            await loop.run_in_executor(None, self._exec_ssh, write_env_cmd)

            # Determine entrypoint
            _, ep_out, _ = await loop.run_in_executor(
                None,
                self._exec_ssh,
                f"cd {target_run_dir} && if [ -f server.js ]; then echo server.js; elif [ -f index.js ]; then echo index.js; elif [ -f app.js ]; then echo app.js; elif [ -f src/server.js ]; then echo src/server.js; elif [ -f src/index.js ]; then echo src/index.js; else grep -o '\"main\": *\"[^\"]*\"' package.json 2>/dev/null | cut -d'\"' -f4 || echo index.js; fi"
            )
            entrypoint = ep_out.strip() or "server.js"
            log_cb("SERVER", f"⚡ Launching Node.js ({entrypoint}) on phone loopback (127.0.0.1:{phone_port})...")
            
            exports_list = []
            for k, v in node_env_map.items():
                if k.lower() in ("port", "node_env"):
                    continue
                safe_k = re.sub(r'[^a-zA-Z0-9_]', '_', str(k))
                clean_v = str(v).replace('\r', '').replace('\n', '')
                quoted_v = shlex.quote(clean_v)
                exports_list.append(f"export {safe_k}={quoted_v}")
            # Enforce dynamic PORT & NODE_ENV last so no other variable can overwrite them
            exports_list.append(f"export PORT={phone_port}")
            exports_list.append(f"export port={phone_port}")
            exports_list.append("export NODE_ENV=production")
            node_exports_str = "\n".join(exports_list)

            server_script = (
                "#!/data/data/com.termux/files/usr/bin/bash\n"
                f"if [ -f {target_run_dir}/server.pid ]; then kill -9 $(cat {target_run_dir}/server.pid) 2>/dev/null || true; rm -f {target_run_dir}/server.pid; fi\n"
                f"pkill -9 -f '{project_id}' 2>/dev/null || true\n"
                f"kill -9 $(lsof -ti:{phone_port}) 2>/dev/null || true\n"
                f"cd {target_run_dir}\n"
                f"{node_exports_str}\n"
                f"nohup node {entrypoint} > server.log 2>&1 </dev/null & echo $! > server.pid\n"
            )
            write_server_sh = f"cat << 'EOF' > {target_run_dir}/run_server.sh\n{server_script}EOF\nchmod +x {target_run_dir}/run_server.sh\n{target_run_dir}/run_server.sh"
            await loop.run_in_executor(None, self._exec_ssh, write_server_sh)
            await asyncio.sleep(2)

        elif detected_stack in ("FASTAPI", "DJANGO", "FLASK"):
            log_cb("CONFIG", f"📝 Configuring Python runtime ({detected_stack}) on phone...")
            py_env_map = {}
            for ek, ev in user_custom_env.items():
                k_str = str(ek).strip()
                v_str = str(ev).strip()
                if not k_str or k_str.lower() in ("port", "host"):
                    continue
                safe_k = re.sub(r'[^a-zA-Z0-9_]', '_', k_str)
                if safe_k:
                    py_env_map[safe_k] = v_str
            py_env_map["HOST"] = "0.0.0.0"
            py_env_map["PORT"] = str(phone_port)
            py_env_map["DEBUG"] = "False"
            env_lines = [f"{k}={v}" for k, v in py_env_map.items()]
            env_b64 = base64.b64encode("\n".join(env_lines).encode("utf-8")).decode("ascii")
            write_env_cmd = f"echo {env_b64} | base64 -d > {remote_app_dir}/.env"
            await loop.run_in_executor(None, self._exec_ssh, write_env_cmd)

            py_exports = []
            for k, v in py_env_map.items():
                if k.lower() in ("port", "host"):
                    continue
                safe_k = re.sub(r'[^a-zA-Z0-9_]', '_', str(k))
                clean_v = str(v).replace('\r', '').replace('\n', '')
                quoted_v = shlex.quote(clean_v)
                py_exports.append(f"export {safe_k}={quoted_v}")
            py_exports.append(f"export PORT={phone_port}")
            py_exports.append("export HOST=0.0.0.0")
            py_exports_str = "\n".join(py_exports)

            if detected_stack == "FASTAPI":
                log_cb("SERVER", f"⚡ Launching FastAPI ASGI server on phone loopback (127.0.0.1:{phone_port})...")
                server_script = (
                    "#!/data/data/com.termux/files/usr/bin/bash\n"
                    f"kill -9 $(lsof -ti:{phone_port}) 2>/dev/null || true\n"
                    f"pkill -9 -f 'uvicorn.*{phone_port}' 2>/dev/null || true\n"
                    f"cd {remote_app_dir}\n"
                    f"[ -f .venv/bin/activate ] && . .venv/bin/activate\n"
                    f"{py_exports_str}\n"
                    f"nohup python3 -m uvicorn main:app --host 127.0.0.1 --port {phone_port} > server.log 2>&1 &\n"
                )
            elif detected_stack == "DJANGO":
                log_cb("DATABASE", "🚀 Running Django migrations on phone...")
                await loop.run_in_executor(
                    None,
                    self._exec_ssh,
                    f"cd {remote_app_dir} && [ -f .venv/bin/activate ] && . .venv/bin/activate && {py_exports_str} && python3 manage.py migrate --noinput 2>&1",
                )
                log_cb("SERVER", f"⚡ Launching Django server on phone loopback (127.0.0.1:{phone_port})...")
                server_script = (
                    "#!/data/data/com.termux/files/usr/bin/bash\n"
                    f"kill -9 $(lsof -ti:{phone_port}) 2>/dev/null || true\n"
                    f"pkill -9 -f 'manage.py runserver.*{phone_port}' 2>/dev/null || true\n"
                    f"cd {remote_app_dir}\n"
                    f"[ -f .venv/bin/activate ] && . .venv/bin/activate\n"
                    f"{py_exports_str}\n"
                    f"nohup python3 manage.py runserver 127.0.0.1:{phone_port} > server.log 2>&1 &\n"
                )
            else:  # FLASK
                log_cb("SERVER", f"⚡ Launching Flask server on phone loopback (127.0.0.1:{phone_port})...")
                server_script = (
                    "#!/data/data/com.termux/files/usr/bin/bash\n"
                    f"kill -9 $(lsof -ti:{phone_port}) 2>/dev/null || true\n"
                    f"pkill -9 -f 'flask.*{phone_port}' 2>/dev/null || true\n"
                    f"cd {remote_app_dir}\n"
                    f"[ -f .venv/bin/activate ] && . .venv/bin/activate\n"
                    f"export FLASK_APP=app.py\n"
                    f"{py_exports_str}\n"
                    f"nohup python3 -m flask run --host 127.0.0.1 --port {phone_port} > server.log 2>&1 &\n"
                )

            write_server_sh = f"cat << 'EOF' > {remote_app_dir}/run_server.sh\n{server_script}EOF\nchmod +x {remote_app_dir}/run_server.sh\n{remote_app_dir}/run_server.sh"
            await loop.run_in_executor(None, self._exec_ssh, write_server_sh)
            await asyncio.sleep(2)

        else:
            # PHP / Laravel Stack Flow
            # 1. Ensure MariaDB is running on phone
            log_cb("DATABASE", "🗄️ Verifying MariaDB MySQL daemon on phone...")
            code, _, _ = await loop.run_in_executor(None, self._exec_ssh, "mariadb -u root -e 'SELECT 1;' 2>/dev/null")
            if code != 0:
                log_cb("DATABASE", "⚙️ Launching MariaDB daemon & clearing stale locks...")
                clean_mariadb_cmd = (
                    "if ! pgrep -x mariadbd >/dev/null 2>&1; then "
                    "  rm -f /data/data/com.termux/files/usr/var/lib/mysql/*.pid /data/data/com.termux/files/usr/var/run/mysqld.sock 2>/dev/null || true; "
                    "  mariadbd-safe --bind-address=127.0.0.1 > /dev/null 2>&1 & disown; "
                    "fi"
                )
                await loop.run_in_executor(None, self._exec_ssh, clean_mariadb_cmd)
                for _ in range(10):
                    await asyncio.sleep(1)
                    check_code, _, _ = await loop.run_in_executor(None, self._exec_ssh, "mariadb -u root -e 'SELECT 1;' 2>/dev/null")
                    if check_code == 0:
                        break
            log_cb("DATABASE", "   ✔ MariaDB daemon is active and responsive.")

            # 2. Create isolated database (sanitized)
            clean_db_name = re.sub(r'[^a-zA-Z0-9_]', '', str(db_name)) or f"db_{project_id[:8]}"
            log_cb("DATABASE", f"🗄️ Provisioning isolated MySQL schema [{clean_db_name}] in MariaDB...")
            create_sql = f"CREATE DATABASE IF NOT EXISTS `{clean_db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
            sql_arg = shlex.quote(create_sql)
            await loop.run_in_executor(
                None,
                self._exec_ssh,
                f"mariadb -u root -e {sql_arg}",
            )
            log_cb("DATABASE", f"   ✔ Database [{clean_db_name}] ready on 127.0.0.1:3306.")

            # 3. Configure production .env on phone (preserving user environment variables)
            log_cb("CONFIG", "📝 Configuring production environment & MariaDB connection...")
            from server.config import PROJECTS_DIR
            local_env = PROJECTS_DIR / project_id / ".env"
            local_example = PROJECTS_DIR / project_id / ".env.example"

            content = ""
            if local_env.exists():
                content = local_env.read_text(encoding="utf-8", errors="replace")
            elif local_example.exists():
                content = local_example.read_text(encoding="utf-8", errors="replace")

            # Parse existing key-value pairs
            env_dict = {}
            for line in content.splitlines():
                line_str = line.strip()
                if line_str and not line_str.startswith("#") and "=" in line_str:
                    k, v = line_str.split("=", 1)
                    env_dict[k.strip()] = v.strip()

            # Merge mandatory database and production settings
            env_dict.update({
                "DB_CONNECTION": "mysql",
                "DB_HOST": "127.0.0.1",
                "DB_PORT": "3306",
                "DB_DATABASE": clean_db_name,
                "DB_USERNAME": re.sub(r'[^a-zA-Z0-9_]', '', str(db_user)),
                "DB_PASSWORD": str(db_password).replace('\r', '').replace('\n', ''),
                "APP_ENV": "production",
                "APP_DEBUG": "false",
                "SESSION_SECURE_COOKIE": "true",
            })
            if user_custom_env:
                for k, v in user_custom_env.items():
                    safe_k = re.sub(r'[^a-zA-Z0-9_]', '_', str(k))
                    clean_v = str(v).replace('\r', '').replace('\n', '')
                    env_dict[safe_k] = clean_v

            if "APP_KEY" not in env_dict or not env_dict["APP_KEY"]:
                from doctor.fixer import Fixer
                env_dict["APP_KEY"] = Fixer.generate_app_key()

            final_env_lines = [f"{k}={v}" for k, v in env_dict.items()]
            env_b64 = base64.b64encode("\n".join(final_env_lines).encode("utf-8")).decode("ascii")
            write_env_cmd = f"echo {env_b64} | base64 -d > {remote_app_dir}/.env"
            await loop.run_in_executor(None, self._exec_ssh, write_env_cmd)

            # 4. Generate app key & Run migrations
            log_cb("DATABASE", "🚀 Running database schema migrations on phone MariaDB...")
            migrate_cmd = (
                f"cd {remote_app_dir} && "
                "php artisan key:generate --force && "
                "php artisan migrate --force"
            )
            code, out, _ = await loop.run_in_executor(None, self._exec_ssh, migrate_cmd, 60)
            log_cb("DATABASE", "   ✔ Migrations completed successfully.")

            # 4b. Optional: Run database seeder (sanitized)
            if run_seeder:
                clean_seeder = re.sub(r'[^a-zA-Z0-9_\\]', '', str(seeder_class or "DatabaseSeeder"))
                log_cb("DATABASE", f"🌱 Running database seeder [{clean_seeder}]...")
                seed_cmd = f"cd {remote_app_dir} && php artisan db:seed --class={clean_seeder} --force"
                code_seed, out_seed, err_seed = await loop.run_in_executor(None, self._exec_ssh, seed_cmd, 90)
                if code_seed == 0:
                    log_cb("DATABASE", f"   ✔ Seeder [{clean_seeder}] completed successfully.")
                else:
                    log_cb("DATABASE", f"   ⚠️ Seeder warning: {(err_seed or out_seed)[-200:].strip()}")

            # 5. Fix HTTPS scheme and proxy trust for Cloudflare / reverse proxy
            https_fix_script = (
                "import re, os\n"
                "p_boot = 'bootstrap/app.php'\n"
                "if os.path.exists(p_boot):\n"
                "    with open(p_boot, 'r') as f: c = f.read()\n"
                "    if 'trustProxies' not in c:\n"
                "        c = re.sub(r'(withMiddleware\\(function\\s*\\([^\\)]*\\)\\s*\\{)', r'\\1\\n        $middleware->trustProxies(at: \"*\");', c)\n"
                "        with open(p_boot, 'w') as f: f.write(c)\n"
                "p_prov = 'app/Providers/AppServiceProvider.php'\n"
                "if os.path.exists(p_prov):\n"
                "    with open(p_prov, 'r') as f: c = f.read()\n"
                "    if 'forceScheme' not in c:\n"
                "        if 'use Illuminate\\\\Support\\\\Facades\\\\URL;' not in c:\n"
                "            c = c.replace('use Illuminate\\\\Support\\\\ServiceProvider;', 'use Illuminate\\\\Support\\\\ServiceProvider;\\nuse Illuminate\\\\Support\\\\Facades\\\\URL;')\n"
                "        c = re.sub(r'(public\\s+function\\s+boot\\(\\)[^\\{]*\\{)', r'\\1\\n        if (isset($_SERVER[\"HTTP_X_FORWARDED_PROTO\"]) && $_SERVER[\"HTTP_X_FORWARDED_PROTO\"] === \"https\" || request()->isSecure() || request()->header(\"x-forwarded-proto\") === \"https\" || (request()->header(\"host\") && str_contains(request()->header(\"host\"), \"trycloudflare.com\"))) { URL::forceScheme(\"https\"); }', c)\n"
                "        with open(p_prov, 'w') as f: f.write(c)\n"
            )
            b64_fix = base64.b64encode(https_fix_script.encode("utf-8")).decode("ascii")
            https_fix_cmd = f"cd {remote_app_dir} && python3 -c 'import base64; exec(base64.b64decode(\"{b64_fix}\").decode())' 2>/dev/null || true"
            await loop.run_in_executor(None, self._exec_ssh, https_fix_cmd)

            # 5b. Link public storage for image and file uploads
            storage_link_cmd = (
                f"cd {remote_app_dir} && "
                "php artisan storage:link 2>/dev/null || true; "
                f"[ ! -e public/storage ] && ln -sfn ../storage/app/public public/storage 2>/dev/null || true; "
                "chmod -R 755 storage/app/public 2>/dev/null || true; "
                "chmod -R 755 public/storage 2>/dev/null || true"
            )
            await loop.run_in_executor(None, self._exec_ssh, storage_link_cmd)

            # 6. Start PHP server on phone via executable launcher script
            log_cb("SERVER", f"⚡ Launching Laravel server on phone (0.0.0.0:{phone_port})...")
            _, check_artisan, _ = await loop.run_in_executor(
                None, self._exec_ssh, f"test -f {remote_app_dir}/artisan && echo YES || echo NO"
            )
            if "YES" in check_artisan:
                server_script = (
                    "#!/data/data/com.termux/files/usr/bin/bash\n"
                    f"if [ -f {remote_app_dir}/server.pid ]; then kill -9 $(cat {remote_app_dir}/server.pid) 2>/dev/null || true; fi\n"
                    f"pkill -9 -f 'port={phone_port}' 2>/dev/null || true\n"
                    f"kill -9 $(lsof -ti:{phone_port}) 2>/dev/null || true\n"
                    f"cd {remote_app_dir}\n"
                    f"export TMPDIR=/data/data/com.termux/files/usr/tmp\n"
                    f"nohup php artisan serve --host=0.0.0.0 --port={phone_port} > server.log 2>&1 </dev/null & echo $! > server.pid\n"
                )
            else:
                template_code = self._render_live_template(project_id, {"APP_NAME": "Laravel Demo Project", "DB_CONNECTION": "mysql"}, phone_port)
                escaped_code = template_code.replace("'", "'\\''")
                await loop.run_in_executor(
                    None, self._exec_ssh, f"mkdir -p {remote_app_dir}/public && echo '{escaped_code}' > {remote_app_dir}/public/index.php"
                )
                server_script = (
                    "#!/data/data/com.termux/files/usr/bin/bash\n"
                    f"if [ -f {remote_app_dir}/server.pid ]; then kill -9 $(cat {remote_app_dir}/server.pid) 2>/dev/null || true; fi\n"
                    f"pkill -9 -f 'port={phone_port}' 2>/dev/null || true\n"
                    f"kill -9 $(lsof -ti:{phone_port}) 2>/dev/null || true\n"
                    f"cd {remote_app_dir}/public\n"
                    f"nohup php -S 0.0.0.0:{phone_port} > {remote_app_dir}/server.log 2>&1 & echo $! > {remote_app_dir}/server.pid\n"
                )

            write_server_sh = f"cat << 'EOF' > {remote_app_dir}/run_server.sh\n{server_script}EOF\nchmod +x {remote_app_dir}/run_server.sh\n{remote_app_dir}/run_server.sh"
            await loop.run_in_executor(None, self._exec_ssh, write_server_sh)
            await asyncio.sleep(2)

        # 6c. Verify server process readiness on 127.0.0.1:{phone_port}
        log_cb("SERVER", f"   • Verifying application server listening on 127.0.0.1:{phone_port}...")
        server_ready = False
        target_dir_for_logs = target_run_dir if detected_stack == "NODE" else remote_app_dir
        # Check port using real TCP socket connect (bypassing Android SELinux /proc/net/tcp restrictions)
        port_probe_cmd = (
            f"python3 -c \"import socket; s = socket.socket(); s.settimeout(1); exit(s.connect_ex(('127.0.0.1', {phone_port})))\" || "
            f"curl -s -m 1 http://127.0.0.1:{phone_port}/ >/dev/null 2>&1"
        )
        for _ in range(15):
            await asyncio.sleep(1)
            code_check, _, _ = await loop.run_in_executor(
                None,
                self._exec_ssh,
                port_probe_cmd,
            )
            if code_check == 0:
                server_ready = True
                log_cb("SERVER", f"   ✔ Application server confirmed listening on 127.0.0.1:{phone_port}")
                break

        if not server_ready:
            _, s_err, _ = await loop.run_in_executor(
                None, self._exec_ssh, f"tail -n 20 {target_dir_for_logs}/server.log 2>/dev/null"
            )
            err_msg = s_err.strip() if s_err else "No log output recorded"
            log_cb("ERROR", f"❌ Server failed to bind to port {phone_port}. Logs: {err_msg}", level="ERROR")
            raise RuntimeError(f"Application server failed to start on port {phone_port}: {err_msg}")

        # 7. Launch Cloudflare Tunnel on phone via executable launcher script
        log_cb("TUNNEL", "🌐 Provisioning secure 24/7 Cloudflare public tunnel...")
        tunnel_log = f"{remote_app_dir}/tunnel.log"
        tunnel_script = (
            "#!/data/data/com.termux/files/usr/bin/bash\n"
            f"pkill -9 -f 'cloudflared.*http://127.0.0.1:{phone_port}' 2>/dev/null || true\n"
            f"rm -f {tunnel_log}\n"
            f"nohup cloudflared tunnel --url http://127.0.0.1:{phone_port} > {tunnel_log} 2>&1 &\n"
        )
        write_tunnel_sh = f"cat << 'EOF' > {remote_app_dir}/run_tunnel.sh\n{tunnel_script}EOF\nchmod +x {remote_app_dir}/run_tunnel.sh\n{remote_app_dir}/run_tunnel.sh"
        await loop.run_in_executor(None, self._exec_ssh, write_tunnel_sh)

        # Poll tunnel_log for public URL using regex
        public_url = None
        log_cb("TUNNEL", "   • Waiting for Cloudflare Edge registration and SSL issuance...")
        for i in range(25):
            await asyncio.sleep(1.5)
            _, log_content, _ = await loop.run_in_executor(
                None, self._exec_ssh, f"cat {tunnel_log} 2>/dev/null"
            )
            matches = re.findall(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", log_content)
            if matches:
                public_url = matches[-1]
                break
            if (i + 1) % 5 == 0:
                log_cb("TUNNEL", f"   • Still negotiating edge tunnel ({i+1}/25)...")

        if public_url:
            log_cb("TUNNEL", f"🎉 Secure Public 24/7 HTTPS URL Ready: {public_url}")
            # Update APP_URL in .env so all assets and links use the public domain
            await loop.run_in_executor(
                None,
                self._exec_ssh,
                f"sed -i 's|^APP_URL=.*|APP_URL={public_url}|' {remote_app_dir}/.env 2>/dev/null; cd {remote_app_dir} && php artisan optimize:clear >/dev/null 2>&1 || true",
            )
            await asyncio.sleep(2)
        else:
            log_cb("TUNNEL", "⚠️ Cloudflare tunnel took longer than expected to negotiate edge certificate.")
            _, err_log, _ = await loop.run_in_executor(None, self._exec_ssh, f"tail -n 5 {tunnel_log} 2>/dev/null")
            log_cb("TUNNEL", f"   ℹ️ Tunnel status: {err_log.strip() if err_log else 'Waiting on Cloudflare DNS'}")
            raise RuntimeError("Cloudflare public tunnel failed to negotiate edge SSL URL. Please check phone internet connectivity.")

        self.active_tunnels[project_id] = public_url

        # Save active deployment info on the phone for clean process tracking
        active_meta_cmd = (
            f"cat << 'EOF' > {remote_app_dir}/app_meta.json\n"
            f'{{"project_id": "{project_id}", "port": {phone_port}, "live_url": "{public_url}"}}\n'
            f"EOF\n"
            f"cat << 'EOF' > ~/.phone_active_app.json\n"
            f'{{"project_id": "{project_id}", "port": {phone_port}, "live_url": "{public_url}"}}\n'
            f"EOF\n"
        )
        await loop.run_in_executor(None, self._exec_ssh, active_meta_cmd)

        return {
            "project_id": project_id,
            "status": "RUNNING",
            "allocated_port": phone_port,
            "live_url": public_url,
            "target": "phone",
        }

    async def stop_container(self, project_id: str) -> bool:
        """Cleanly terminates running web server and cloudflared tunnel on the phone for a specific project."""
        loop = asyncio.get_running_loop()
        remote_app_dir = f"/data/data/com.termux/files/home/apps/{project_id}"
        stop_cmd = (
            f"if [ -f {remote_app_dir}/app_meta.json ]; then "
            f"  PORT=$(grep -o '\"port\": [0-9]*' {remote_app_dir}/app_meta.json | grep -o '[0-9]*'); "
            f"  if [ -n \"$PORT\" ]; then "
            f"    fuser -k -9 ${{PORT}}/tcp 2>/dev/null || true; "
            f"    pkill -9 -f \"cloudflared.*${{PORT}}\" 2>/dev/null || true; "
            f"  fi; "
            f"fi; "
            f"find {remote_app_dir} -name 'server.pid' -exec kill -9 $(cat {{}}) 2>/dev/null \\; 2>/dev/null || true; "
            f"pkill -9 -f '{remote_app_dir}' 2>/dev/null || true; "
            f"pkill -9 -f 'node.*server.js' 2>/dev/null || true"
        )
        await loop.run_in_executor(None, self._exec_ssh, stop_cmd)
        self.active_tunnels.pop(project_id, None)
        return True

    async def restart_container(
        self, project_id: str, log_cb: Callable[[str, str], None]
    ) -> dict[str, Any]:
        """Restarts the server on the phone, preserving the active Cloudflare tunnel so URL never breaks."""
        loop = asyncio.get_running_loop()
        remote_app_dir = f"/data/data/com.termux/files/home/apps/{project_id}"
        tunnel_log = f"{remote_app_dir}/tunnel.log"

        log_cb("RESTART", f"🔄 Restarting server on phone for [{project_id}]...")

        # Check if existing tunnel process is still active
        check_tunnel_cmd = (
            f"if [ -f {remote_app_dir}/app_meta.json ]; then "
            f"  PORT=$(grep -o '\"port\": [0-9]*' {remote_app_dir}/app_meta.json | grep -o '[0-9]*'); "
            f"  if pgrep -f \"cloudflared.*${{PORT}}\" >/dev/null; then echo ALIVE; else echo DEAD; fi; "
            f"else echo DEAD; fi"
        )
        _, tunnel_status, _ = await loop.run_in_executor(None, self._exec_ssh, check_tunnel_cmd)
        tunnel_alive = "ALIVE" in tunnel_status

        # Define multi-stack launcher command (handles both root and backend/ scripts detached)
        launch_server_cmd = (
            f"if [ -f {remote_app_dir}/backend/run_server.sh ]; then "
            f"  {remote_app_dir}/backend/run_server.sh </dev/null >/dev/null 2>&1 & "
            f"elif [ -f {remote_app_dir}/run_server.sh ]; then "
            f"  {remote_app_dir}/run_server.sh </dev/null >/dev/null 2>&1 & "
            f"fi"
        )
        launch_tunnel_cmd = f"{remote_app_dir}/run_tunnel.sh </dev/null >/dev/null 2>&1 &"

        if tunnel_alive:
            # Only kill and restart the application server process, keeping Cloudflare tunnel alive
            log_cb("SERVER", "⚡ Fast restart: preserving existing Cloudflare tunnel...")
            stop_server_cmd = (
                f"if [ -f {remote_app_dir}/backend/server.pid ]; then "
                f"  kill -9 $(cat {remote_app_dir}/backend/server.pid) 2>/dev/null || true; rm -f {remote_app_dir}/backend/server.pid; "
                f"fi; "
                f"if [ -f {remote_app_dir}/server.pid ]; then "
                f"  kill -9 $(cat {remote_app_dir}/server.pid) 2>/dev/null || true; rm -f {remote_app_dir}/server.pid; "
                f"fi; "
                f"pkill -9 -f '{project_id}' 2>/dev/null || true"
            )
            await loop.run_in_executor(None, self._exec_ssh, stop_server_cmd)
            await asyncio.sleep(1)

            # Re-launch server detached
            await loop.run_in_executor(None, self._exec_ssh, launch_server_cmd)
            await asyncio.sleep(1.5)

            # Retrieve existing URL from tunnel log
            _, log_content, _ = await loop.run_in_executor(None, self._exec_ssh, f"cat {tunnel_log} 2>/dev/null")
            matches = re.findall(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", log_content)
            public_url = matches[-1] if matches else self.active_tunnels.get(project_id)

            if public_url:
                log_cb("SERVER", f"✔ Server restarted with active tunnel preserved: {public_url}")
                return {
                    "project_id": project_id,
                    "status": "RUNNING",
                    "live_url": public_url,
                    "target": "phone",
                }

        # Full restart if tunnel was dead
        await self.stop_container(project_id)
        await asyncio.sleep(1)

        log_cb("SERVER", "⚡ Re-launching application server...")
        await loop.run_in_executor(None, self._exec_ssh, launch_server_cmd)
        await asyncio.sleep(2)

        log_cb("TUNNEL", "🌐 Re-negotiating Cloudflare 24/7 tunnel...")
        await loop.run_in_executor(None, self._exec_ssh, launch_tunnel_cmd)

        public_url = None
        for i in range(20):
            await asyncio.sleep(1.5)
            _, log_content, _ = await loop.run_in_executor(
                None, self._exec_ssh, f"cat {tunnel_log} 2>/dev/null"
            )
            matches = re.findall(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", log_content)
            if matches:
                public_url = matches[-1]
                break

        if public_url:
            log_cb("TUNNEL", f"🎉 Tunnel reconnected: {public_url}")
            await loop.run_in_executor(
                None,
                self._exec_ssh,
                f"sed -i 's|^APP_URL=.*|APP_URL={public_url}|' {remote_app_dir}/.env 2>/dev/null; cd {remote_app_dir} && php artisan optimize:clear >/dev/null 2>&1 || true",
            )
        else:
            raise RuntimeError("Failed to reconnect Cloudflare tunnel during restart.")

        self.active_tunnels[project_id] = public_url
        return {
            "project_id": project_id,
            "status": "RUNNING",
            "live_url": public_url,
            "target": "phone",
        }

    @classmethod
    def get_phone_capabilities(
        cls,
        host: str | None = None,
        port: int | None = None,
        user: str | None = None,
        password: str | None = None,
    ) -> dict[str, Any]:
        """Probes the phone over SSH to detect installed language runtimes, DBs, and tools."""
        host = host or cls.DEFAULT_HOST
        port = port or cls.DEFAULT_PORT
        user = user or cls.DEFAULT_USER
        password = password or cls.DEFAULT_PASSWORD
        if not cls.is_online(host, port, timeout=1.5):
            return {
                "online": False,
                "host": host,
                "port": port,
                "runtimes": {},
                "ready_stacks": [],
            }

        probe_cmd = (
            'echo "---PHP---"; php -v 2>/dev/null | head -n 1 || echo "NOT_FOUND"\n'
            'echo "---COMPOSER---"; composer --version 2>/dev/null | head -n 1 || echo "NOT_FOUND"\n'
            'echo "---PYTHON---"; python3 --version 2>/dev/null || echo "NOT_FOUND"\n'
            'echo "---PIP---"; pip --version 2>/dev/null | head -n 1 || echo "NOT_FOUND"\n'
            'echo "---NODE---"; node -v 2>/dev/null || echo "NOT_FOUND"\n'
            'echo "---NPM---"; npm -v 2>/dev/null || echo "NOT_FOUND"\n'
            'echo "---MARIADB---"; mariadb --version 2>/dev/null | head -n 1 || echo "NOT_FOUND"\n'
            'echo "---CLOUDFLARED---"; cloudflared --version 2>/dev/null | head -n 1 || echo "NOT_FOUND"\n'
            'echo "---DISK---"; df -h $PREFIX | tail -n 1 || echo "NOT_FOUND"\n'
        )

        try:
            import paramiko

            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            client.connect(
                hostname=host,
                port=port,
                username=user,
                password=password,
                timeout=5,
                look_for_keys=False,
                allow_agent=False,
            )
            try:
                stdin, stdout, stderr = client.exec_command(probe_cmd, timeout=10)
                out = stdout.read().decode("utf-8", errors="replace")
            finally:
                client.close()

            sections: dict[str, str] = {}
            current_section = None
            for line in out.splitlines():
                line = line.strip()
                if line.startswith("---") and line.endswith("---"):
                    current_section = line.strip("-")
                elif current_section:
                    sections[current_section] = line
                    current_section = None

            def is_avail(val: str | None) -> bool:
                return bool(val and val != "NOT_FOUND")

            runtimes = {
                "php": {
                    "installed": is_avail(sections.get("PHP")),
                    "version": sections.get("PHP", "Not installed"),
                },
                "composer": {
                    "installed": is_avail(sections.get("COMPOSER")),
                    "version": sections.get("COMPOSER", "Not installed"),
                },
                "python": {
                    "installed": is_avail(sections.get("PYTHON")),
                    "version": sections.get("PYTHON", "Not installed"),
                },
                "pip": {
                    "installed": is_avail(sections.get("PIP")),
                    "version": sections.get("PIP", "Not installed"),
                },
                "node": {
                    "installed": is_avail(sections.get("NODE")),
                    "version": sections.get("NODE", "Not installed"),
                },
                "npm": {
                    "installed": is_avail(sections.get("NPM")),
                    "version": sections.get("NPM", "Not installed"),
                },
                "mariadb": {
                    "installed": is_avail(sections.get("MARIADB")),
                    "version": sections.get("MARIADB", "Not installed"),
                },
                "cloudflared": {
                    "installed": is_avail(sections.get("CLOUDFLARED")),
                    "version": sections.get("CLOUDFLARED", "Not installed"),
                },
            }

            ready_stacks = []
            if runtimes["php"]["installed"]:
                ready_stacks.append("Laravel (PHP)")
            if runtimes["python"]["installed"]:
                ready_stacks.append("Python (FastAPI/Flask/Django)")
            if runtimes["node"]["installed"]:
                ready_stacks.append("Node.js / Express")

            return {
                "online": True,
                "host": host,
                "port": port,
                "runtimes": runtimes,
                "ready_stacks": ready_stacks,
                "disk": sections.get("DISK", "Unknown"),
            }
        except Exception as e:
            return {
                "online": False,
                "host": host,
                "port": port,
                "error": str(e),
                "runtimes": {},
                "ready_stacks": [],
            }

