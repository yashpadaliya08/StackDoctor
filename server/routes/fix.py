from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from doctor.engine import DoctorEngine
from doctor.models import DiagnosticReport, FixAction
from server.config import PROJECTS_DIR


router = APIRouter(prefix="/api/fix", tags=["Auto-Fix"])
doctor = DoctorEngine()


class FixRequest(BaseModel):
    project_id: str
    app_url: str = "http://127.0.0.1:8081"
    db_host: str = "127.0.0.1"
    generate_docker: bool = True


class FixResponse(BaseModel):
    project_id: str
    applied_fixes: list[FixAction]
    updated_report: DiagnosticReport


import re

PROJECT_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{4,64}$")


@router.post("", response_model=FixResponse)
async def apply_fixes(req: FixRequest) -> FixResponse:
    if not PROJECT_ID_RE.match(req.project_id):
        raise HTTPException(status_code=400, detail="Invalid project identifier format.")

    project_dir = (PROJECTS_DIR / req.project_id).resolve()
    try:
        project_dir.relative_to(PROJECTS_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project path traversal.")

    if not project_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Project '{req.project_id}' not found.")

    # Find inner folder if nested
    actual_dir = project_dir
    children = [p for p in project_dir.iterdir() if p.is_dir() and p.name not in ("__MACOSX",)]
    if len(children) == 1 and (children[0] / "composer.json").exists():
        actual_dir = children[0]

    try:
        applied = doctor.apply_fixes(
            actual_dir,
            target_app_url=req.app_url,
            target_db_host=req.db_host,
            generate_docker=req.generate_docker,
        )

        updated_report = doctor.analyze(actual_dir)

        return FixResponse(
            project_id=req.project_id,
            applied_fixes=applied,
            updated_report=updated_report,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply automated fixes: {str(e)}")
