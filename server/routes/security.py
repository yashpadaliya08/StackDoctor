"""
Security & Audit Trail API Router
=================================
Exposes endpoints for querying the system audit trail and rate-limiting metrics.
"""

from fastapi import APIRouter, HTTPException, Query, Request
from server.config import SD_AUDIT_API_KEY
from server.middleware.rate_limiter import rate_limiter
from server.orchestrator.audit_log import audit_logger

router = APIRouter(prefix="/api/security", tags=["Security & Audit"])


@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    action: str | None = Query(None),
    project_id: str | None = Query(None),
    q: str | None = Query(None),
):
    """Retrieve filtered, reverse-chronological security audit events."""
    logs = audit_logger.query(
        limit=limit,
        action_filter=action,
        project_filter=project_id,
        search_query=q,
    )
    return {
        "total": len(logs),
        "logs": logs,
    }


@router.get("/rate-limit-stats")
async def get_rate_limit_stats():
    """Retrieve real-time rate limiter telemetry and DDoS protection status."""
    return rate_limiter.get_stats()


@router.post("/audit-logs/record")
async def record_custom_audit(req: Request):
    """Manually append a security audit record (e.g. from frontend action)."""
    # Validate API key to prevent unauthenticated audit log injection
    expected_key = os.environ.get("SD_AUDIT_API_KEY") or SD_AUDIT_API_KEY or "stackdoctor-internal-key"
    provided_key = req.headers.get("X-Audit-Key", "")
    if provided_key != expected_key:
        raise HTTPException(status_code=403, detail="Forbidden: invalid or missing audit API key.")

    data = await req.json()
    client_ip = req.client.host if req.client else "127.0.0.1"
    entry = audit_logger.record(
        action=data.get("action", "USER_ACTION"),
        project_id=data.get("project_id", "GLOBAL"),
        actor=data.get("actor", "user"),
        details=data.get("details", ""),
        status=data.get("status", "SUCCESS"),
        client_ip=client_ip,
        metadata=data.get("metadata", {}),
    )
    return {"status": "recorded", "entry": entry}
