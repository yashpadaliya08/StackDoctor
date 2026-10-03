import asyncio
import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List

logger = logging.getLogger("doctor.pipeline")
from doctor.engine import DoctorEngine
from server.config import DEPLOYMENTS_DIR, PROJECTS_DIR
from server.orchestrator.database_manager import DatabaseManager
from server.orchestrator.driver import (
    BaseDriver,
    DockerDriver,
    LocalRunnerDriver,
    PhoneRemoteDriver,
    SimulationDriver,
)
from server.orchestrator.registry import DeploymentRecord, deployment_registry
import shutil


class DeploymentEvent:
    def __init__(self, stage: str, message: str, level: str = "INFO"):
        self.timestamp = datetime.now(timezone.utc).isoformat()
        self.stage = stage
        self.message = message
        self.level = level

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "stage": self.stage,
            "message": self.message,
            "level": self.level,
        }


class DeploymentSession:
    def __init__(
        self,
        deployment_id: str,
        project_id: str,
        subdomain: str,
        target: str = "phone",
        db_overrides: Dict[str, Any] | None = None,
        env_vars: Dict[str, str] | None = None,
    ):
        self.deployment_id = deployment_id
        self.project_id = project_id
        self.subdomain = subdomain
        self.target = target  # "phone" or "local"
        self.db_overrides: Dict[str, Any] = db_overrides or {}  # user MySQL config
        self.env_vars: Dict[str, str] = env_vars or {}  # custom environment variables & secrets
        self.status = "PENDING"  # PENDING, RUNNING, COMPLETED, FAILED
        self.live_url: str | None = None
        self.events: List[DeploymentEvent] = []
        self.queue: asyncio.Queue = asyncio.Queue()
        self.created_at = datetime.now(timezone.utc).isoformat()

    def add_event(self, stage: str, message: str, level: str = "INFO") -> None:
        evt = DeploymentEvent(stage, message, level)
        self.events.append(evt)
        try:
            loop = asyncio.get_running_loop()
            loop.call_soon_threadsafe(self.queue.put_nowait, evt)
        except RuntimeError:
            self.queue.put_nowait(evt)


