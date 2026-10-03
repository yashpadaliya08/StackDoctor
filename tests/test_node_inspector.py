import json
import pytest
from pathlib import Path
from doctor.engine import DoctorEngine
from doctor.detector import FrameworkDetector
from doctor.models import CheckStatus


def test_node_detection_and_inspection(tmp_path: Path):
    # 1. Create a minimal Express project
    pkg = {
        "name": "test-express-api",
        "version": "1.0.0",
        "main": "server.js",
        "scripts": {
            "start": "node server.js"
        },
        "dependencies": {
            "express": "^4.19.2"
        }
    }
    (tmp_path / "package.json").write_text(json.dumps(pkg))
    (tmp_path / "server.js").write_text("const express = require('express'); const app = express(); app.listen(process.env.PORT || 3000);")
    (tmp_path / ".env").write_text("PORT=3000\nNODE_ENV=production\n")

    # 2. Test Detector
    info = FrameworkDetector.detect(tmp_path)
    assert info.stack == "node"
    assert "Express" in info.display_name

    # 3. Test Doctor Engine Analysis
    engine = DoctorEngine()
    report = engine.analyze(tmp_path)
    assert report.readiness_score >= 90
    assert report.metadata.stack == "node"
    assert any(c.id == "node_package_json_valid" and c.status == CheckStatus.PASSED for c in report.checks)
    assert any(c.id == "node_start_script" and c.status == CheckStatus.PASSED for c in report.checks)
    assert any(c.id == "node_entrypoint_valid" and c.status == CheckStatus.PASSED for c in report.checks)


def test_mern_split_monorepo_detection_and_inspection(tmp_path: Path):
    backend_dir = tmp_path / "backend"
    frontend_dir = tmp_path / "frontend"
    backend_dir.mkdir()
    frontend_dir.mkdir()

    backend_pkg = {
        "name": "backend",
        "version": "1.0.0",
        "main": "index.js",
        "scripts": {"start": "node server.js"},
        "dependencies": {"express": "^4.19.2", "mongoose": "^8.0.0"},
    }
    frontend_pkg = {
        "name": "frontend",
        "version": "1.0.0",
        "dependencies": {"react": "^18.2.0"},
    }
    (backend_dir / "package.json").write_text(json.dumps(backend_pkg))
    (frontend_dir / "package.json").write_text(json.dumps(frontend_pkg))
    (backend_dir / "server.js").write_text("const express = require('express'); const app = express(); app.listen(process.env.port || 5000);")
    (backend_dir / ".env").write_text("port=8000\nmongoUrl=mongodb://localhost:27017/\n")

    # 1. Detector
    info = FrameworkDetector.detect(tmp_path)
    assert info.stack == "node"
    assert info.framework == "mern"
    assert "MERN" in info.display_name
    assert info.entrypoint == "backend/server.js"

    # 2. Engine Analysis
    engine = DoctorEngine()
    report = engine.analyze(tmp_path)
    assert report.readiness_score >= 80
    assert report.metadata.stack == "node"
    assert any(c.id == "node_database_config" and "MongoDB" in c.title for c in report.checks)
    assert any(c.id == "node_port_binding" and c.status == CheckStatus.PASSED for c in report.checks)


def test_mern_fullstack_ui_bridge_and_fixer(tmp_path: Path):
    backend_dir = tmp_path / "backend"
    frontend_dir = tmp_path / "frontend"
    src_dir = frontend_dir / "src"
    backend_dir.mkdir()
    frontend_dir.mkdir()
    src_dir.mkdir()

    backend_pkg = {
        "name": "backend",
        "version": "1.0.0",
        "dependencies": {"express": "^4.19.2", "mongoose": "^8.0.0"},
    }
    frontend_pkg = {
        "name": "frontend",
        "version": "1.0.0",
        "dependencies": {"react": "^19.0.0", "vite": "^6.0.0"},
    }
    (backend_dir / "package.json").write_text(json.dumps(backend_pkg))
    (frontend_dir / "package.json").write_text(json.dumps(frontend_pkg))
    (backend_dir / "server.js").write_text("const express = require('express'); const app = express(); app.listen(8000);")
    (src_dir / "api.js").write_text('const backendDomain = "http://localhost:8000";')

    engine = DoctorEngine()
    report = engine.analyze(tmp_path)

    # Check that bridge and hardcoded URL warnings are detected
    assert any(c.id == "node_fullstack_ui_bridge" and c.status == CheckStatus.WARNING for c in report.checks)
    assert any(c.id == "node_frontend_api_url_hardcoded" and c.status == CheckStatus.WARNING for c in report.checks)

    # Run auto-fixer via engine
    actions = engine.apply_fixes(tmp_path)
    assert len(actions) > 0

    # Verify fixed files
    fixed_server = (backend_dir / "server.js").read_text()
    assert "express.static" in fixed_server
    assert "res.sendFile" in fixed_server

    fixed_api = (src_dir / "api.js").read_text()
    assert 'http://localhost:8000' not in fixed_api
    assert 'const backendDomain = "";' in fixed_api

    # Re-analyze and verify checks pass
    report2 = engine.analyze(tmp_path)
    assert any(c.id == "node_fullstack_ui_bridge" and c.status == CheckStatus.PASSED for c in report2.checks)
    assert any(c.id == "node_frontend_api_url_hardcoded" and c.status == CheckStatus.PASSED for c in report2.checks)


