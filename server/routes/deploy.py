import asyncio
import json
import re
import secrets
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from server.config import DEFAULT_DOMAIN_SUFFIX, PROJECTS_DIR
from server.orchestrator.driver import PhoneRemoteDriver
from server.orchestrator.pipeline import DeploymentSession, orchestrator


router = APIRouter(prefix="/api/deploy", tags=["Deployment"])


class DeployRequest(BaseModel):
    project_id: str
    subdomain: str | None = None
    target: str | None = "phone"  # "phone" or "local"
    # MySQL configuration (all optional — sensible defaults applied by driver)
    db_name: str | None = None          # defaults to auto-generated db_{project_id[:10]}
    db_user: str | None = "root"        # defaults to root
    db_password: str | None = ""        # defaults to empty (Termux MariaDB default)
    run_seeder: bool = False            # run php artisan db:seed after migrate
    seeder_class: str | None = None    # specific seeder class (default: DatabaseSeeder)
    env_vars: dict[str, str] | None = None  # Custom pre-deploy environment variables & secrets


class DeployResponse(BaseModel):
    deployment_id: str
    project_id: str
    subdomain: str
    status: str
    live_url: str | None = None
    target: str = "phone"


@router.get("/targets")
async def get_deployment_targets() -> dict:
    """Returns available deployment destinations and their real-time online status."""
    phone_online = PhoneRemoteDriver.is_online()
    return {
        "targets": [
            {
                "id": "phone",
                "name": "Spare Phone Cloud (24/7 Server)",
                "type": "24/7 Linux Server",
                "online": phone_online,
                "ip": PhoneRemoteDriver.DEFAULT_HOST,
                "badge": "24/7 ONLINE",
                "features": [
                    "MariaDB MySQL (Port 3306)",
                    "Cloudflare Public HTTPS Tunnel",
                    "24/7 Always-On (Zero PC Load)",
                ],
                "recommended": True,
            },
            {
                "id": "local",
                "name": "Local PC Server",
                "type": "Development Host",
                "online": True,
                "ip": "127.0.0.1",
                "badge": "LOCAL DEV",
                "features": [
                    "Localhost Port 808x",
                    "Fast Dev Iteration",
                    "Offline when PC sleeps",
                ],
                "recommended": False,
            },
        ]
    }


@router.get("/active")
async def get_active_deployment() -> dict:
    """Returns all persistent deployments and current phone status."""
    latest = orchestrator.get_latest_deployment()
    all_deployments = orchestrator.get_all_deployments()
    phone_online = PhoneRemoteDriver.is_online()
    return {
        "active": latest is not None,
        "deployment": latest,
        "deployments": all_deployments,
        "phone_online": phone_online,
    }


@router.get("/all")
async def get_all_deployments() -> dict:
    """Returns all deployments from the persistent registry."""
    return {
        "deployments": orchestrator.get_all_deployments(),
        "phone_online": PhoneRemoteDriver.is_online(),
    }


@router.post("/stop")
async def stop_active_deployment() -> dict:
    """Stops the active deployment on phone or local server."""
    result = await orchestrator.stop_active_deployment()
    return result


@router.post("/stop/{project_id}")
async def stop_project_deployment(project_id: str) -> dict:
    """Stops a specific deployment by project_id."""
    return await orchestrator.stop_project(project_id)


@router.post("/restart")
async def restart_active_deployment() -> dict:
    """Restarts the active phone deployment and reconnects tunnel."""
    result = await orchestrator.restart_active_deployment()
    return result


@router.post("/restart/{project_id}")
async def restart_project_deployment(project_id: str) -> dict:
    """Restarts a specific deployment by project_id."""
    return await orchestrator.restart_project(project_id)


@router.delete("")
async def delete_active_deployment() -> dict:
    """Deletes the active deployment from registry and stops its process."""
    latest = orchestrator.get_latest_deployment()
    if not latest:
        return {"status": "NO_ACTIVE_DEPLOYMENT"}
    return await orchestrator.delete_project(latest["project_id"])


