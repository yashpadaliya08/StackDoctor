import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class FrameworkInfo:
    stack: str  # "php", "python", "node", "unknown"
    framework: str  # "laravel", "fastapi", "flask", "django", "express", "mern", "generic"
    display_name: str
    entrypoint: Optional[str] = None
    default_port: int = 8000
    confidence: float = 1.0
    detected_files: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "stack": self.stack,
            "framework": self.framework,
            "display_name": self.display_name,
            "entrypoint": self.entrypoint,
            "default_port": self.default_port,
            "confidence": self.confidence,
            "detected_files": self.detected_files,
            "metadata": self.metadata,
        }


class FrameworkDetector:
    """
    Intelligently inspects project files to identify the technology stack,
    framework, and runtime requirements before running diagnosis or deployment.
    """

    @classmethod
    def detect(cls, project_path: Path) -> FrameworkInfo:
        if not project_path.is_dir():
            return FrameworkInfo(
                stack="unknown",
                framework="unknown",
                display_name="Unknown Application",
                confidence=0.0,
            )

        # 1. Check PHP / Laravel
        laravel_info = cls._detect_laravel(project_path)
        if laravel_info:
            return laravel_info

        # 2. Check Python (FastAPI, Flask, Django)
        python_info = cls._detect_python(project_path)
        if python_info:
            return python_info

        # 3. Check Node.js / Express / MERN
        node_info = cls._detect_node(project_path)
        if node_info:
            return node_info

        return FrameworkInfo(
            stack="unknown",
            framework="generic",
            display_name="Generic Web App",
            confidence=0.2,
        )

    @classmethod
    def _detect_laravel(cls, root: Path) -> Optional[FrameworkInfo]:
        composer_file = root / "composer.json"
        artisan_file = root / "artisan"

        detected_files = []
        is_laravel = False
        version = None

        if artisan_file.is_file():
            detected_files.append("artisan")
            is_laravel = True

        if composer_file.is_file():
            detected_files.append("composer.json")
            try:
                data = json.loads(composer_file.read_text(encoding="utf-8", errors="ignore"))
                reqs = data.get("require", {})
                if "laravel/framework" in reqs:
                    is_laravel = True
                    version = reqs["laravel/framework"].lstrip("^~=>< ")
            except Exception:
                pass

        if is_laravel:
            name = f"Laravel {version}" if version else "Laravel Application"
            return FrameworkInfo(
                stack="php",
                framework="laravel",
                display_name=name,
                entrypoint="artisan",
                default_port=8000,
                confidence=0.98,
                detected_files=detected_files,
                metadata={"laravel_version": version},
            )
        return None

    @classmethod
    def _detect_python(cls, root: Path) -> Optional[FrameworkInfo]:
        req_file = root / "requirements.txt"
        pyproject = root / "pyproject.toml"
        manage_py = root / "manage.py"
        app_py = root / "app.py"
        main_py = root / "main.py"

        req_text = ""
        detected_files = []
        if req_file.is_file():
            detected_files.append("requirements.txt")
            req_text = req_file.read_text(encoding="utf-8", errors="ignore").lower()
        if pyproject.is_file():
            detected_files.append("pyproject.toml")
            req_text += "\n" + pyproject.read_text(encoding="utf-8", errors="ignore").lower()

        # Django detection
        if manage_py.is_file() or "django" in req_text:
            if manage_py.is_file():
                detected_files.append("manage.py")
            return FrameworkInfo(
                stack="python",
                framework="django",
                display_name="Django Application",
                entrypoint="manage.py",
                default_port=8000,
                confidence=0.95,
                detected_files=detected_files,
            )

        # FastAPI detection
        if "fastapi" in req_text or (main_py.is_file() and "fastapi" in main_py.read_text(encoding="utf-8", errors="ignore").lower()):
            if main_py.is_file():
                detected_files.append("main.py")
            return FrameworkInfo(
                stack="python",
                framework="fastapi",
                display_name="FastAPI Application",
                entrypoint="main.py",
                default_port=8000,
                confidence=0.95,
                detected_files=detected_files,
            )

        # Flask detection
        if "flask" in req_text or (app_py.is_file() and "flask" in app_py.read_text(encoding="utf-8", errors="ignore").lower()):
            if app_py.is_file():
                detected_files.append("app.py")
            return FrameworkInfo(
                stack="python",
                framework="flask",
                display_name="Flask Application",
                entrypoint="app.py" if app_py.is_file() else "main.py",
                default_port=5000,
                confidence=0.95,
                detected_files=detected_files,
            )

        # Generic Python
        if detected_files or app_py.is_file() or main_py.is_file():
            ep = "main.py" if main_py.is_file() else ("app.py" if app_py.is_file() else None)
            return FrameworkInfo(
                stack="python",
                framework="generic_python",
                display_name="Python Application",
                entrypoint=ep,
                default_port=8000,
                confidence=0.75,
                detected_files=detected_files,
            )

        return None

    @classmethod
    def _detect_node(cls, root: Path) -> Optional[FrameworkInfo]:
        pkg_file = root / "package.json"
        if not pkg_file.is_file():
            # Check for split monorepo structure (backend/frontend, server/client, api/ui)
            backend_candidates = ["backend", "server", "api"]
            frontend_candidates = ["frontend", "client", "ui", "web"]
            found_backend = None
            found_frontend = None
            for b in backend_candidates:
                if (root / b / "package.json").is_file():
                    found_backend = b
                    break
            for f in frontend_candidates:
                if (root / f / "package.json").is_file():
                    found_frontend = f
                    break

            if found_backend and found_frontend:
                backend_pkg = root / found_backend / "package.json"
                main_ep = f"{found_backend}/server.js"
                try:
                    b_data = json.loads(backend_pkg.read_text(encoding="utf-8", errors="ignore"))
                    cand_ep = b_data.get("main", "server.js")
                    if (root / found_backend / cand_ep).is_file():
                        main_ep = f"{found_backend}/{cand_ep}"
                    elif (root / found_backend / "server.js").is_file():
                        main_ep = f"{found_backend}/server.js"
                    elif (root / found_backend / "index.js").is_file():
                        main_ep = f"{found_backend}/index.js"
                except Exception:
                    pass

                return FrameworkInfo(
                    stack="node",
                    framework="mern",
                    display_name=f"MERN Full-Stack ({found_frontend} + {found_backend})",
                    entrypoint=main_ep,
                    default_port=5000,
                    confidence=0.98,
                    detected_files=[f"{found_backend}/package.json", f"{found_frontend}/package.json"],
                    metadata={"backend_dir": found_backend, "frontend_dir": found_frontend},
                )
            elif found_backend:
                return FrameworkInfo(
                    stack="node",
                    framework="express",
                    display_name=f"Node.js Express ({found_backend})",
                    entrypoint=f"{found_backend}/server.js",
                    default_port=5000,
                    confidence=0.90,
                    detected_files=[f"{found_backend}/package.json"],
                    metadata={"backend_dir": found_backend},
                )
            return None

        try:
            pkg_data = json.loads(pkg_file.read_text(encoding="utf-8", errors="ignore"))
            all_deps = {
                **pkg_data.get("dependencies", {}),
                **pkg_data.get("devDependencies", {}),
            }

            has_react = "react" in all_deps
            has_express = "express" in all_deps
            has_mongoose = "mongoose" in all_deps or "mongodb" in all_deps

            if has_react and has_express:
                return FrameworkInfo(
                    stack="node",
                    framework="mern",
                    display_name="MERN Application (React + Express)",
                    entrypoint=pkg_data.get("main", "server.js"),
                    default_port=5000,
                    confidence=0.95,
                    detected_files=["package.json"],
                )

            if has_express:
                return FrameworkInfo(
                    stack="node",
                    framework="express",
                    display_name="Node.js Express API",
                    entrypoint=pkg_data.get("main", "index.js"),
                    default_port=3000,
                    confidence=0.90,
                    detected_files=["package.json"],
                )

            return FrameworkInfo(
                stack="node",
                framework="generic_node",
                display_name="Node.js Application",
                entrypoint=pkg_data.get("main", "index.js"),
                default_port=3000,
                confidence=0.70,
                detected_files=["package.json"],
            )
        except Exception:
            return None
