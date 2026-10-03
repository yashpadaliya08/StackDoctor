"""
APM Analytics, High-Frequency Telemetry & Edge Concurrency Benchmark Router
==========================================================================
Endpoints for viewing real-time edge telemetry, profiling route performance,
running concurrent stress benchmarks against edge targets, and managing incident alerts.
"""

import asyncio
import time
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import httpx

from server.orchestrator.analytics import apm_hub, alert_manager, benchmark_runner

router = APIRouter(prefix="/api/analytics", tags=["Analytics & Alerts"])


class AlertConfigRequest(BaseModel):
    webhook_url: str
    channel_type: str = "discord"
    notify_on_down: bool = True
    notify_on_autoheal: bool = True
    notify_on_spike: bool = True
    enabled: bool = True


class BenchmarkRequest(BaseModel):
    target_url: str
    concurrency: int = 25
    duration_sec: int = 10
    path: str = "/"


class ProbeRequest(BaseModel):
    target_url: str
    path: str = "/"


@router.get("/{project_id}")
async def get_project_analytics(project_id: str):
    """Retrieve real-time APM telemetry (latencies, status codes, throughput, route profiles)."""
    return apm_hub.get_summary(project_id)


@router.post("/{project_id}/probe")
async def probe_deployment_latency(project_id: str, req: ProbeRequest):
    """
    On-demand live health & latency probe:
    Pings the live deployment URL, records exact millisecond latency,
    and pushes the metric into the project's real-time APM stream.
    """
    target = req.target_url.strip().rstrip("/")
    if not target.startswith(("http://", "https://")):
        target = f"https://{target}"
    clean_path = ("/" + req.path.lstrip("/")) if req.path else "/"
    url = f"{target}{clean_path}"

    t0 = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
            resp = await client.get(url)
            latency_ms = (time.perf_counter() - t0) * 1000.0
            status_code = resp.status_code
    except Exception as e:
        latency_ms = (time.perf_counter() - t0) * 1000.0
        status_code = 502

    apm_hub.record_request(project_id, status_code, latency_ms, clean_path, "GET")
    return {
        "status_code": status_code,
        "latency_ms": round(latency_ms, 2),
        "target_url": url,
        "timestamp": time.time(),
    }


@router.post("/{project_id}/benchmark")
async def start_concurrency_benchmark(
    project_id: str,
    req: BenchmarkRequest,
    background_tasks: BackgroundTasks,
):
    """
    Launches an asynchronous load test against the target phone server.
    Emits real-time progress and measures max RPS, p95 latency, and error rates.
    """
    current_status = benchmark_runner.get_status(project_id)
    if current_status.get("status") == "RUNNING":
        return {
            "status": "ALREADY_RUNNING",
            "message": "A benchmark is already in progress for this deployment.",
            "current_state": current_status,
        }

    # Run in background task so API responds immediately and user can poll progress
    background_tasks.add_task(
        benchmark_runner.run_benchmark,
        project_id=project_id,
        target_url=req.target_url,
        concurrency=req.concurrency,
        duration_sec=req.duration_sec,
        path=req.path,
    )

    return {
        "status": "STARTED",
        "message": f"Stress benchmark launched with {req.concurrency} concurrent connections for {req.duration_sec}s.",
        "project_id": project_id,
    }


@router.get("/{project_id}/benchmark/status")
async def get_benchmark_status(project_id: str):
    """Poll live progress or view the latest completed benchmark report."""
    return benchmark_runner.get_status(project_id)


@router.post("/{project_id}/reset")
async def reset_project_analytics(project_id: str):
    """Reset APM telemetry samples, status distribution, and route stats to a fresh baseline."""
    apm_hub.reset_tracker(project_id)
    benchmark_runner.reset_benchmark(project_id)
    return {
        "status": "RESET_SUCCESSFUL",
        "message": f"Telemetry samples and route statistics reset for {project_id}.",
        "summary": apm_hub.get_summary(project_id),
    }


@router.get("/alerts/config")
async def get_alert_configuration():
    """Retrieve configured incident notification webhook settings."""
    return alert_manager.get_config()


@router.post("/alerts/config")
async def save_alert_configuration(req: AlertConfigRequest):
    """Save Discord/Slack/Telegram webhook settings."""
    config = req.dict()
    alert_manager.save_config(config)
    return {"status": "SAVED", "config": config}


@router.post("/alerts/test")
async def test_alert_notification():
    """Trigger a live test notification to the configured webhook."""
    cfg = alert_manager.get_config()
    if not cfg.get("webhook_url"):
        return {"status": "ERROR", "message": "No webhook URL configured. Please enter a URL first."}

    success = alert_manager.dispatch_alert(
        title="StackDoctor Test Alert",
        description="This is a live test notification verifying your webhook integration with StackDoctor APM.",
        severity="INFO",
        project_id="SYSTEM_TEST",
    )
    if success:
        return {"status": "SUCCESS", "message": "Test notification dispatched successfully!"}
    else:
        return {"status": "FAILED", "message": "Webhook request failed. Verify your webhook URL."}