@router.delete("/{project_id}")
async def delete_project_deployment(project_id: str) -> dict:
    """Deletes a deployment from the registry and stops its process."""
    return await orchestrator.delete_project(project_id)


@router.get("/phone/stats")
async def get_phone_hardware_stats() -> dict:
    """Returns real-time phone RAM, Disk, CPU Load, and running services telemetry."""
    return PhoneRemoteDriver.get_phone_stats()


from server.utils.validators import validate_project_id, sanitize_db_overrides, sanitize_env_vars


@router.post("", response_model=DeployResponse)
async def create_deployment(req: DeployRequest) -> DeployResponse:
    # 1. Validate project_id format & path containment
    validate_project_id(req.project_id)

    project_dir = (PROJECTS_DIR / req.project_id).resolve()
    try:
        project_dir.relative_to(PROJECTS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project path traversal.")

    deployment_id = secrets.token_hex(6)
    subdomain = req.subdomain or f"demo-{req.project_id[:6]}"
    subdomain = "".join(c for c in subdomain.lower() if c.isalnum() or c == "-")
    target = req.target or "phone"

    # 2. Build and sanitize MySQL overrides
    db_overrides = sanitize_db_overrides(
        db_name=req.db_name,
        db_user=req.db_user,
        db_password=req.db_password,
        run_seeder=req.run_seeder,
        seeder_class=req.seeder_class,
    )

    # 3. Sanitize custom environment variables (disallow raw newlines / CRLF)
    safe_env_vars = sanitize_env_vars(req.env_vars)

    if not project_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{req.project_id}' not found.")

    session = orchestrator.create_session(
        deployment_id,
        req.project_id,
        subdomain,
        target=target,
        db_overrides=db_overrides,
        env_vars=safe_env_vars,
    )

    # Launch pipeline execution asynchronously
    asyncio.create_task(orchestrator.execute(session))

    return DeployResponse(
        deployment_id=deployment_id,
        project_id=req.project_id,
        subdomain=subdomain,
        status=session.status,
        target=target,
    )


DEPLOYMENT_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{4,64}$")


@router.get("/{deployment_id}")
async def get_deployment_status(deployment_id: str) -> dict:
    if not DEPLOYMENT_ID_RE.match(deployment_id):
        raise HTTPException(status_code=400, detail="Invalid deployment ID format.")
    session = orchestrator.get_session(deployment_id)
    if not session:
        raise HTTPException(status_code=404, detail="Deployment session not found.")

    return {
        "deployment_id": session.deployment_id,
        "project_id": session.project_id,
        "subdomain": session.subdomain,
        "status": session.status,
        "live_url": session.live_url,
        "events": [evt.to_dict() for evt in session.events],
    }


@router.get("/{deployment_id}/stream")
async def stream_deployment_logs(deployment_id: str) -> StreamingResponse:
    if not DEPLOYMENT_ID_RE.match(deployment_id):
        raise HTTPException(status_code=400, detail="Invalid deployment ID format.")
    session = orchestrator.get_session(deployment_id)
    if not session:
        raise HTTPException(status_code=404, detail="Deployment session not found.")

    async def event_generator():
        # First send any existing backlog events
        for evt in session.events:
            yield f"data: {json.dumps(evt.to_dict())}\n\n"

        # Stream new events as they arrive
        while session.status in ("PENDING", "RUNNING"):
            try:
                evt = await asyncio.wait_for(session.queue.get(), timeout=1.0)
                yield f"data: {json.dumps(evt.to_dict())}\n\n"
            except asyncio.TimeoutError:
                # Keep-alive comment
                yield ": keep-alive\n\n"

        # Drain any remaining events in queue
        while not session.queue.empty():
            evt = session.queue.get_nowait()
            yield f"data: {json.dumps(evt.to_dict())}\n\n"

        # Final terminal event
        final_payload = {
            "stage": "TERMINATED",
            "status": session.status,
            "live_url": session.live_url,
            "message": f"Deployment session finished with status: {session.status}",
        }
        yield f"data: {json.dumps(final_payload)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
