import json
from pathlib import Path
import pytest
from doctor.detector import FrameworkDetector


def test_detect_laravel_project(tmp_path: Path):
    composer = tmp_path / "composer.json"
    composer.write_text(
        json.dumps({
            "name": "laravel/sample-app",
            "require": {
                "php": "^8.2",
                "laravel/framework": "^11.0",
            }
        })
    )
    (tmp_path / "artisan").touch()

    info = FrameworkDetector.detect(tmp_path)
    assert info.stack == "php"
    assert info.framework == "laravel"
    assert "Laravel" in info.display_name
    assert info.entrypoint == "artisan"
    assert info.default_port == 8000
    assert "artisan" in info.detected_files


def test_detect_fastapi_project(tmp_path: Path):
    reqs = tmp_path / "requirements.txt"
    reqs.write_text("fastapi==0.110.0\nuvicorn==0.28.0\npydantic==2.6.4\n")
    main = tmp_path / "main.py"
    main.write_text("from fastapi import FastAPI\napp = FastAPI()\n")

    info = FrameworkDetector.detect(tmp_path)
    assert info.stack == "python"
    assert info.framework == "fastapi"
    assert "FastAPI" in info.display_name
    assert info.entrypoint == "main.py"
    assert info.default_port == 8000


def test_detect_flask_project(tmp_path: Path):
    reqs = tmp_path / "requirements.txt"
    reqs.write_text("Flask==3.0.2\nWerkzeug==3.0.1\n")
    app_py = tmp_path / "app.py"
    app_py.write_text("from flask import Flask\napp = Flask(__name__)\n")

    info = FrameworkDetector.detect(tmp_path)
    assert info.stack == "python"
    assert info.framework == "flask"
    assert "Flask" in info.display_name
    assert info.entrypoint == "app.py"
    assert info.default_port == 5000


def test_detect_django_project(tmp_path: Path):
    manage_py = tmp_path / "manage.py"
    manage_py.write_text("#!/usr/bin/env python\nimport os\n")
    reqs = tmp_path / "requirements.txt"
    reqs.write_text("django==5.0.3\npsycopg2-binary==2.9.9\n")

    info = FrameworkDetector.detect(tmp_path)
    assert info.stack == "python"
    assert info.framework == "django"
    assert "Django" in info.display_name
    assert info.entrypoint == "manage.py"
    assert info.default_port == 8000


def test_detect_mern_project(tmp_path: Path):
    pkg = tmp_path / "package.json"
    pkg.write_text(
        json.dumps({
            "name": "mern-ecommerce",
            "dependencies": {
                "react": "^18.2.0",
                "express": "^4.19.2",
                "mongoose": "^8.2.0",
            },
            "main": "server.js",
        })
    )

    info = FrameworkDetector.detect(tmp_path)
    assert info.stack == "node"
    assert info.framework == "mern"
    assert "MERN" in info.display_name


def test_detect_unknown_project(tmp_path: Path):
    (tmp_path / "readme.txt").write_text("Just some text")
    info = FrameworkDetector.detect(tmp_path)
    assert info.stack == "unknown"
