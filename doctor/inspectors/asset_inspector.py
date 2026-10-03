from pathlib import Path
from doctor.inspectors.base import BaseInspector
from doctor.models import (
    CheckCategory,
    CheckStatus,
    DiagnosticCheck,
    ProjectMetadata,
    Severity,
)


class AssetInspector(BaseInspector):
    """
    Inspects frontend assets, package.json, and bundler configurations (Vite vs Laravel Mix).
    Detects the notorious 'Vite manifest not found' production crash.
    """

    def inspect(self, project_path: Path, metadata: ProjectMetadata) -> list[DiagnosticCheck]:
        checks: list[DiagnosticCheck] = []
        package_file = project_path / "package.json"
        vite_config = project_path / "vite.config.js"
        vite_ts_config = project_path / "vite.config.ts"
        mix_config = project_path / "webpack.mix.js"

        has_package_json = package_file.is_file()
        is_vite = vite_config.is_file() or vite_ts_config.is_file()
        is_mix = mix_config.is_file()

        # 1. Identify Bundler
        if is_vite:
            metadata.asset_bundler = "vite"
        elif is_mix:
            metadata.asset_bundler = "laravel-mix"
        elif has_package_json:
            metadata.asset_bundler = "npm"
        else:
            metadata.asset_bundler = None

        if not metadata.asset_bundler:
            checks.append(
                DiagnosticCheck(
                    id="assets_no_bundler",
                    name="Frontend Asset Bundler",
                    category=CheckCategory.ASSETS,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title="No Frontend Build Pipeline Detected",
                    explanation="No package.json or Vite/Mix configuration found. Application appears to use raw HTML/Blade or CDN assets.",
                    remediation="None needed.",
                )
            )
            return checks

        checks.append(
            DiagnosticCheck(
                id="assets_bundler_detected",
                name="Frontend Asset Bundler",
                category=CheckCategory.ASSETS,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title=f"{metadata.asset_bundler.upper()} Bundler Detected",
                explanation=f"Project uses {metadata.asset_bundler} for compiling modern CSS and JavaScript.",
                remediation="None needed.",
            )
        )

        # 2. Check for Vite Manifest (Preventing the 500 Vite Crash)
        if metadata.asset_bundler == "vite":
            manifest_v4 = project_path / "public" / "build" / "manifest.json"
            manifest_v5 = project_path / "public" / "build" / ".vite" / "manifest.json"
            has_manifest = manifest_v4.is_file() or manifest_v5.is_file()
            metadata.has_vite_manifest = has_manifest

            if not has_manifest:
                checks.append(
                    DiagnosticCheck(
                        id="assets_vite_manifest_missing",
                        name="Vite Production Manifest",
                        category=CheckCategory.ASSETS,
                        status=CheckStatus.WARNING,
                        severity=Severity.CRITICAL,
                        title="Vite Manifest Not Found in public/build",
                        explanation="In Laravel, using @vite() in Blade templates throws a fatal error if 'public/build/manifest.json' is missing: 'Vite manifest not found at: .../public/build/manifest.json'. This usually happens because public/build is in .gitignore.",
                        remediation="Ensure the build pipeline executes 'npm ci && npm run build' during container image creation. We auto-inject this in the multi-stage Dockerfile.",
                        auto_fixable=True,
                        metadata={"build_required": True},
                    )
                )
            else:
                checks.append(
                    DiagnosticCheck(
                        id="assets_vite_manifest_present",
                        name="Vite Production Manifest",
                        category=CheckCategory.ASSETS,
                        status=CheckStatus.PASSED,
                        severity=Severity.INFO,
                        title="Compiled Vite Assets Detected in public/build",
                        explanation="public/build/manifest.json is present. Frontend assets are already pre-compiled.",
                        remediation="None needed.",
                    )
                )

        # 3. Detect Frameworks (Tailwind, Vue, React, Alpine)
        pkg_data = self.read_json_safe(package_file) if has_package_json else {}
        if pkg_data:
            deps = {**pkg_data.get("dependencies", {}), **pkg_data.get("devDependencies", {})}
            recognized_frameworks: list[str] = []
            if "tailwindcss" in deps:
                recognized_frameworks.append("Tailwind CSS")
            if "vue" in deps:
                recognized_frameworks.append("Vue.js")
            if "react" in deps:
                recognized_frameworks.append("React")
            if "alpinejs" in deps:
                recognized_frameworks.append("Alpine.js")

            if recognized_frameworks:
                checks.append(
                    DiagnosticCheck(
                        id="assets_frameworks_detected",
                        name="Frontend Libraries",
                        category=CheckCategory.ASSETS,
                        status=CheckStatus.PASSED,
                        severity=Severity.INFO,
                        title=f"Detected: {', '.join(recognized_frameworks)}",
                        explanation=f"Application uses {', '.join(recognized_frameworks)}.",
                        remediation="None needed.",
                        metadata={"frameworks": recognized_frameworks},
                    )
                )

        return checks
