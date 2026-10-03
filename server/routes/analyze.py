import secrets
import shutil
from pathlib import Path
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from doctor.engine import DoctorEngine
from doctor.fixer import DoctorFixer
from doctor.ingestion.git_cloner import SafeGitCloner
from doctor.ingestion.zip_extractor import IngestionSecurityError, SafeZipExtractor
from doctor.models import DiagnosticReport
from server.config import PROJECTS_DIR, UPLOADS_DIR


router = APIRouter(prefix="/api/analyze", tags=["Analysis"])
doctor = DoctorEngine()


class GitAnalysisRequest(BaseModel):
    repo_url: str
    branch: str | None = None


class AnalysisResponse(BaseModel):
    project_id: str
    report: DiagnosticReport


@router.post("/upload", response_model=AnalysisResponse)
async def analyze_zip_upload(file: UploadFile = File(...)) -> AnalysisResponse:
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip archive files are supported.")

    project_id = secrets.token_hex(6)
    zip_target = UPLOADS_DIR / f"{project_id}.zip"
    extract_target = PROJECTS_DIR / project_id

    MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB limit

    try:
        # 1. Save uploaded zip safely with chunked size enforcement
        total_written = 0
        with open(zip_target, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 64)
                if not chunk:
                    break
                total_written += len(chunk)
                if total_written > MAX_UPLOAD_BYTES:
                    buffer.close()
                    if zip_target.exists():
                        zip_target.unlink()
                    raise HTTPException(
                        status_code=413,
                        detail="Uploaded zip archive exceeds maximum allowed size of 100MB."
                    )
                buffer.write(chunk)

        # 2. Extract with Zip-Slip & Zip-Bomb defense and automatic flattening
        SafeZipExtractor.extract(zip_target, extract_target)
        report = doctor.analyze(extract_target)

        return AnalysisResponse(project_id=project_id, report=report)

    except IngestionSecurityError as e:
        shutil.rmtree(extract_target, ignore_errors=True)
        if zip_target.exists():
            zip_target.unlink()
        raise HTTPException(status_code=400, detail=f"Archive security check failed: {str(e)}")
    except Exception as e:
        shutil.rmtree(extract_target, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/git", response_model=AnalysisResponse)
async def analyze_git_repo(req: GitAnalysisRequest) -> AnalysisResponse:
    if not SafeGitCloner.is_valid_git_url(req.repo_url):
        raise HTTPException(
            status_code=400,
            detail="Invalid Git repository URL. Paste a GitHub, GitLab, or Bitbucket URL."
        )

    project_id = secrets.token_hex(6)
    extract_target = PROJECTS_DIR / project_id

    try:
        # Normalize URL (handles browser-style GitHub URLs, /tree/branch paths, etc.)
        clone_url, url_branch = SafeGitCloner.normalize_git_url(req.repo_url)
        effective_branch = req.branch or url_branch
        SafeGitCloner.clone(clone_url, extract_target, branch=effective_branch)
        report = doctor.analyze(extract_target)
        return AnalysisResponse(project_id=project_id, report=report)

    except Exception as e:
        shutil.rmtree(extract_target, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to clone and analyze repository: {str(e)}")


@router.get("/sample/{sample_type}", response_model=AnalysisResponse)
async def get_sample_project(sample_type: str) -> AnalysisResponse:
    project_id = f"demo_{sample_type}_{secrets.token_hex(4)}"
    project_dir = PROJECTS_DIR / project_id
    project_dir.mkdir(parents=True, exist_ok=True)

    from server.orchestrator.driver import LocalRunnerDriver

    if sample_type in ("python", "fastapi"):
        # Create minimal working Python FastAPI project
        main_code = '''from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="Student Task Manager API", version="1.0.0")

@app.get("/", response_class=HTMLResponse)
def index():
    return """<!DOCTYPE html>
<html>
<head>
    <title>FastAPI on Phone Cloud</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { background: #0b0f17; color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: #111827; border: 1px solid #10b981; border-radius: 16px; padding: 36px; max-width: 520px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        h1 { color: #10b981; margin: 16px 0 8px 0; font-size: 1.8rem; }
        .badge { background: #064e3b; color: #34d399; padding: 6px 14px; border-radius: 9999px; font-weight: 700; font-size: 0.78rem; display: inline-block; border: 1px solid #059669; }
        p { color: #9ca3af; line-height: 1.6; margin-bottom: 20px; }
        .api-link { display: inline-block; background: #10b981; color: #0b0f17; font-weight: 700; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="card">
        <span class="badge">● 24/7 PYTHON RUNTIME</span>
        <h1>⚡ FastAPI Microservice</h1>
        <p>Your Python FastAPI project is deployed live on your spare Android phone (Termux ARM64) via Cloudflare 24/7 tunnel!</p>
        <a class="api-link" href="/docs">Explore Swagger API Docs →</a>
    </div>
</body>
</html>"""

@app.get("/api/health")
def health():
    return {"status": "ok", "runtime": "Python 3.13 (Termux ARM64)", "framework": "FastAPI"}
'''
        (project_dir / "main.py").write_text(main_code, encoding="utf-8")
        (project_dir / "requirements.txt").write_text("fastapi<0.100.0\npydantic<2.0.0\nuvicorn>=0.28.0\n", encoding="utf-8")
        (project_dir / ".env").write_text("HOST=0.0.0.0\nPORT=8000\nDEBUG=False\n", encoding="utf-8")

    elif sample_type in ("node", "mern"):
        import json
        pkg_data = {
            "name": "mern-task-service",
            "version": "1.0.0",
            "description": "Express REST Microservice deployed on Android Phone Cloud",
            "main": "server.js",
            "scripts": {
                "start": "node server.js"
            },
            "dependencies": {
                "express": "^4.19.2",
                "cors": "^2.8.5"
            }
        }
        (project_dir / "package.json").write_text(json.dumps(pkg_data, indent=2), encoding="utf-8")
        (project_dir / ".env").write_text("PORT=5000\nNODE_ENV=production\n", encoding="utf-8")

        server_code = """const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const tasks = [
  { id: 1, title: "Initialize Termux Phone Node.js Cluster", status: "completed" },
  { id: 2, title: "Route public traffic via Cloudflare 24/7 Tunnel", status: "completed" },
  { id: 3, title: "Scale to multi-project hosting", status: "in-progress" }
];

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>MERN / Express on Phone Cloud</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { background: #0b0f17; color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 32px; max-width: 580px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .badge { display: inline-block; background: #064e3b; color: #34d399; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px; letter-spacing: 0.5px; border: 1px solid #059669; }
    h1 { margin: 0 0 12px 0; font-size: 24px; color: #10b981; }
    p { color: #9ca3af; line-height: 1.6; margin: 0 0 20px 0; }
    .task-list { background: #0b0f17; border-radius: 8px; padding: 12px; margin-bottom: 20px; }
    .task-item { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #1f2937; font-size: 14px; }
    .task-item:last-child { border-bottom: none; }
    .status { color: #10b981; font-weight: 600; }
    .api-link { display: inline-block; background: #10b981; color: #0b0f17; font-weight: 600; padding: 10px 18px; border-radius: 6px; text-decoration: none; transition: 0.2s; }
    .api-link:hover { background: #059669; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">● 24/7 LIVE ON ANDROID PHONE (NODE.JS LTS)</div>
    <h1>⚡ Node.js / Express Microservice</h1>
    <p>Your MERN Express backend is running on your spare Android phone (Termux ARM64) connected via a secure 24/7 Cloudflare edge tunnel!</p>
    <div class="task-list">
      <div class="task-item"><span>🚀 Initialized Node v24 LTS</span><span class="status">DONE</span></div>
      <div class="task-item"><span>🌐 Cloudflare Quick Tunnel</span><span class="status">ACTIVE</span></div>
      <div class="task-item"><span>📦 In-Memory Tasks API</span><span class="status">READY</span></div>
    </div>
    <a class="api-link" href="/api/tasks" target="_blank">View JSON Tasks API →</a>
  </div>
</body>
</html>`);
});

app.get('/api/tasks', (req, res) => {
  res.json({ success: true, count: tasks.length, tasks });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    runtime: 'Node.js ' + process.version + ' (Termux ARM64)',
    framework: 'Express',
    uptime: process.uptime()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Node server running on port ${PORT}`);
});
"""
        (project_dir / "server.js").write_text(server_code, encoding="utf-8")

    elif sample_type == "clean":
        # Create minimal compliant Laravel 11 with SQLite
        import json
        (project_dir / "composer.json").write_text(json.dumps({
            "name": "student/portfolio",
            "require": {"php": "^8.3", "laravel/framework": "^11.0"}
        }, indent=2))
        mock_key = DoctorFixer.generate_app_key()
        (project_dir / ".env").write_text(f"APP_KEY={mock_key}\nAPP_DEBUG=false\nDB_CONNECTION=sqlite\nAPP_URL=http://127.0.0.1:8081\n")
        (project_dir / "database").mkdir(exist_ok=True)
        (project_dir / "database" / "database.sqlite").touch()
        (project_dir / "database" / "migrations").mkdir(parents=True, exist_ok=True)
        (project_dir / "database" / "migrations" / "0001_create_users.php").write_text("<?php")
        for sub in ("app/public", "framework/cache", "framework/sessions", "framework/views", "logs"):
            (project_dir / "storage" / sub).mkdir(parents=True, exist_ok=True)
        (project_dir / "bootstrap" / "cache").mkdir(parents=True, exist_ok=True)
        (project_dir / "public").mkdir(exist_ok=True)
        (project_dir / "public" / "index.php").write_text(
            LocalRunnerDriver._render_live_template(project_id, {"APP_NAME": "Student Portfolio App", "DB_CONNECTION": "sqlite"}, 8081),
            encoding="utf-8"
        )
        (project_dir / "public" / "storage").mkdir(exist_ok=True)
    else:
        # Create typical dirty student project with MySQL, missing APP_KEY, Vite manifest missing
        import json
        (project_dir / "composer.json").write_text(json.dumps({
            "name": "student/hotel-management-system",
            "require": {"php": "^8.2", "laravel/framework": "^11.0", "ext-pdo_mysql": "*"}
        }, indent=2))
        (project_dir / ".env").write_text("APP_NAME=HotelMS\nAPP_ENV=local\nAPP_KEY=\nAPP_DEBUG=true\nAPP_URL=http://localhost:8000\nDB_CONNECTION=mysql\nDB_HOST=127.0.0.1\n")
        (project_dir / "package.json").write_text(json.dumps({
            "devDependencies": {"vite": "^5.0", "tailwindcss": "^3.4"}
        }))
        (project_dir / "vite.config.js").write_text("// vite")
        (project_dir / "public").mkdir(exist_ok=True)
        (project_dir / "public" / "index.php").write_text(
            LocalRunnerDriver._render_live_template(project_id, {"APP_NAME": "Hotel Management System", "DB_CONNECTION": "mysql"}, 8081),
            encoding="utf-8"
        )
        (project_dir / "database").mkdir(exist_ok=True)
        (project_dir / "database" / "migrations").mkdir(parents=True, exist_ok=True)
        (project_dir / "database" / "migrations" / "create_rooms.php").write_text("<?php")

    report = doctor.analyze(project_dir)
    return AnalysisResponse(project_id=project_id, report=report)
