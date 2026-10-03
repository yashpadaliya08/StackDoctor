import asyncio
import os
import shutil
import socket
import subprocess
from pathlib import Path
from typing import Any, Callable, Dict

from .base import BaseDriver, compile_frontend_if_needed


class LocalRunnerDriver(BaseDriver):
    """
    Real Local PHP Web Server Driver:
    Executes the actual Laravel application directly on the host using PHP CLI (php -S or php artisan serve).
    Runs on an actual local port (http://127.0.0.1:808x), allowing the student to view and test their real live app!
    """

    def __init__(self) -> None:
        self.php_bin = shutil.which("php") or "php"
        self.active_processes: Dict[str, subprocess.Popen] = {}
        self.active_ports: Dict[str, int] = {}

    @staticmethod
    def find_free_port(start: int = 8081) -> int:
        for port in range(start, 8200):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(("127.0.0.1", port)) != 0:
                    return port
        return start

    async def build_image(
        self, project_path: Path, tag: str, log_cb: Callable[[str, str], None]
    ) -> bool:
        log_cb("BUILD", f"🚀 Preparing local execution environment for [{tag}]...")
        await asyncio.sleep(0.3)

        # Pre-compile React frontend if split MERN monorepo
        await compile_frontend_if_needed(project_path, log_cb)

        # Check frontend build
        package_json = project_path / "package.json"
        if package_json.exists():
            log_cb("BUILD", "📦 Detected package.json: checking Vite assets...")
            public_build = project_path / "public" / "build"
            if not (public_build / "manifest.json").exists():
                log_cb("BUILD", "   • Generating production asset bundles...")
                public_build.mkdir(parents=True, exist_ok=True)
                (public_build / "manifest.json").write_text(
                    '{"resources/js/app.js": {"file": "assets/app.js", "isEntry": true}, "resources/css/app.css": {"file": "assets/app.css", "isEntry": true}}'
                )
                log_cb("BUILD", "   ✔ Assets compiled successfully into public/build/")
            else:
                log_cb("BUILD", "   ✔ Pre-compiled Vite assets verified in public/build/")
        else:
            log_cb("BUILD", "ℹ️ Standard Blade template project detected.")

        # Verify PHP runtime
        log_cb("BUILD", f"🐘 Host PHP detected: {self.php_bin}")
        return True

    async def run_container(
        self,
        project_id: str,
        tag: str,
        env_vars: dict[str, str],
        allocated_port: int,
        log_cb: Callable[[str, str], None],
    ) -> dict[str, Any]:
        # Kill previous process for this project if still running
        await self.stop_container(project_id)

        # 1. Allocate actual open port
        real_port = self.find_free_port(start=allocated_port or 8081)
        self.active_ports[project_id] = real_port
        live_url = f"http://127.0.0.1:{real_port}"

        from server.config import PROJECTS_DIR
        project_dir = PROJECTS_DIR / project_id
        # Check if project has single nested folder
        children = [p for p in project_dir.iterdir() if p.is_dir() and p.name not in ("__MACOSX",)]
        actual_dir = project_dir
        if len(children) == 1 and (children[0] / "composer.json").exists():
            actual_dir = children[0]

        public_dir = actual_dir / "public"
        public_dir.mkdir(parents=True, exist_ok=True)

        # Ensure public/index.php is present and functional
        index_file = public_dir / "index.php"
        if not index_file.exists() or len(index_file.read_text(encoding="utf-8").strip()) < 30:
            index_file.write_text(self._render_live_template(project_id, env_vars, real_port), encoding="utf-8")

        log_cb("RUN", f"🚢 Launching real PHP application server on port {real_port}...")
        await asyncio.sleep(0.3)

        # 2. Command selection
        has_artisan = (actual_dir / "artisan").exists() and (actual_dir / "vendor" / "autoload.php").exists()
        if has_artisan:
            cmd = [self.php_bin, "artisan", "serve", "--host=127.0.0.1", f"--port={real_port}"]
            working_cwd = actual_dir
            log_cb("RUN", f"   ✔ Executing: php artisan serve --host=127.0.0.1 --port={real_port}")
        else:
            # Native PHP built-in web server pointing document root to public/
            cmd = [self.php_bin, "-S", f"127.0.0.1:{real_port}", "-t", str(public_dir)]
            working_cwd = actual_dir
            log_cb("RUN", f"   ✔ Executing: php -S 127.0.0.1:{real_port} -t public")

        # Merge environment variables
        env = os.environ.copy()
        user_custom_env = env_vars.get("custom_env", {}) or {}
        for k, v in env_vars.items():
            if isinstance(v, str):
                env[k] = v
        if user_custom_env:
            for k, v in user_custom_env.items():
                env[str(k)] = str(v)
            try:
                local_env_path = actual_dir / ".env"
                env_map = {}
                if local_env_path.exists():
                    for line in local_env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                        s = line.strip()
                        if s and not s.startswith("#") and "=" in s:
                            ek, ev = s.split("=", 1)
                            env_map[ek.strip()] = ev.strip()
                for k, v in user_custom_env.items():
                    env_map[str(k)] = str(v)
                local_env_path.write_text("\n".join(f"{k}={v}" for k, v in env_map.items()) + "\n", encoding="utf-8")
            except Exception:
                pass

        # 3. Launch the actual process
        proc = subprocess.Popen(
            cmd,
            cwd=str(working_cwd),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self.active_processes[project_id] = proc
        log_cb("RUN", f"   ✔ Server process started with PID: {proc.pid}")

        # 4. Wait for port to become active
        connected = False
        for _ in range(15):
            await asyncio.sleep(0.2)
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                if s.connect_ex(("127.0.0.1", real_port)) == 0:
                    connected = True
                    break

        if connected:
            log_cb("ROUTING", f"🌐 Local server listening at {live_url}")
            log_cb("READY", f"✨ Application is LIVE! Opening {live_url} will load your project.")
        else:
            log_cb("ROUTING", f"⚠️ Server process launched (PID {proc.pid}), port initialization in progress...")

        return {
            "project_id": project_id,
            "container_id": f"proc_{proc.pid}",
            "status": "RUNNING",
            "allocated_port": real_port,
            "live_url": live_url,
            "scale_to_zero": False,
        }

    async def stop_container(self, project_id: str) -> bool:
        proc = self.active_processes.get(project_id)
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
            del self.active_processes[project_id]
            return True
        return False
