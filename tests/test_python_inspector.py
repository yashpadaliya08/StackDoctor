import json
from pathlib import Path
import pytest
from doctor.engine import DoctorEngine
from doctor.fixer import Fixer
from doctor.models import CheckStatus


def test_fastapi_inspection_clean(tmp_path: Path):
    reqs = tmp_path / "requirements.txt"
    reqs.write_text("fastapi==0.110.0\nuvicorn==0.28.0\npydantic==2.6.4\n")
    main = tmp_path / "main.py"
    main.write_text("from fastapi import FastAPI\napp = FastAPI()\n\n@app.get('/')\ndef root():\n    return {'status': 'ok'}\n")
    (tmp_path / ".env").write_text("PORT=8000\nHOST=0.0.0.0\n")

    engine = DoctorEngine()
    report = engine.analyze(tmp_path)

    assert report.metadata.stack == "python"
    assert "FastAPI" in report.metadata.framework
    assert report.failed_count == 0
    assert report.readiness_score >= 80


def test_fastapi_missing_requirements_autofix(tmp_path: Path):
    # Only main.py, no requirements.txt, no .env
    main = tmp_path / "main.py"
    main.write_text("from fastapi import FastAPI\napp = FastAPI()\n")

    engine = DoctorEngine()
    report = engine.analyze(tmp_path)

    assert report.metadata.stack == "python"
    assert report.auto_fixable_count > 0

    # Apply fixes
    fixes = engine.apply_fixes(tmp_path)
    assert len(fixes) > 0
    assert (tmp_path / "requirements.txt").exists()
    assert (tmp_path / ".env").exists()
    assert "fastapi" in (tmp_path / "requirements.txt").read_text()
    assert "uvicorn" in (tmp_path / "requirements.txt").read_text()

    # Re-analyze
    report_fixed = engine.analyze(tmp_path)
    assert report_fixed.failed_count == 0
    assert report_fixed.readiness_score >= 80


def test_django_allowed_hosts_autofix(tmp_path: Path):
    (tmp_path / "manage.py").write_text("#!/usr/bin/env python\n")
    (tmp_path / "requirements.txt").write_text("django==5.0.0\n")
    app_dir = tmp_path / "myproject"
    app_dir.mkdir()
    settings_file = app_dir / "settings.py"
    settings_file.write_text("SECRET_KEY = 'secret'\nALLOWED_HOSTS = []\n")

    engine = DoctorEngine()
    report = engine.analyze(tmp_path)

    assert report.metadata.stack == "python"
    assert "Django" in report.metadata.framework

    # Fix
    engine.apply_fixes(tmp_path)
    assert "ALLOWED_HOSTS = ['*']" in settings_file.read_text()

    report_fixed = engine.analyze(tmp_path)
    allowed_checks = [c for c in report_fixed.checks if c.id == "py_django_allowed_hosts"]
    assert len(allowed_checks) == 1
    assert allowed_checks[0].status == CheckStatus.PASSED
