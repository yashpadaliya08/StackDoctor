import asyncio
import shutil
from pathlib import Path
from typing import Any, Callable

from .base import BaseDriver


class DockerDriver(BaseDriver):
    """Production Docker Driver: Used when Docker daemon is available."""

    def __init__(self) -> None:
        self.is_available = shutil.which("docker") is not None

    async def build_image(self, project_path: Path, tag: str, log_cb: Callable[[str, str], None]) -> bool:
        cmd = ["docker", "build", "-t", tag, str(project_path)]
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        async for line in proc.stdout:
            log_cb("BUILD", line.decode().strip())
        await proc.wait()
        return proc.returncode == 0

    async def run_container(self, project_id: str, tag: str, env_vars: dict[str, str], allocated_port: int, log_cb: Callable[[str, str], None]) -> dict[str, Any]:
        cmd = ["docker", "run", "-d", "--name", f"student_{project_id}", "-p", f"{allocated_port}:8080"]
        for k, v in env_vars.items():
            cmd.extend(["-e", f"{k}={v}"])
        cmd.append(tag)
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, _ = await proc.communicate()
        return {
            "project_id": project_id,
            "container_id": stdout.decode().strip()[:12],
            "status": "RUNNING",
            "allocated_port": allocated_port,
            "live_url": f"http://127.0.0.1:{allocated_port}",
        }

    async def stop_container(self, project_id: str) -> bool:
        cmd = ["docker", "rm", "-f", f"student_{project_id}"]
        proc = await asyncio.create_subprocess_exec(*cmd)
        await proc.wait()
        return proc.returncode == 0
