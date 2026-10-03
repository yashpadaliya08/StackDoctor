"""
StackDoctor Permanent Dynamic Redirect Gateway
=============================================
Provides persistent, unchanging public URLs for applications deployed on edge phone nodes.
Even if underlying Cloudflare Quick Tunnels restart or re-assign new hostnames, the
permanent slug (e.g. /live/swiftride) automatically routes to the latest active target.
"""

import html
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from server.config import DATA_DIR
from server.orchestrator.registry import deployment_registry

logger = logging.getLogger("doctor.gateway")

GATEWAY_DIR = DATA_DIR / "gateway"
ROUTES_FILE = GATEWAY_DIR / "routes.json"

RESERVED_SLUGS = {
    "api", "live", "health", "routes", "docs", "redoc", "openapi", 
    "static", "admin", "null", "undefined", "system", "dashboard"
}


class GatewayManager:
    """Manages permanent slugs and dynamic target redirection."""

    def __init__(self) -> None:
        GATEWAY_DIR.mkdir(parents=True, exist_ok=True)
        self._routes: Dict[str, Dict[str, Any]] = {}
        self._load()
        self._sync_with_registry()

    def _load(self) -> None:
        if ROUTES_FILE.exists():
            try:
                self._routes = json.loads(ROUTES_FILE.read_text(encoding="utf-8"))
            except Exception as e:
                logger.warning(f"Failed to load gateway routes: {e}")
                self._routes = {}

    def _save(self) -> None:
        """Atomically saves routes to disk to prevent file corruption."""
        try:
            import os
            import tempfile
            tmp_path = GATEWAY_DIR / f"routes.{os.getpid()}.tmp"
            tmp_path.write_text(json.dumps(self._routes, indent=2), encoding="utf-8")
            os.replace(tmp_path, ROUTES_FILE)
        except Exception as e:
            logger.error(f"Failed to save gateway routes: {e}")

    def _sync_with_registry(self) -> None:
        """Ensures all deployments in registry have a permanent gateway slug and prunes deleted projects."""
        records = deployment_registry.list_all()
        active_project_ids = {rec.project_id for rec in records}
        changed = False

        # 1. Prune orphaned routes whose projects were deleted
        dead_slugs = [
            slug for slug, data in self._routes.items()
            if data.get("project_id") and data.get("project_id") not in active_project_ids
        ]
        for slug in dead_slugs:
            logger.info(f"Pruning orphaned gateway route: {slug} (project {self._routes[slug].get('project_id')})")
            del self._routes[slug]
            changed = True

        # 2. Add or update active projects
        for rec in records:
            clean_name = re.sub(r"[^a-zA-Z0-9\-]", "", rec.project_name.lower().replace(" ", "-")).strip("-")
            clean_sub = re.sub(r"[^a-zA-Z0-9\-]", "", rec.subdomain.lower().replace("repo-", "").replace("app-", "")).strip("-")
            default_slug = clean_name if clean_name and len(clean_name) >= 3 else (clean_sub or rec.project_id[:8])

            existing_slug = None
            for s, data in self._routes.items():
                if data.get("project_id") == rec.project_id:
                    existing_slug = s
                    break

            slug_to_use = existing_slug or default_slug
            if not existing_slug and slug_to_use in self._routes:
                slug_to_use = f"{slug_to_use}-{rec.project_id[:4]}"

            curr = self._routes.get(slug_to_use, {})
            if (
                curr.get("target_url") != rec.live_url
                or curr.get("status") != rec.status
                or curr.get("project_name") != rec.project_name
            ):
                self._routes[slug_to_use] = {
                    "slug": slug_to_use,
                    "project_id": rec.project_id,
                    "project_name": rec.project_name,
                    "framework": rec.framework,
                    "port": rec.port,
                    "target": rec.target,
                    "target_url": rec.live_url,
                    "status": rec.status,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                changed = True

        if changed:
            self._save()

    def list_routes(self) -> List[Dict[str, Any]]:
        self._sync_with_registry()
        return list(self._routes.values())

    def get_route(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Resolves target by slug, project_id, or subdomain."""
        self._sync_with_registry()
        clean = identifier.lower().strip()

        # 1. Direct slug match
        if clean in self._routes:
            return self._routes[clean]

        # 2. Match by project_id
        for data in self._routes.values():
            if data.get("project_id") == clean or data.get("project_id", "").startswith(clean):
                return data

        # 3. Match by project name sanitized
        for data in self._routes.values():
            if re.sub(r"[^a-zA-Z0-9]", "", data.get("project_name", "").lower()) == clean:
                return data

        return None

    def set_slug(self, project_id: str, new_slug: str, force: bool = False) -> Dict[str, Any]:
        """Customizes the permanent slug for a project."""
        clean_slug = re.sub(r"[^a-z0-9\-]", "", new_slug.lower().strip()).strip("-")
        if len(clean_slug) < 2:
            raise ValueError("Slug must be at least 2 characters alphanumeric (hyphens allowed).")
        if clean_slug in RESERVED_SLUGS:
            raise ValueError(f"Slug '{clean_slug}' is reserved for system endpoints. Please choose another slug.")

        # Check if used by another project
        if clean_slug in self._routes and self._routes[clean_slug].get("project_id") != project_id:
            existing_holder = self._routes[clean_slug]
            if not force and existing_holder.get("status") == "RUNNING":
                raise ValueError(f"Slug '{clean_slug}' is currently in use by active project '{existing_holder.get('project_name', 'Unknown')}'. Use force to reassign.")
            # Automatically transfer slug from stopped/superseded project
            old_holder_id = existing_holder.get("project_id")
            logger.info(f"Reassigning slug '{clean_slug}' from {old_holder_id} to {project_id}")
            del self._routes[clean_slug]

        # Remove old slug for this project
        old_slugs = [s for s, d in self._routes.items() if d.get("project_id") == project_id and s != clean_slug]
        for s in old_slugs:
            del self._routes[s]

        rec = deployment_registry.get(project_id)
        if not rec:
            raise ValueError(f"Project '{project_id}' not found in deployment registry.")

        entry = {
            "slug": clean_slug,
            "project_id": rec.project_id,
            "project_name": rec.project_name,
            "framework": rec.framework,
            "port": rec.port,
            "target": rec.target,
            "target_url": rec.live_url,
            "status": rec.status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._routes[clean_slug] = entry
        self._save()
        return entry

    def update_target_url(self, project_id: str, new_target_url: str) -> None:
        """Called by watchdog or drivers when tunnel URL changes."""
        self._sync_with_registry()
        updated = False
        for slug, data in self._routes.items():
            if data.get("project_id") == project_id:
                data["target_url"] = new_target_url
                data["status"] = "RUNNING"
                data["updated_at"] = datetime.now(timezone.utc).isoformat()
                updated = True
        if updated:
            self._save()
            logger.info(f"🔗 Gateway target URL updated for project {project_id}: {new_target_url}")

    def generate_cloudflare_worker_script(self) -> str:
        """Generates a complete, ready-to-deploy Cloudflare Worker script for free edge redirection."""
        routes_map = {
            slug: data.get("target_url")
            for slug, data in self._routes.items()
            if data.get("target_url") and data.get("status") == "RUNNING"
        }
        json_routes = json.dumps(routes_map, indent=2)

        return f"""/**
 * StackDoctor Edge Gateway - Cloudflare Worker
 * 100% Free Persistent Redirect Gateway (100,000 req/day for $0)
 * Deploy this script at dash.cloudflare.com -> Workers & Pages -> Create Worker
 */

const STATIC_ROUTES = {json_routes};

export default {{
  async fetch(request, env, ctx) {{
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle root health/index
    if (pathname === "/" || pathname === "/health") {{
      return new Response(JSON.stringify({{
        service: "StackDoctor Cloudflare Edge Gateway",
        status: "ACTIVE",
        active_routes: Object.keys(STATIC_ROUTES).length,
        timestamp: new Date().toISOString()
      }}, null, 2), {{
        headers: {{ "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }}
      }});
    }}

    // Extract slug from /live/:slug or /:slug
    const cleanPath = pathname.replace(/^\\/live\\//, "").replace(/^\\//, "");
    const parts = cleanPath.split("/");
    const slug = parts[0].toLowerCase();
    const subpath = parts.slice(1).join("/");

    // 1. Check dynamic KV storage first, then fallback to static routes
    let target = null;
    if (env.STACKDOCTOR_ROUTES) {{
      target = await env.STACKDOCTOR_ROUTES.get(slug);
    }}
    if (!target && STATIC_ROUTES[slug]) {{
      target = STATIC_ROUTES[slug];
    }}

    if (!target) {{
      return new Response(
        `<!DOCTYPE html>
        <html>
        <head><title>StackDoctor Gateway — Not Found</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="background:#090d16;color:#f8fafc;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="background:#111827;border:1px solid #374151;border-radius:16px;padding:32px;max-width:480px;text-align:center;">
            <h2 style="color:#ef4444;margin-top:0;">⚡ Project Offline or Not Found</h2>
            <p style="color:#9ca3af;">The requested slug <code>${{slug}}</code> is not currently mapped or the edge node is offline.</p>
            <p style="font-size:12px;color:#6b7280;">StackDoctor Edge Gateway</p>
          </div>
        </body>
        </html>`,
        {{ status: 404, headers: {{ "Content-Type": "text/html" }} }}
      );
    }}

    // Construct destination URL preserving query parameters and subpaths
    const destUrl = new URL(target.replace(/\\/+$/, ""));
    if (subpath) {{
      destUrl.pathname = (destUrl.pathname.replace(/\\/+$/, "") + "/" + subpath).replace(/\\/+/g, "/");
    }}
    destUrl.search = url.search;

    // 307 Temporary Redirect preserves HTTP method (GET, POST, etc.)
    return Response.redirect(destUrl.toString(), 307);
  }}
}};
"""

    def render_waiting_room_html(self, slug: str, route_data: Dict[str, Any]) -> str:
        """Renders a sleek, animated waiting room when an edge server is cold-booting."""
        raw_name = route_data.get("project_name", "Application")
        safe_app_name = html.escape(str(raw_name))
        safe_slug = html.escape(str(slug))
        safe_framework = html.escape(str(route_data.get("framework", "Full-Stack")))
        target_url = str(route_data.get("target_url") or "")
        safe_target_js = json.dumps(target_url)

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connecting to {safe_app_name} — StackDoctor Edge</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            background: #07090e;
            color: #f8fafc;
            font-family: 'Inter', sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }}
        .card {{
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 44px;
            max-width: 520px;
            width: 100%;
            text-align: center;
            box-shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(56, 189, 248, 0.12);
            backdrop-filter: blur(20px);
            position: relative;
            overflow: hidden;
        }}
        .glow {{
            position: absolute;
            top: -60px;
            left: 50%;
            transform: translateX(-50%);
            width: 200px;
            height: 120px;
            background: radial-gradient(circle, rgba(56, 189, 248, 0.3) 0%, transparent 70%);
            pointer-events: none;
        }}
        .pulse-box {{
            width: 68px;
            height: 68px;
            margin: 0 auto 24px auto;
            border-radius: 20px;
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            animation: pulse 2s infinite ease-in-out;
        }}
        @keyframes pulse {{
            0%, 100% {{ transform: scale(1); box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.4); }}
            50% {{ transform: scale(1.06); box-shadow: 0 0 25px 6px rgba(56, 189, 248, 0.25); }}
        }}
        h1 {{ font-size: 1.55rem; font-weight: 800; margin-bottom: 8px; }}
        p.subtitle {{ color: #94a3b8; font-size: 0.92rem; line-height: 1.5; margin-bottom: 24px; }}
        .badge {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
            background: rgba(16, 185, 129, 0.12);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.25);
            margin-bottom: 20px;
        }}
        .status-bar {{
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 12px;
            padding: 14px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem;
            color: #38bdf8;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }}
        .spinner {{
            width: 14px;
            height: 14px;
            border: 2px solid rgba(56, 189, 248, 0.2);
            border-top-color: #38bdf8;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }}
        @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
        .footer-note {{ font-size: 0.78rem; color: #64748b; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="glow"></div>
        <div class="pulse-box">📱</div>
        <div class="badge">● STACKDOCTOR PERMANENT GATEWAY</div>
        <h1>{safe_app_name}</h1>
        <p class="subtitle">Waking up mobile edge node runtime ({safe_framework}). Your permanent link will connect automatically.</p>
        
        <div class="status-bar">
            <div class="spinner"></div>
            <span id="statusText">Establishing secure tunnel handshake...</span>
        </div>

        <p class="footer-note">Permanent Slug: <code>/live/{safe_slug}</code> — Target is auto-updated.</p>
    </div>

    <script>
        const targetUrl = {safe_target_js};
        let attempts = 0;

        async function checkAndRedirect() {{
            attempts++;
            if (!targetUrl) {{
                document.getElementById("statusText").innerText = "Waiting for edge node deployment...";
                setTimeout(checkAndRedirect, 2500);
                return;
            }}

            try {{
                document.getElementById("statusText").innerText = "Routing to live server (attempt " + attempts + ")...";
                // Probe target through image or fetch
                const res = await fetch(targetUrl, {{ method: 'HEAD', mode: 'no-cors' }});
                // If reached without exception, forward immediately
                window.location.href = targetUrl;
            }} catch (e) {{
                setTimeout(checkAndRedirect, 2000);
            }}
        }}

        // Kickoff redirect probe
        setTimeout(checkAndRedirect, 800);
    </script>
</body>
</html>"""


# Global Gateway Singleton
gateway_manager = GatewayManager()
