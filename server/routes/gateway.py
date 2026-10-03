import html
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from server.orchestrator.gateway import gateway_manager

router = APIRouter(tags=["Permanent Gateway"])


class UpdateSlugRequest(BaseModel):
    project_id: str
    slug: str
    force: Optional[bool] = False


@router.get("/api/gateway/routes")
async def get_gateway_routes(request: Request) -> Dict[str, Any]:
    """Returns all active permanent gateway routes."""
    routes = gateway_manager.list_routes()
    base_url = str(request.base_url).rstrip("/")
    for r in routes:
        r["permanent_local_url"] = f"{base_url}/live/{r['slug']}"
    return {"routes": routes, "total": len(routes)}


@router.post("/api/gateway/slug")
async def update_project_slug(req: UpdateSlugRequest) -> Dict[str, Any]:
    """Assigns or updates a friendly permanent slug for a project."""
    try:
        updated = gateway_manager.set_slug(req.project_id, req.slug, force=req.force or False)
        return {"status": "SUCCESS", "route": updated}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/gateway/worker/script", response_class=PlainTextResponse)
async def get_cloudflare_worker_script() -> str:
    """Returns the ready-to-deploy Cloudflare Worker script for free edge redirection."""
    return gateway_manager.generate_cloudflare_worker_script()


@router.api_route("/live/{slug}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"])
@router.api_route("/live/{slug}/{subpath:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"])
async def redirect_slug(slug: str, request: Request, subpath: str = "", wait: Optional[bool] = False):
    """
    Permanent Public Redirect Endpoint.
    Shareable URL: /live/{slug} (e.g. /live/swiftride or /live/todo)
    Automatically points to the latest live Cloudflare tunnel or edge node port,
    preserving subpaths, HTTP methods, and query strings.
    """
    route = gateway_manager.get_route(slug)
    if not route:
        # Check if user passed project_id directly
        routes = gateway_manager.list_routes()
        matched = [r for r in routes if r.get("project_id", "").startswith(slug.lower())]
        if matched:
            route = matched[0]

    if not route:
        safe_slug = html.escape(str(slug))
        return HTMLResponse(
            f"""<!DOCTYPE html><html><body style="background:#090d16;color:#fff;font-family:sans-serif;padding:40px;text-align:center;">
            <h2>⚡ Project Slug '{safe_slug}' Not Found</h2>
            <p style="color:#94a3b8;">No deployment is currently mapped to this permanent link.</p>
            <a href="/" style="color:#38bdf8;">Return to Dashboard</a>
            </body></html>""",
            status_code=404,
        )

    target_url = route.get("target_url")
    status = route.get("status")

    # If wait mode requested or target is currently not marked RUNNING, render waiting room (for GET requests)
    if (wait or status != "RUNNING" or not target_url) and request.method == "GET" and not subpath:
        return HTMLResponse(gateway_manager.render_waiting_room_html(slug, route))

    if not target_url:
        safe_name = html.escape(str(route.get('project_name', slug)))
        return HTMLResponse(
            f"""<!DOCTYPE html><html><body style="background:#090d16;color:#fff;font-family:sans-serif;padding:40px;text-align:center;">
            <h2>⏳ Edge Node Starting</h2>
            <p style="color:#94a3b8;">Deployment '{safe_name}' is booting up.</p>
            </body></html>""",
            status_code=503,
        )

    # Construct destination URL preserving subpaths and query parameters
    dest = target_url.rstrip("/")
    if subpath:
        dest = f"{dest}/{subpath.lstrip('/')}"
    if request.url.query:
        separator = "&" if "?" in dest else "?"
        dest = f"{dest}{separator}{request.url.query}"

    # Fast 307 Temporary Redirect (preserves original HTTP method: POST stays POST)
    return RedirectResponse(
        dest,
        status_code=307,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-StackDoctor-Gateway": slug,
        },
    )
