import io
import json
import zipfile
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from server.main import app
from doctor.ingestion.git_cloner import SafeGitCloner, GitCloneError
from doctor.ingestion.zip_extractor import SafeZipExtractor
from doctor.fixer import Fixer


@pytest.fixture
def client():
    return TestClient(app)


def test_deploy_path_traversal_rejected(client):
    payload = {
        "project_id": "../../etc",
        "subdomain": "test",
        "target": "phone"
    }
    res = client.post("/api/deploy", json=payload)
    assert res.status_code == 400
    assert "Invalid project" in res.json()["detail"]


def test_deploy_db_name_injection_rejected(client):
    payload = {
        "project_id": "clean_id_1234",
        "subdomain": "test",
        "db_name": "db`; rm -rf ~; --",
        "target": "phone"
    }
    res = client.post("/api/deploy", json=payload)
    assert res.status_code == 400
    assert "Invalid database name" in res.json()["detail"]


def test_deploy_seeder_injection_rejected(client):
    payload = {
        "project_id": "clean_id_1234",
        "subdomain": "test",
        "run_seeder": True,
        "seeder_class": "Seeder; touch /tmp/pwn",
        "target": "phone"
    }
    res = client.post("/api/deploy", json=payload)
    assert res.status_code == 400
    assert "Invalid database seeder class name" in res.json()["detail"]


def test_deploy_crlf_env_rejected(client):
    payload = {
        "project_id": "clean_id_1234",
        "subdomain": "test",
        "env_vars": {
            "DB_PASS": "pass\nMALICIOUS=true"
        },
        "target": "phone"
    }
    res = client.post("/api/deploy", json=payload)
    assert res.status_code == 400
    assert "forbidden newline characters" in res.json()["detail"]


def test_fix_path_traversal_rejected(client):
    payload = {
        "project_id": "../.."
    }
    res = client.post("/api/fix", json=payload)
    assert res.status_code == 400
    assert "Invalid project" in res.json()["detail"]


def test_git_clone_flag_injection_rejected(tmp_path: Path):
    with pytest.raises(GitCloneError) as exc_info:
        SafeGitCloner.clone("https://github.com/user/repo.git", tmp_path, branch="--upload-pack=pwn")
    assert "Invalid Git branch name" in str(exc_info.value)

    with pytest.raises(GitCloneError) as exc_info2:
        SafeGitCloner.clone("--upload-pack=pwn", tmp_path)
    assert "Invalid Git repository URL" in str(exc_info2.value)


def test_zip_flatten_node_and_python(tmp_path: Path):
    # Test Node.js nested flattening
    node_zip = tmp_path / "node_app.zip"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("my-nested-node-app/package.json", '{"name": "test-app"}')
        zf.writestr("my-nested-node-app/server.js", 'console.log("hello");')
    node_zip.write_bytes(buf.getvalue())

    extract_dir = tmp_path / "extracted_node"
    SafeZipExtractor.extract(node_zip, extract_dir)
    assert (extract_dir / "package.json").is_file()
    assert (extract_dir / "server.js").is_file()
    assert not (extract_dir / "my-nested-node-app").exists()

    # Test Python nested flattening
    py_zip = tmp_path / "py_app.zip"
    buf_py = io.BytesIO()
    with zipfile.ZipFile(buf_py, "w") as zf:
        zf.writestr("my-python-app/requirements.txt", 'fastapi\nuvicorn\n')
        zf.writestr("my-python-app/main.py", 'from fastapi import FastAPI\n')
    py_zip.write_bytes(buf_py.getvalue())

    extract_py_dir = tmp_path / "extracted_py"
    SafeZipExtractor.extract(py_zip, extract_py_dir)
    assert (extract_py_dir / "requirements.txt").is_file()
    assert (extract_py_dir / "main.py").is_file()
    assert not (extract_py_dir / "my-python-app").exists()


def test_dynamic_app_key_generation():
    key1 = Fixer.generate_app_key()
    key2 = Fixer.generate_app_key()
    assert key1.startswith("base64:")
    assert key2.startswith("base64:")
    assert key1 != key2  # Cryptographically unique


def test_gateway_waiting_room_xss_escaped():
    from server.orchestrator.gateway import GatewayManager
    mgr = GatewayManager()
    malicious_data = {
        "project_name": "<script>alert('pwn')</script>",
        "target_url": 'https://example.com/";alert(1);//',
        "framework": "<b>React</b>",
    }
    html = mgr.render_waiting_room_html("test-slug", malicious_data)
    # Must NOT contain raw unescaped script tag in markup
    assert "<script>alert('pwn')</script>" not in html
    assert "&lt;script&gt;alert(&#x27;pwn&#x27;)&lt;/script&gt;" in html or "&lt;script&gt;alert('pwn')&lt;/script&gt;" in html
    # Must contain safe JSON string literal for targetUrl
    assert 'https://example.com/\\";alert(1);//' in html or '"https://example.com/\\"' in html


def test_registry_atomic_save(tmp_path: Path):
    from server.orchestrator.registry import DeploymentRegistry, DeploymentRecord
    reg_file = tmp_path / "test_registry.json"
    reg = DeploymentRegistry(file_path=reg_file)
    rec = DeploymentRecord(
        deployment_id="dep123",
        project_id="proj123",
        project_name="Test Project",
        framework="laravel",
        subdomain="test-sub",
        port=8080,
    )
    reg.upsert(rec)
    assert reg_file.exists()
    loaded = json.loads(reg_file.read_text(encoding="utf-8"))
    assert "proj123" in loaded
    assert loaded["proj123"]["port"] == 8080


def test_cicd_webhook_signature_verification(client, tmp_path: Path, monkeypatch):
    import hmac
    import hashlib
    import server.routes.cicd as cicd_module

    # Mock projects dir to tmp_path
    monkeypatch.setattr(cicd_module, "PROJECTS_DIR", tmp_path)

    project_id = "test_webhook_proj"
    config_res = client.get(f"/api/cicd/{project_id}/config")
    assert config_res.status_code == 200
    secret = config_res.json()["secret_token"]
    assert len(secret) >= 32  # Cryptographically random token

    # 1. Push with invalid signature -> 403
    payload = json.dumps({"ref": "refs/heads/main", "commits": []}).encode("utf-8")
    bad_res = client.post(
        f"/api/cicd/{project_id}/webhook",
        content=payload,
        headers={"X-Hub-Signature-256": "sha256=invalid_hash", "Content-Type": "application/json"},
    )
    assert bad_res.status_code == 403

    # 2. Push with valid HMAC signature -> 200
    valid_sig = "sha256=" + hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    good_res = client.post(
        f"/api/cicd/{project_id}/webhook",
        content=payload,
        headers={"X-Hub-Signature-256": valid_sig, "Content-Type": "application/json"},
    )
    assert good_res.status_code == 200
    assert good_res.json()["status"] == "DEPLOYED"


def test_manage_api_key_protection(client, monkeypatch):
    import os
    monkeypatch.setenv("STACKDOCTOR_API_KEY", "super-secret-operator-key-999")

    # Unauthorized request without key
    unauth_res = client.post("/api/manage/proj123/exec", json={"command": "ls"})
    assert unauth_res.status_code == 401

    # Authorized request with X-API-Key (will hit 404 project not found, proving auth passed)
    auth_res = client.post(
        "/api/manage/proj123/exec",
        json={"command": "ls"},
        headers={"X-API-Key": "super-secret-operator-key-999"},
    )
    assert auth_res.status_code == 404

