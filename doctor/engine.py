import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from doctor.detector import FrameworkDetector
from doctor.fixer import Fixer
from doctor.ingestion.git_cloner import SafeGitCloner
from doctor.ingestion.zip_extractor import SafeZipExtractor
from doctor.inspectors.asset_inspector import AssetInspector
from doctor.inspectors.composer_inspector import ComposerInspector
from doctor.inspectors.cpanel_sanitizer import CpanelSanitizer
from doctor.inspectors.database_inspector import DatabaseInspector
from doctor.inspectors.env_inspector import EnvInspector
from doctor.inspectors.python_inspector import PythonInspector
from doctor.inspectors.node_inspector import NodeInspector
from doctor.inspectors.storage_inspector import StorageInspector
from doctor.models import (
    CheckStatus,
    DiagnosticCheck,
    DiagnosticReport,
    FixAction,
    ProjectMetadata,
)
from doctor.scorer import Scorer


class DoctorEngine:
    """
    Main orchestration engine for analyzing Laravel, Python, and Node.js projects.
    Coordinates ingestion, runs static inspectors, computes the health score,
    and coordinates automated fixes.
    """

    def __init__(self) -> None:
        self.inspectors = [
            CpanelSanitizer(),
            ComposerInspector(),
            EnvInspector(),
            DatabaseInspector(),
            AssetInspector(),
            StorageInspector(),
        ]
        self.python_inspector = PythonInspector()
        self.node_inspector = NodeInspector()

    def analyze(self, source: str | Path) -> DiagnosticReport:
        """
        Analyzes a Laravel or Python project from a local directory, a ZIP archive, or a Git repository URL.
        """
        source_str = str(source)
        temp_dir = None

        try:
            # 1. Determine Source Type
            if source_str.startswith("http://") or source_str.startswith("https://") or source_str.endswith(".git"):
                temp_dir = Path(tempfile.mkdtemp(prefix="laravel_doctor_git_"))
                project_path = SafeGitCloner.clone(source_str, temp_dir)

            elif source_str.endswith(".zip") and Path(source_str).is_file():
                temp_dir = Path(tempfile.mkdtemp(prefix="laravel_doctor_zip_"))
                project_path = SafeZipExtractor.extract(source_str, temp_dir)

            else:
                project_path = Path(source_str).resolve()
                if not project_path.is_dir():
                    raise FileNotFoundError(f"Project directory not found: {project_path}")

            # 2. Detect Technology Stack & Framework
            fw_info = FrameworkDetector.detect(project_path)
            metadata = ProjectMetadata(
                stack=fw_info.stack,
                framework=fw_info.display_name,
                framework_version=fw_info.metadata.get("laravel_version"),
                detected_entrypoint=fw_info.entrypoint,
                framework_details=fw_info.to_dict(),
            )
            metadata.detected_env = self._extract_env_vars(project_path, metadata)
            all_checks: list[DiagnosticCheck] = []

            if metadata.stack == "python":
                all_checks = self.python_inspector.inspect(project_path, metadata)
            elif metadata.stack == "node":
                all_checks = self.node_inspector.inspect(project_path, metadata)
            else:
                for inspector in self.inspectors:
                    checks = inspector.inspect(project_path, metadata)
                    all_checks.extend(checks)

            # 3. Calculate Score
            score, summary = Scorer.calculate_score(all_checks)

            # 4. Count Statistics
            passed = sum(1 for c in all_checks if c.status == CheckStatus.PASSED)
            warnings = sum(1 for c in all_checks if c.status == CheckStatus.WARNING)
            failed = sum(1 for c in all_checks if c.status == CheckStatus.FAILED)
            fixable = sum(1 for c in all_checks if c.auto_fixable and c.status != CheckStatus.PASSED)

            # 5. Compute Available Fixes (Dry run)
            available_fixes: list[FixAction] = []
            if any(c.auto_fixable and c.status != CheckStatus.PASSED for c in all_checks):
                if metadata.stack == "python":
                    py_fixes = Fixer.fix_python_project(project_path, metadata, dry_run=True)
                    available_fixes.extend(py_fixes)
                elif metadata.stack == "node":
                    node_fixes = Fixer.fix_node_project(project_path, metadata, dry_run=True)
                    available_fixes.extend(node_fixes)
                else:
                    env_fixes = Fixer.fix_environment(project_path, metadata, dry_run=True)
                    available_fixes.extend(env_fixes)
                    storage_fixes = Fixer.fix_storage_directories(project_path, dry_run=True)
                    available_fixes.extend(storage_fixes)
                    if metadata.is_cpanel_mangled:
                        cpanel_fixes = Fixer.repair_cpanel_mangle(project_path, dry_run=True)
                        available_fixes.extend(cpanel_fixes)

            report = DiagnosticReport(
                project_path=str(project_path),
                timestamp=datetime.now(timezone.utc).isoformat(),
                readiness_score=score,
                metadata=metadata,
                checks=all_checks,
                passed_count=passed,
                warning_count=warnings,
                failed_count=failed,
                auto_fixable_count=fixable,
                summary=summary,
                available_fixes=available_fixes,
            )
            return report

        finally:
            if temp_dir and "git_" in str(temp_dir) and temp_dir.exists():
                shutil.rmtree(temp_dir, ignore_errors=True)

    def apply_fixes(
        self,
        project_path: str | Path,
        target_app_url: str = "https://app.studentapp.dev",
        target_db_host: str = "mysql-internal",
        generate_docker: bool = True,
    ) -> list[FixAction]:
        """
        Applies all recommended automated fixes to the target project directory.
        """
        path = Path(project_path).resolve()
        fw_info = FrameworkDetector.detect(path)
        metadata = ProjectMetadata(
            stack=fw_info.stack,
            framework=fw_info.display_name,
            framework_version=fw_info.metadata.get("laravel_version"),
            detected_entrypoint=fw_info.entrypoint,
            framework_details=fw_info.to_dict(),
        )

        applied: list[FixAction] = []

        if metadata.stack == "python":
            self.python_inspector.inspect(path, metadata)
            py_actions = Fixer.fix_python_project(path, metadata, dry_run=False)
            applied.extend(py_actions)
            return applied

        if metadata.stack == "node":
            node_actions = Fixer.fix_node_project(path, metadata, dry_run=False)
            applied.extend(node_actions)
            return applied

        # Laravel fixes
        for inspector in self.inspectors:
            inspector.inspect(path, metadata)

        # Fix environment
        env_actions = Fixer.fix_environment(
            path, metadata, target_app_url=target_app_url, target_db_host=target_db_host, dry_run=False
        )
        applied.extend(env_actions)

        # Fix storage
        storage_actions = Fixer.fix_storage_directories(path, dry_run=False)
        applied.extend(storage_actions)

        # Fix cPanel mangle if needed
        if metadata.is_cpanel_mangled:
            cpanel_actions = Fixer.repair_cpanel_mangle(path, dry_run=False)
            applied.extend(cpanel_actions)

        # Generate Dockerfile & Caddyfile
        if generate_docker:
            dockerfile_content = Fixer.generate_dockerfile(metadata)
            (path / "Dockerfile").write_text(dockerfile_content, encoding="utf-8")
            applied.append(
                FixAction(
                    check_id="dockerfile_generated",
                    action_type="create_file",
                    target_file="Dockerfile",
                    description=f"Generated multi-stage Dockerfile using serversideup/php:{metadata.resolved_php_version}-fpm-nginx.",
                )
            )

            caddyfile_content = Fixer.generate_caddyfile()
            (path / "Caddyfile").write_text(caddyfile_content, encoding="utf-8")
            applied.append(
                FixAction(
                    check_id="caddyfile_generated",
                    action_type="create_file",
                    target_file="Caddyfile",
                    description="Generated production Caddyfile for automatic HTTPS SSL routing.",
                )
            )

        return applied

    @staticmethod
    def _extract_env_vars(project_path: Path, metadata: ProjectMetadata) -> dict[str, str]:
        env_dict: dict[str, str] = {}
        # Search candidate env files (handling split monorepos)
        target_dirs = [project_path]
        if metadata.framework_details and "backend_dir" in metadata.framework_details.get("metadata", {}):
            b_dir = metadata.framework_details["metadata"]["backend_dir"]
            target_dirs.insert(0, project_path / b_dir)
        elif (project_path / "backend").is_dir():
            target_dirs.insert(0, project_path / "backend")
        elif (project_path / "server").is_dir():
            target_dirs.insert(0, project_path / "server")

        env_candidates = []
        for d in target_dirs:
            for fname in [".env", ".env.example", ".env.local", ".env.production"]:
                f = d / fname
                if f.is_file():
                    env_candidates.append(f)

        for env_file in env_candidates:
            try:
                for line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k and k not in env_dict:
                            env_dict[k] = v
            except Exception:
                pass

        # If Node/MERN project, ensure PORT and mongoUrl/MONGODB_URI keys are suggested if missing
        if metadata.stack == "node":
            if "PORT" not in env_dict and "port" not in env_dict:
                env_dict["PORT"] = "5000"
            deps = str(metadata.framework_details.get("metadata", {}))
            if "mongo" in deps.lower() and "mongoUrl" not in env_dict and "MONGODB_URI" not in env_dict:
                env_dict["mongoUrl"] = "mongodb://localhost:27017/"

        return env_dict
