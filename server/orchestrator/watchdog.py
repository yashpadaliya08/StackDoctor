import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from server.orchestrator.registry import deployment_registry

logger = logging.getLogger("doctor.watchdog")


class HealthWatchdog:
    """
    24/7 Background Supervisor & Auto-Healer.
    Periodically inspects active deployments (phone loopback ports and local ports).
    If an Android power optimizer or Termux process termination kills an app,
    the watchdog automatically relaunches the service and restores the public tunnel.
    """

    def __init__(self, check_interval_sec: int = 25) -> None:
        self.check_interval_sec = check_interval_sec
        self.is_enabled: bool = True
        self._task: Optional[asyncio.Task] = None
        self.last_check_at: Optional[str] = None
        self.total_checks: int = 0
        self.total_heals: int = 0
        self.event_history: List[Dict[str, Any]] = []

    def start_background_loop(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._monitor_loop())
            logger.info("🛡️ 24/7 Health Watchdog background supervisor initialized.")

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            self._task = None

    def toggle(self) -> bool:
        self.is_enabled = not self.is_enabled
        self._record_event("WATCHDOG", f"Watchdog toggled to {'ENABLED' if self.is_enabled else 'PAUSED'}")
        return self.is_enabled

    def get_status(self) -> Dict[str, Any]:
        return {
            "enabled": self.is_enabled,
            "running": self._task is not None and not self._task.done(),
            "check_interval_sec": self.check_interval_sec,
            "last_check_at": self.last_check_at,
            "total_checks": self.total_checks,
            "total_heals": self.total_heals,
            "recent_events": self.event_history[-20:],
        }

    def _record_event(self, category: str, message: str, project_id: Optional[str] = None) -> None:
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "category": category,
            "message": message,
            "project_id": project_id,
        }
        self.event_history.append(event)
        if len(self.event_history) > 100:
            self.event_history = self.event_history[-100:]

    async def _monitor_loop(self) -> None:
        # Give server time to boot
        await asyncio.sleep(5)
        while True:
            try:
                if self.is_enabled:
                    await self._perform_health_check()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Watchdog loop iteration error: {e}")
            await asyncio.sleep(self.check_interval_sec)

    async def _perform_health_check(self) -> None:
        self.total_checks += 1
        self.last_check_at = datetime.now(timezone.utc).isoformat()
        records = deployment_registry.list_all()

        from server.orchestrator.pipeline import orchestrator
        from server.orchestrator.driver import PhoneRemoteDriver

        running_records = [r for r in records if r.status == "RUNNING"]

        phone_online = PhoneRemoteDriver.is_online()
        loop = asyncio.get_running_loop()

        # Edge Node Reboot / Reconnection Recovery
        if phone_online:
            if not getattr(self, "phone_was_online", False):
                logger.info("📱 Phone Edge Node detected online/reconnected! Running edge auto-heal...")
                self._record_event(
                    "EDGE_REBOOT_RECOVERY",
                    "Phone Edge Node connected! Verifying MariaDB daemon & resurrecting active deployments...",
                )
                # Ensure MariaDB is running and locks cleared
                await loop.run_in_executor(None, PhoneRemoteDriver.ensure_mariadb_running)
            else:
                # Periodic MariaDB health check
                if self.total_checks % 4 == 0:
                    await loop.run_in_executor(None, PhoneRemoteDriver.ensure_mariadb_running)

        self.phone_was_online = phone_online

        if not running_records:
            return

        for rec in running_records:
            try:
                is_alive = False
                if rec.target == "phone":
                    if not phone_online:
                        # Phone is unreachable, don't flap
                        continue
                    # Check if port is listening on phone
                    is_alive = await self._check_phone_port(rec.port)
                else:
                    is_alive = await self._check_local_port(rec.port)

                if not is_alive:
                    logger.warning(
                        f"🛡️ Watchdog detected offline process for [{rec.project_name}] on port {rec.port}. Initiating auto-heal..."
                    )
                    self._record_event(
                        "AUTO_HEAL_TRIGGERED",
                        f"Port {rec.port} unreachable. Reviving application process & Cloudflare tunnel...",
                        project_id=rec.project_id,
                    )
                    heal_res = await orchestrator.restart_project(rec.project_id)
                    if heal_res.get("status") == "RUNNING":
                        self.total_heals += 1
                        new_url = heal_res.get("live_url", rec.live_url)
                        self._record_event(
                            "AUTO_HEAL_SUCCESS",
                            f"Application restored successfully! Live at: {new_url}",
                            project_id=rec.project_id,
                        )
                        logger.info(f"✔ Auto-heal completed for [{rec.project_name}]. Live: {new_url}")
                        try:
                            from server.orchestrator.analytics import alert_manager
                            from server.orchestrator.audit_log import audit_logger
                            alert_manager.dispatch_alert(
                                title=f"Watchdog Auto-Healed {rec.project_name}",
                                description=f"Container revived on port {rec.port}. Live at {new_url}",
                                severity="INFO",
                                project_id=rec.project_id,
                            )
                            audit_logger.record(
                                action="AUTO_HEAL",
                                project_id=rec.project_id,
                                actor="watchdog",
                                details=f"Watchdog revived container on port {rec.port}",
                                status="SUCCESS",
                            )
                        except Exception:
                            pass
                    else:
                        self._record_event(
                            "AUTO_HEAL_FAILED",
                            f"Restart returned: {heal_res.get('message', 'Unknown failure')}",
                            project_id=rec.project_id,
                        )
            except Exception as e:
                logger.warning(f"Error checking health for {rec.project_id}: {e}")

    async def _check_phone_port(self, port: int) -> bool:
        from server.orchestrator.driver import PhoneRemoteDriver
        loop = asyncio.get_running_loop()
        try:
            # Check both HTTP response and running cloudflared process
            cmd = f"curl -s -m 1 http://127.0.0.1:{port}/ >/dev/null && pgrep -f 'cloudflared.*:{port}' >/dev/null && echo YES || echo NO"
            code, out, _ = await loop.run_in_executor(None, PhoneRemoteDriver.exec_ssh_quick, cmd)
            return "YES" in out.strip()
        except Exception:
            return True  # If check errored, assume alive to avoid unnecessary restarts

    async def _check_local_port(self, port: int) -> bool:
        import socket
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1.0)
                return s.connect_ex(("127.0.0.1", port)) == 0
        except Exception:
            return False


# Global Watchdog Singleton
watchdog = HealthWatchdog()
