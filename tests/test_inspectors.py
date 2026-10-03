import json
from pathlib import Path
from doctor.inspectors.asset_inspector import AssetInspector
from doctor.inspectors.composer_inspector import ComposerInspector
from doctor.inspectors.cpanel_sanitizer import CpanelSanitizer
from doctor.inspectors.database_inspector import DatabaseInspector
from doctor.inspectors.env_inspector import EnvInspector
from doctor.inspectors.storage_inspector import StorageInspector
from doctor.models import CheckStatus, ProjectMetadata


def test_composer_inspector_valid(clean_laravel11_sqlite):
    inspector = ComposerInspector()
    meta = ProjectMetadata()
    checks = inspector.inspect(clean_laravel11_sqlite, meta)

    assert meta.framework_version == "11.0"
    assert meta.resolved_php_version == "8.3"
    assert any(c.id == "composer_valid" and c.status == CheckStatus.PASSED for c in checks)
    assert any(c.id == "laravel_framework_detected" and c.status == CheckStatus.PASSED for c in checks)


def test_composer_inspector_missing(temp_workspace):
    empty_dir = temp_workspace / "empty"
    empty_dir.mkdir()

    inspector = ComposerInspector()
    meta = ProjectMetadata()
    checks = inspector.inspect(empty_dir, meta)

    assert any(c.id == "composer_missing" and c.status == CheckStatus.FAILED for c in checks)


def test_env_inspector_broken(broken_env_project):
    inspector = EnvInspector()
    meta = ProjectMetadata()
    checks = inspector.inspect(broken_env_project, meta)

    # Must flag missing APP_KEY as FAILED
    assert any(c.id == "env_app_key_missing" and c.status == CheckStatus.FAILED for c in checks)
    # Must flag APP_DEBUG=true as WARNING
    assert any(c.id == "env_app_debug_enabled" and c.status == CheckStatus.WARNING for c in checks)
    # Must flag localhost APP_URL as WARNING
    assert any(c.id == "env_app_url_localhost" and c.status == CheckStatus.WARNING for c in checks)


def test_database_inspector_mysql_trap(broken_env_project):
    inspector = DatabaseInspector()
    meta = ProjectMetadata()
    checks = inspector.inspect(broken_env_project, meta)

    assert meta.db_connection == "mysql"
    assert any(c.id == "db_host_localhost_trap" and c.status == CheckStatus.WARNING for c in checks)


def test_database_inspector_sqlite(clean_laravel11_sqlite):
    inspector = DatabaseInspector()
    meta = ProjectMetadata()
    checks = inspector.inspect(clean_laravel11_sqlite, meta)

    assert meta.db_connection == "sqlite"
    assert any(c.id == "db_sqlite_file_present" and c.status == CheckStatus.PASSED for c in checks)
    assert any(c.id == "db_migrations_found" and c.status == CheckStatus.PASSED for c in checks)


def test_asset_inspector_vite_missing_manifest(temp_workspace):
    project = temp_workspace / "vite_app"
    project.mkdir()

    (project / "vite.config.js").write_text("import { defineConfig } from 'vite';")
    package_json = {
        "devDependencies": {
            "tailwindcss": "^3.4.0",
            "vite": "^5.0.0"
        }
    }
    (project / "package.json").write_text(json.dumps(package_json))

    inspector = AssetInspector()
    meta = ProjectMetadata()
    checks = inspector.inspect(project, meta)

    assert meta.asset_bundler == "vite"
    assert not meta.has_vite_manifest
    assert any(c.id == "assets_vite_manifest_missing" and c.status == CheckStatus.WARNING for c in checks)
    assert any("Tailwind CSS" in c.title for c in checks)


def test_storage_inspector_missing_dirs(temp_workspace):
    project = temp_workspace / "empty_storage_app"
    project.mkdir()

    inspector = StorageInspector()
    meta = ProjectMetadata()
    checks = inspector.inspect(project, meta)

    assert any(c.id == "storage_dirs_missing" and c.status == CheckStatus.WARNING for c in checks)
    assert any(c.id == "storage_symlink_missing" and c.status == CheckStatus.WARNING for c in checks)


def test_cpanel_sanitizer_detection(mangled_cpanel_project):
    inspector = CpanelSanitizer()
    meta = ProjectMetadata()
    checks = inspector.inspect(mangled_cpanel_project, meta)

    assert meta.is_cpanel_mangled
    assert any(c.id == "cpanel_mangled_root_index" and c.status == CheckStatus.FAILED for c in checks)