class DeploymentOrchestrator:
    """Manages active deployment sessions and executes pipeline workflows."""

    def __init__(self, driver: BaseDriver | None = None) -> None:
        if driver:
            self.driver = driver
        elif shutil.which("docker"):
            self.driver = DockerDriver()
        else:
            self.driver = LocalRunnerDriver()
        self.phone_driver = PhoneRemoteDriver()
        self.sessions: Dict[str, DeploymentSession] = {}
        self.doctor = DoctorEngine()

    MAX_RETAINED_SESSIONS = 50

    def _prune_sessions(self) -> None:
        """Keeps maximum MAX_RETAINED_SESSIONS sessions to avoid unbounded RAM consumption."""
        if len(self.sessions) > self.MAX_RETAINED_SESSIONS:
            finished_keys = [
                k for k, s in self.sessions.items()
                if s.status in ("COMPLETED", "FAILED")
            ]
            finished_keys.sort(key=lambda k: self.sessions[k].created_at)
            for k in finished_keys:
                if len(self.sessions) <= self.MAX_RETAINED_SESSIONS:
                    break
                self.sessions.pop(k, None)

    def create_session(
        self,
        deployment_id: str,
        project_id: str,
        subdomain: str,
        target: str = "phone",
        db_overrides: Dict[str, Any] | None = None,
        env_vars: Dict[str, str] | None = None,
    ) -> DeploymentSession:
        self._prune_sessions()
        session = DeploymentSession(
            deployment_id,
            project_id,
            subdomain,
            target,
            db_overrides=db_overrides,
            env_vars=env_vars,
        )
        self.sessions[deployment_id] = session
        return session

    def get_session(self, deployment_id: str) -> DeploymentSession | None:
        return self.sessions.get(deployment_id)

    async def execute(self, session: DeploymentSession) -> None:
        """Executes the full deployment pipeline targeting either local PC or Phone server."""
        session.status = "RUNNING"
        project_dir = PROJECTS_DIR / session.project_id
        active_driver = self.phone_driver if session.target == "phone" else self.driver

        def log(stage: str, msg: str, level: str = "INFO") -> None:
            session.add_event(stage, msg, level=level)

        try:
            target_desc = "📱 Spare Phone Cloud (24/7)" if session.target == "phone" else "💻 Local PC"
            log("INIT", f"🚀 Starting deployment for [{session.project_id}] targeting {target_desc}...")
            await asyncio.sleep(0.3)

            # Step 1: Doctor Pre-Flight Health Check
            log("DIAGNOSTIC", "🩺 Running automated pre-flight scan with Laravel Doctor...")
            report = self.doctor.analyze(project_dir)
            log("DIAGNOSTIC", f"   ✔ Deployment readiness score: {report.readiness_score}/100")

            # Step 2: Auto-Apply Fixes if needed
            if report.failed_count > 0 or not (project_dir / "Dockerfile").exists():
                log("AUTO_FIX", f"⚡ Auto-repairing {report.auto_fixable_count} detected item(s)...")
                self.doctor.apply_fixes(
                    project_dir,
                    target_app_url="http://127.0.0.1:8081",
                    target_db_host="127.0.0.1",
                    generate_docker=True,
                )
                log("AUTO_FIX", "   ✔ Production .env with secure APP_KEY generated.")
                log("AUTO_FIX", "   ✔ Multi-stage Dockerfile and Caddyfile generated.")
                await asyncio.sleep(0.3)

            # Step 3: Database Provisioning
            db_type = report.metadata.db_connection
            env_overrides: Dict[str, Any] = {"SUBDOMAIN": session.subdomain}

            if session.target == "phone":
                log("DATABASE", "🗄️ Target is Spare Phone Cloud: using native MariaDB (MySQL 3306)...")
                env_overrides["DB_CONNECTION"] = "mysql"
                # Propagate user-provided MySQL config so driver.py picks them up
                if session.db_overrides:
                    env_overrides.update(session.db_overrides)
                    if session.db_overrides.get("db_name"):
                        log("DATABASE", f"   ✔ Using custom database name: {session.db_overrides['db_name']}")
                    if session.db_overrides.get("run_seeder"):
                        seeder_cls = session.db_overrides.get('seeder_class', 'DatabaseSeeder')
                        log("DATABASE", f"   ✔ Seeder enabled: will run {seeder_cls} after migrations")
            elif db_type == "sqlite":
                log("DATABASE", "🗄️ Initializing persistent SQLite database...")
                db_config = DatabaseManager.provision_sqlite(project_dir)
                env_overrides.update(db_config)
                log("DATABASE", "   ✔ Persistent SQLite file ready at database/database.sqlite")
            else:
                log("DATABASE", f"🗄️ Provisioning isolated MySQL schema for project [{session.project_id}]...")
                mysql_info = DatabaseManager.provision_mysql(session.project_id)
                env_overrides.update(mysql_info["env_vars"])
                log("DATABASE", f"   ✔ Created database: {mysql_info['db_name']}")

            # Step 3b: Pre-Deploy Custom Environment Variables & Secrets
            if session.env_vars:
                env_overrides["custom_env"] = session.env_vars
                log("CONFIG", f"🔐 Injected {len(session.env_vars)} custom environment variables & secrets...")

            # Step 4: Build / Synchronize with Driver
            image_tag = f"student-app:{session.project_id[:12]}"
            build_ok = await active_driver.build_image(project_dir, image_tag, log)
            if not build_ok:
                raise RuntimeError("Driver build/preparation step failed.")

            # Step 5: Run with Driver
            allocated_port = 8080 + (int(hashlib.md5(session.project_id.encode()).hexdigest(), 16) % 900)
            container_result = await active_driver.run_container(
                session.project_id,
                image_tag,
                env_overrides,
                allocated_port,
                log,
            )

            # Step 6: Mark Complete
            session.live_url = container_result.get("live_url")
            session.status = "COMPLETED"
            log("SUCCESS", f"🎉 Deployment complete! Live URL: {session.live_url}")

            # Persist latest active deployment to disk so dashboard always remembers it
            try:
                import json
                cache_file = DEPLOYMENTS_DIR / "latest_active.json"
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                # Try to get project name from composer.json
                project_name = None
                try:
                    composer = project_dir / "composer.json"
                    pkg_json = project_dir / "package.json"
                    if composer.exists():
                        data = json.loads(composer.read_text(encoding="utf-8"))
                        project_name = data.get("name", "").split("/")[-1].replace("-", " ").title()
                    elif pkg_json.exists():
                        data = json.loads(pkg_json.read_text(encoding="utf-8"))
                        project_name = data.get("name", "").replace("-", " ").title()
                    elif (project_dir / "main.py").exists():
                        project_name = f"FastAPI Microservice ({session.project_id[:6]})"
                    elif (project_dir / "manage.py").exists():
                        project_name = f"Django App ({session.project_id[:6]})"
                    elif (project_dir / "app.py").exists():
                        project_name = f"Flask Web App ({session.project_id[:6]})"
                except Exception:
                    pass
                payload = {
                    "deployment_id": session.deployment_id,
                    "project_id": session.project_id,
                    "project_name": project_name or f"App ({session.project_id[:6]})",
                    "stack": report.metadata.stack,
                    "framework": report.metadata.framework,
                    "subdomain": session.subdomain,
                    "target": session.target,
                    "status": session.status,
                    "live_url": session.live_url,
                    "created_at": session.created_at,
                }
                cache_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")

                # Upsert into persistent multi-app registry
                rec = DeploymentRecord(
                    deployment_id=session.deployment_id,
                    project_id=session.project_id,
                    project_name=project_name or f"App ({session.project_id[:6]})",
                    framework=report.metadata.framework,
                    subdomain=session.subdomain,
                    port=int(container_result.get("allocated_port", allocated_port)),
                    target=session.target,
                    live_url=session.live_url,
                    status="RUNNING",
                    created_at=session.created_at,
                )
                deployment_registry.upsert(rec)
                try:
                    from server.orchestrator.gateway import gateway_manager
                    gateway_manager.update_target_url(session.project_id, session.live_url)
                except Exception:
                    pass
            except Exception as reg_err:
                log("WARNING", f"Registry sync note: {reg_err}")

        except Exception as e:
            session.status = "FAILED"
            log("ERROR", f"Deployment failed: {str(e)}", level="ERROR")

    def get_latest_deployment(self) -> Dict[str, Any] | None:
        records = deployment_registry.list_all()
        if records:
            return records[0].to_dict()
        for s in reversed(list(self.sessions.values())):
            if s.status == "COMPLETED" and s.live_url:
                return {
                    "deployment_id": s.deployment_id,
                    "project_id": s.project_id,
                    "subdomain": s.subdomain,
                    "target": s.target,
                    "status": s.status,
                    "live_url": s.live_url,
                    "created_at": s.created_at,
                }
        return None

    def get_all_deployments(self) -> List[Dict[str, Any]]:
        """Returns all persistent deployments."""
        return [r.to_dict() for r in deployment_registry.list_all()]

    async def stop_project(self, project_id: str) -> Dict[str, Any]:
        """Stops a specific project's container/process and tunnel."""
        rec = deployment_registry.get(project_id)
        target = rec.target if rec else "phone"
        if target == "phone":
            await self.phone_driver.stop_container(project_id)
        else:
            await self.driver.stop_container(project_id)

        deployment_registry.update_status(project_id, "STOPPED")
        for s in self.sessions.values():
            if s.project_id == project_id:
                s.status = "STOPPED"
        return {"status": "STOPPED", "project_id": project_id}

    async def restart_project(self, project_id: str) -> Dict[str, Any]:
        """Restarts a specific project and re-opens its Cloudflare tunnel."""
        rec = deployment_registry.get(project_id)
        target = rec.target if rec else "phone"
        if target == "phone":
            def dummy_log(stage: str, msg: str, level: str = "INFO"):
                pass
            res = await self.phone_driver.restart_container(project_id, dummy_log)
            new_url = res.get("live_url")
            deployment_registry.update_status(project_id, "RUNNING", live_url=new_url)
            try:
                from server.orchestrator.gateway import gateway_manager
                gateway_manager.update_target_url(project_id, new_url)
            except Exception:
                pass
            for s in self.sessions.values():
                if s.project_id == project_id:
                    s.status = "COMPLETED"
                    s.live_url = new_url
            return {"status": "RUNNING", "live_url": new_url, "project_id": project_id}
        return {"status": "ERROR", "message": "Restart only supported on phone target."}

    async def delete_project(self, identifier: str) -> Dict[str, Any]:
        """Stops the project, cleans up phone files if applicable, and removes it from the persistent registry."""
        rec = deployment_registry.get(identifier)
        project_id = rec.project_id if rec else identifier
        target = rec.target if rec else "phone"

        # 1. Gracefully stop server and tunnel (never crash on dead processes or offline phone)
        try:
            await self.stop_project(project_id)
        except Exception as e:
            logger.warning(f"Notice: while stopping {project_id} during delete: {e}")

        # 2. If phone target and reachable, remove the deployed app directory to free phone storage
        if target == "phone":
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    None,
                    self.phone_driver._exec_ssh,
                    f"rm -rf /data/data/com.termux/files/home/apps/{project_id} 2>/dev/null || true"
                )
            except Exception as e:
                logger.warning(f"Notice: remote folder cleanup for {project_id}: {e}")

        # 3. Always remove from persistent registry
        deployment_registry.remove(project_id)
        deployment_registry.remove(identifier)

        try:
            from server.orchestrator.gateway import gateway_manager
            gateway_manager._sync_with_registry()
        except Exception:
            pass

        for s in list(self.sessions.values()):
            if s.project_id == project_id or s.deployment_id == identifier:
                s.status = "DELETED"

        return {"status": "DELETED", "project_id": project_id}

    async def stop_active_deployment(self) -> Dict[str, Any]:
        latest = self.get_latest_deployment()
        if not latest:
            return {"status": "NO_ACTIVE_DEPLOYMENT"}
        return await self.stop_project(latest["project_id"])

    async def restart_active_deployment(self) -> Dict[str, Any]:
        latest = self.get_latest_deployment()
        if not latest:
            return {"status": "ERROR", "message": "No deployment record found to restart."}
        return await self.restart_project(latest["project_id"])


# Global orchestrator singleton instance
orchestrator = DeploymentOrchestrator()
