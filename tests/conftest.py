import json
import shutil
import tempfile
from pathlib import Path
import pytest
from doctor.fixer import DoctorFixer


@pytest.fixture
def temp_workspace():
    """Provides a clean temporary directory for fixture generation and cleanup."""
    temp_dir = Path(tempfile.mkdtemp(prefix="doctor_test_"))
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def clean_laravel11_sqlite(temp_workspace):
    """Generates a compliant Laravel 11 project using SQLite."""
    project = temp_workspace / "clean_laravel11"
    project.mkdir()

    # composer.json
    composer = {
        "name": "laravel/laravel",
        "type": "project",
        "require": {
            "php": "^8.3",
            "laravel/framework": "^11.0"
        }
    }
    (project / "composer.json").write_text(json.dumps(composer, indent=2))

    # .env
    mock_app_key = DoctorFixer.generate_app_key()
    env = f"""APP_NAME=CleanApp
APP_ENV=production
APP_KEY={mock_app_key}
APP_DEBUG=false
APP_URL=https://cleanapp.studentapp.dev

DB_CONNECTION=sqlite
"""
    (project / ".env").write_text(env)

    # database/database.sqlite
    db_dir = project / "database"
    db_dir.mkdir()
    (db_dir / "database.sqlite").touch()

    # database/migrations
    migrations_dir = db_dir / "migrations"
    migrations_dir.mkdir()
    (migrations_dir / "0001_01_01_000000_create_users_table.php").write_text("<?php // migration")

    # storage
    storage_dir = project / "storage"
    storage_dir.mkdir()
    (storage_dir / "app" / "public").mkdir(parents=True)
    (storage_dir / "framework" / "cache").mkdir(parents=True)
    (storage_dir / "framework" / "sessions").mkdir(parents=True)
    (storage_dir / "framework" / "views").mkdir(parents=True)
    (storage_dir / "logs").mkdir(parents=True)
    (project / "bootstrap" / "cache").mkdir(parents=True)

    # public
    public_dir = project / "public"
    public_dir.mkdir()
    (public_dir / "index.php").write_text("<?php // Laravel public index")

    # public/storage link
    try:
        (public_dir / "storage").symlink_to(storage_dir / "app" / "public", target_is_directory=True)
    except OSError:
        # On Windows non-developer mode fallback
        (public_dir / "storage").mkdir()

    return project


@pytest.fixture
def broken_env_project(temp_workspace):
    """Generates a dirty project with missing APP_KEY, debug enabled, and localhost DB."""
    project = temp_workspace / "broken_env_project"
    project.mkdir()

    composer = {
        "require": {
            "php": "^8.2",
            "laravel/framework": "^10.0"
        }
    }
    (project / "composer.json").write_text(json.dumps(composer))

    # Broken .env
    env = """APP_NAME=BrokenApp
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost:8000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=my_college_db
DB_USERNAME=root
DB_PASSWORD=
"""
    (project / ".env").write_text(env)
    return project


@pytest.fixture
def mangled_cpanel_project(temp_workspace):
    """Generates a project with index.php in root (classic cPanel student mistake)."""
    project = temp_workspace / "cpanel_project"
    project.mkdir()

    composer = {"require": {"laravel/framework": "^10.0"}}
    (project / "composer.json").write_text(json.dumps(composer))

    # Mangled root index.php
    (project / "index.php").write_text("""<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
""")
    mock_app_key = DoctorFixer.generate_app_key()
    (project / ".env").write_text(f"APP_KEY={mock_app_key}\nDB_CONNECTION=mysql")
    return project
