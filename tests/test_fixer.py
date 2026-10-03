from pathlib import Path
from doctor.engine import DoctorEngine
from doctor.fixer import Fixer
from doctor.models import ProjectMetadata


def test_fixer_app_key_generation():
    key = Fixer.generate_app_key()
    assert key.startswith("base64:")
    assert len(key) >= 44


def test_fixer_environment_repair(broken_env_project):
    meta = ProjectMetadata(db_connection="mysql")
    actions = Fixer.fix_environment(
        broken_env_project,
        meta,
        target_app_url="https://live.studentapp.dev",
        target_db_host="mysql-internal",
        dry_run=False,
    )

    assert len(actions) > 0
    fixed_env = (broken_env_project / ".env").read_text()
    assert "APP_DEBUG=false" in fixed_env
    assert "APP_ENV=production" in fixed_env
    assert "APP_URL=https://live.studentapp.dev" in fixed_env
    assert "DB_HOST=mysql-internal" in fixed_env
    assert "APP_KEY=base64:" in fixed_env


def test_fixer_cpanel_restoration(mangled_cpanel_project):
    actions = Fixer.repair_cpanel_mangle(mangled_cpanel_project, dry_run=False)

    assert len(actions) == 1
    assert not (mangled_cpanel_project / "index.php").exists()
    assert (mangled_cpanel_project / "public" / "index.php").exists()
    public_index_content = (mangled_cpanel_project / "public" / "index.php").read_text()
    assert "vendor/autoload.php" in public_index_content


def test_fixer_dockerfile_generation():
    meta_vite = ProjectMetadata(resolved_php_version="8.3", asset_bundler="vite")
    dockerfile_vite = Fixer.generate_dockerfile(meta_vite)
    assert "FROM node:20-alpine AS frontend" in dockerfile_vite
    assert "FROM serversideup/php:8.3-fpm-nginx" in dockerfile_vite
    assert "npm run build" in dockerfile_vite

    meta_plain = ProjectMetadata(resolved_php_version="8.2", asset_bundler=None)
    dockerfile_plain = Fixer.generate_dockerfile(meta_plain)
    assert "FROM node" not in dockerfile_plain
    assert "FROM serversideup/php:8.2-fpm-nginx" in dockerfile_plain


def test_engine_apply_fixes_full_pipeline(broken_env_project):
    engine = DoctorEngine()
    applied = engine.apply_fixes(broken_env_project, generate_docker=True)

    assert len(applied) > 0
    assert (broken_env_project / "Dockerfile").exists()
    assert (broken_env_project / "Caddyfile").exists()

    # Re-scan should now show significantly improved readiness score
    new_report = engine.analyze(broken_env_project)
    assert new_report.readiness_score > 80
    assert new_report.failed_count == 0
