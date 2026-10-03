import io
import json
import zipfile
from fastapi.testclient import TestClient
import pytest
from doctor.fixer import DoctorFixer
from server.main import app


@pytest.fixture
def client():
    return TestClient(app)


def create_mock_zip(content_dict: dict[str, str]) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for fname, content in content_dict.items():
            zf.writestr(fname, content)
    buf.seek(0)
    return buf


def test_health_check(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


def test_upload_and_analyze_clean_project(client):
    mock_app_key = DoctorFixer.generate_app_key()
    files = {
        "composer.json": json.dumps({"require": {"php": "^8.3", "laravel/framework": "^11.0"}}),
        ".env": f"APP_KEY={mock_app_key}\nAPP_DEBUG=false\nDB_CONNECTION=sqlite\nAPP_URL=https://app.studentapp.dev\n",
        "database/database.sqlite": "",
        "database/migrations/0001_create_users.php": "<?php",
        "storage/app/public/.gitignore": "",
        "storage/framework/cache/.gitignore": "",
        "storage/framework/sessions/.gitignore": "",
        "storage/framework/views/.gitignore": "",
        "storage/logs/.gitignore": "",
        "bootstrap/cache/.gitignore": "",
        "public/index.php": "<?php",
        "public/storage/dummy": "",
    }
    mock_zip = create_mock_zip(files)
    res = client.post(
        "/api/analyze/upload",
        files={"file": ("project.zip", mock_zip, "application/zip")},
    )
    assert res.status_code == 200
    data = res.json()
    assert "project_id" in data
    assert "report" in data
    assert data["report"]["readiness_score"] >= 90
    assert data["report"]["metadata"]["framework_version"] == "11.0"


def test_upload_and_fix_pipeline(client):
    # Upload broken project
    broken_files = {
        "composer.json": json.dumps({"require": {"php": "^8.2", "laravel/framework": "^10.0"}}),
        ".env": "APP_KEY=\nAPP_DEBUG=true\nDB_CONNECTION=mysql\nDB_HOST=127.0.0.1\nAPP_URL=http://localhost\n",
        "package.json": json.dumps({"devDependencies": {"vite": "^5.0", "tailwindcss": "^3.4"}}),
        "vite.config.js": "// vite",
        "public/index.php": "<?php",
    }
    mock_zip = create_mock_zip(broken_files)
    res = client.post(
        "/api/analyze/upload",
        files={"file": ("broken.zip", mock_zip, "application/zip")},
    )
    assert res.status_code == 200
    project_id = res.json()["project_id"]
    initial_score = res.json()["report"]["readiness_score"]
    assert initial_score < 70

    # Call /api/fix
    fix_res = client.post(
        "/api/fix",
        json={
            "project_id": project_id,
            "app_url": "https://mycoolapp.studentapp.dev",
            "db_host": "mysql-internal",
            "generate_docker": True,
        },
    )
    assert fix_res.status_code == 200
    fix_data = fix_res.json()
    assert len(fix_data["applied_fixes"]) > 0
    assert fix_data["updated_report"]["readiness_score"] > initial_score

    # Trigger /api/deploy with custom env_vars
    deploy_res = client.post(
        "/api/deploy",
        json={
            "project_id": project_id,
            "subdomain": "mycoolapp",
            "env_vars": {
                "mongoUrl": "mongodb+srv://user:pass@cluster.mongodb.net/test",
                "JWT_SECRET": "test-super-secret-key-12345",
            },
        },
    )
    assert deploy_res.status_code == 200
    deploy_data = deploy_res.json()
    deployment_id = deploy_data["deployment_id"]
    assert deploy_data["status"] in ("PENDING", "RUNNING")

    # Check /api/deploy/{id} status
    status_res = client.get(f"/api/deploy/{deployment_id}")
    assert status_res.status_code == 200
    assert status_res.json()["deployment_id"] == deployment_id

    # Verify session env_vars
    from server.orchestrator.pipeline import orchestrator
    sess = orchestrator.get_session(deployment_id)
    assert sess is not None
    assert sess.env_vars.get("mongoUrl") == "mongodb+srv://user:pass@cluster.mongodb.net/test"
    assert sess.env_vars.get("JWT_SECRET") == "test-super-secret-key-12345"

