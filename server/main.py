from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from server.routes import analyze, deploy, fix, github_deploy, phone, manage, cicd, domains, security, analytics, gateway
from server.orchestrator.watchdog import watchdog
from server.middleware.rate_limiter import RateLimitMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Modern lifespan handler: starts watchdog on boot, stops on shutdown."""
    watchdog.start_background_loop()
    yield
    watchdog.stop()


app = FastAPI(
    title="Laravel Doctor & Deployment Platform API",
    version="1.0.0",
    description="Automated diagnostic, repair, and deployment orchestration platform for Laravel projects.",
    lifespan=lifespan,
)

# Rate Limiter Middleware
app.add_middleware(RateLimitMiddleware)

# CORS Middleware - Explicit Origins
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(analyze.router)
app.include_router(fix.router)
app.include_router(deploy.router)
app.include_router(github_deploy.router)
app.include_router(phone.router)
app.include_router(manage.router)
app.include_router(cicd.router)
app.include_router(domains.router)
app.include_router(security.router)
app.include_router(analytics.router)
app.include_router(gateway.router)


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "laravel-doctor-platform",
        "version": "1.0.0",
    }

@app.get("/live")
async def redirect_to_live():
    from fastapi.responses import RedirectResponse
    from server.orchestrator.pipeline import orchestrator

    latest = orchestrator.get_latest_deployment()
    if latest and latest.get("live_url"):
        return RedirectResponse(latest["live_url"], status_code=307)
    return RedirectResponse("/", status_code=307)


# Mount Static Frontend if built
dist_dir = Path(__file__).resolve().parent.parent / "web" / "dist"
if dist_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="static")


if __name__ == "__main__":
    import os
    import uvicorn
    bind_host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run("server.main:app", host=bind_host, port=8000, reload=True)
