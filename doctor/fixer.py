import base64
import os
import re
import secrets
from pathlib import Path
from doctor.models import FixAction, ProjectMetadata


class Fixer:
    """
    Automated repair engine for Laravel configuration and deployment artifacts.
    Generates cryptographically secure keys, fixes .env traps, restores mangled directories,
    and produces production-ready multi-stage Dockerfiles and Caddyfiles.
    """

    @classmethod
    def generate_app_key(cls) -> str:
        """Generates a cryptographically secure Laravel AES-256 base64 application key."""
        random_bytes = secrets.token_bytes(32)
        encoded = base64.b64encode(random_bytes).decode("utf-8")
        return f"base64:{encoded}"

    @classmethod
    def fix_environment(
        cls,
        project_path: Path,
        metadata: ProjectMetadata,
        target_app_url: str = "https://app.studentapp.dev",
        target_db_host: str = "mysql-internal",
        dry_run: bool = False,
    ) -> list[FixAction]:
        target_app_url = str(target_app_url).replace("\r", "").replace("\n", "").strip()
        target_db_host = str(target_db_host).replace("\r", "").replace("\n", "").strip()
        actions: list[FixAction] = []
        env_file = project_path / ".env"
        example_file = project_path / ".env.example"

        if env_file.exists():
            content = env_file.read_text(encoding="utf-8")
        elif example_file.exists():
            content = example_file.read_text(encoding="utf-8")
        else:
            content = cls._default_env_template()

        lines = content.splitlines()
        new_lines: list[str] = []
        has_app_key = False
        has_app_debug = False
        has_app_env = False
        has_app_url = False
        has_db_host = False

        for line in lines:
            stripped = line.strip()
            if stripped.startswith("APP_KEY="):
                val = stripped.split("=", 1)[1].strip()
                if not val or val == "base64:" or val == "SomeRandomString":
                    new_key = cls.generate_app_key()
                    new_lines.append(f"APP_KEY={new_key}")
                    actions.append(
                        FixAction(
                            check_id="env_app_key_missing",
                            action_type="modify_file",
                            target_file=".env",
                            description="Generated cryptographically secure 256-bit APP_KEY.",
                        )
                    )
                else:
                    new_lines.append(line)
                has_app_key = True

            elif stripped.startswith("APP_DEBUG="):
                new_lines.append("APP_DEBUG=false")
                has_app_debug = True
                actions.append(
                    FixAction(
                        check_id="env_app_debug_enabled",
                        action_type="modify_file",
                        target_file=".env",
                        description="Disabled APP_DEBUG for production security.",
                    )
                )

            elif stripped.startswith("APP_ENV="):
                new_lines.append("APP_ENV=production")
                has_app_env = True

            elif stripped.startswith("APP_URL="):
                new_lines.append(f"APP_URL={target_app_url}")
                has_app_url = True
                actions.append(
                    FixAction(
                        check_id="env_app_url_localhost",
                        action_type="modify_file",
                        target_file=".env",
                        description=f"Updated APP_URL to '{target_app_url}'.",
                    )
                )

            elif stripped.startswith("DB_HOST=") and metadata.db_connection == "mysql":
                val = stripped.split("=", 1)[1].strip()
                if val in ("127.0.0.1", "localhost"):
                    new_lines.append(f"DB_HOST={target_db_host}")
                    actions.append(
                        FixAction(
                            check_id="db_host_localhost_trap",
                            action_type="modify_file",
                            target_file=".env",
                            description=f"Changed DB_HOST from '{val}' to internal host '{target_db_host}'.",
                        )
                    )
                else:
                    new_lines.append(line)
                has_db_host = True

            else:
                new_lines.append(line)

        # Append missing mandatory keys if not found
        if not has_app_key:
            new_key = cls.generate_app_key()
            new_lines.insert(1, f"APP_KEY={new_key}")
            actions.append(
                FixAction(
                    check_id="env_app_key_missing",
                    action_type="modify_file",
                    target_file=".env",
                    description="Appended missing APP_KEY with secure 256-bit key.",
                )
            )

        if not has_app_debug:
            new_lines.append("APP_DEBUG=false")

        if not has_app_env:
            new_lines.insert(0, "APP_ENV=production")

        if not has_app_url:
            new_lines.append(f"APP_URL={target_app_url}")

        final_content = "\n".join(new_lines) + "\n"

        if not dry_run:
            env_file.write_text(final_content, encoding="utf-8")

        return actions

    @classmethod
    def fix_storage_directories(cls, project_path: Path, dry_run: bool = False) -> list[FixAction]:
        """Creates any missing storage subdirectories."""
        dirs = [
            "storage/app/public",
            "storage/framework/cache/data",
            "storage/framework/sessions",
            "storage/framework/views",
            "storage/logs",
            "bootstrap/cache",
        ]
        actions: list[FixAction] = []
        for rel_dir in dirs:
            target = project_path / rel_dir
            if not target.exists():
                if not dry_run:
                    target.mkdir(parents=True, exist_ok=True)
                    # touch gitignore
                    (target / ".gitignore").touch(exist_ok=True)
                actions.append(
                    FixAction(
                        check_id="storage_dirs_missing",
                        action_type="create_file",
                        target_file=rel_dir,
                        description=f"Created missing directory: {rel_dir}",
                    )
                )
        return actions

    @classmethod
    def repair_cpanel_mangle(cls, project_path: Path, dry_run: bool = False) -> list[FixAction]:
        """Restores root index.php to public/index.php and cleans project root."""
        actions: list[FixAction] = []
        root_index = project_path / "index.php"
        public_dir = project_path / "public"
        public_index = public_dir / "index.php"

        if root_index.is_file():
            if not dry_run:
                public_dir.mkdir(parents=True, exist_ok=True)
                if not public_index.exists():
                    public_index.write_text(cls._standard_public_index(), encoding="utf-8")
                # Remove insecure root index
                root_index.unlink()

            actions.append(
                FixAction(
                    check_id="cpanel_mangled_root_index",
                    action_type="restore_path",
                    target_file="public/index.php",
                    description="Removed insecure index.php from root and restored standard public/index.php.",
                )
            )
        return actions

    @classmethod
    def generate_dockerfile(cls, metadata: ProjectMetadata) -> str:
        """Generates an optimized multi-stage production Dockerfile."""
        php_ver = metadata.resolved_php_version

        if metadata.asset_bundler == "vite":
            return f"""# Stage 1: Build Frontend Assets with Node.js & Vite
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

# Stage 2: Production PHP-FPM + Nginx Runtime
FROM serversideup/php:{php_ver}-fpm-nginx
WORKDIR /var/www/html

# Install PHP dependencies without dev packages
COPY --chown=www-data:www-data composer*.json ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

# Copy application source and compiled assets
COPY --chown=www-data:www-data . .
COPY --chown=www-data:www-data --from=frontend /app/public/build ./public/build

# Set permissions for Laravel storage
RUN chmod -R 775 storage bootstrap/cache
"""
        else:
            return f"""# Production PHP-FPM + Nginx Runtime
FROM serversideup/php:{php_ver}-fpm-nginx
WORKDIR /var/www/html

# Install PHP dependencies without dev packages
COPY --chown=www-data:www-data composer*.json ./
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

# Copy application source
COPY --chown=www-data:www-data . .

# Set permissions for Laravel storage
RUN chmod -R 775 storage bootstrap/cache
"""

    @classmethod
    def generate_caddyfile(cls, domain: str = "app.studentapp.dev") -> str:
        """Generates a Caddyfile for automatic HTTPS reverse proxying."""
        return f"""{domain} {{
    reverse_proxy localhost:8080
    encode gzip zstd

    header {{
        # Security headers
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        X-XSS-Protection "1; mode=block"
    }}
}}
"""

    @staticmethod
    def _default_env_template() -> str:
        return """APP_NAME=Laravel
APP_ENV=production
APP_KEY=
APP_DEBUG=false
APP_URL=https://app.studentapp.dev

LOG_CHANNEL=stack
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug

DB_CONNECTION=mysql
DB_HOST=mysql-internal
DB_PORT=3306
DB_DATABASE=laravel
DB_USERNAME=root
DB_PASSWORD=

BROADCAST_DRIVER=log
CACHE_DRIVER=file
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120
"""

    @staticmethod
    def _standard_public_index() -> str:
        return r"""<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
(require_once __DIR__.'/../bootstrap/app.php')
    ->handleRequest(Request::capture());
"""

    @classmethod
    def fix_python_project(
        cls,
        project_path: Path,
        metadata: ProjectMetadata,
        dry_run: bool = False,
    ) -> list[FixAction]:
        actions: list[FixAction] = []
        framework = metadata.framework.lower()

        # 1. Fix requirements.txt
        req_file = project_path / "requirements.txt"
        if not req_file.exists():
            if "fastapi" in framework:
                req_content = "fastapi>=0.110.0\nuvicorn[standard]>=0.28.0\npydantic>=2.6.0\npython-multipart>=0.0.9\n"
            elif "flask" in framework:
                req_content = "Flask>=3.0.0\ngunicorn>=21.2.0\npython-dotenv>=1.0.0\n"
            elif "django" in framework:
                req_content = "Django>=5.0.0\ngunicorn>=21.2.0\npython-dotenv>=1.0.0\n"
            else:
                req_content = "# Python dependencies\n"

            if not dry_run:
                req_file.write_text(req_content, encoding="utf-8")
            actions.append(
                FixAction(
                    check_id="py_requirements_missing",
                    action_type="create_file",
                    target_file="requirements.txt",
                    description="Generated production requirements.txt with essential framework dependencies.",
                    diff_or_content=f"+ {req_content}",
                )
            )
        else:
            # Check if uvicorn is missing in FastAPI
            existing_reqs = req_file.read_text(encoding="utf-8")
            if "fastapi" in framework and "uvicorn" not in existing_reqs.lower():
                new_reqs = existing_reqs.rstrip() + "\nuvicorn>=0.28.0\n"
                if not dry_run:
                    req_file.write_text(new_reqs, encoding="utf-8")
                actions.append(
                    FixAction(
                        check_id="py_fastapi_uvicorn",
                        action_type="modify_file",
                        target_file="requirements.txt",
                        description="Appended uvicorn to requirements.txt for ASGI server support.",
                        diff_or_content="+ uvicorn>=0.28.0",
                    )
                )

        # 2. Fix .env
        env_file = project_path / ".env"
        if not env_file.exists():
            secret_key = secrets.token_hex(32)
            env_content = (
                f"HOST=0.0.0.0\n"
                f"PORT=8000\n"
                f"DEBUG=False\n"
                f"SECRET_KEY={secret_key}\n"
            )
            if not dry_run:
                env_file.write_text(env_content, encoding="utf-8")
            actions.append(
                FixAction(
                    check_id="py_env_missing",
                    action_type="create_file",
                    target_file=".env",
                    description="Generated production .env file with secure SECRET_KEY and server bindings.",
                    diff_or_content=f"+ HOST=0.0.0.0\n+ PORT=8000\n+ SECRET_KEY={secret_key[:8]}...",
                )
            )

        # 3. Fix Django ALLOWED_HOSTS if Django
        if "django" in framework:
            settings_files = list(project_path.glob("**/settings.py"))
            if settings_files:
                stg_file = settings_files[0]
                stg_content = stg_file.read_text(encoding="utf-8")
                import re
                if re.search(r"ALLOWED_HOSTS\s*=\s*\[\s*\]", stg_content):
                    new_stg = re.sub(
                        r"ALLOWED_HOSTS\s*=\s*\[\s*\]",
                        "ALLOWED_HOSTS = ['*']",
                        stg_content,
                    )
                    if not dry_run:
                        stg_file.write_text(new_stg, encoding="utf-8")
                    actions.append(
                        FixAction(
                            check_id="py_django_allowed_hosts",
                            action_type="modify_file",
                            target_file=str(stg_file.relative_to(project_path)),
                            description="Patched Django ALLOWED_HOSTS to ['*'] for public Cloudflare tunnel compatibility.",
                            diff_or_content="- ALLOWED_HOSTS = []\n+ ALLOWED_HOSTS = ['*']",
                        )
                    )

        return actions

    @classmethod
    def fix_node_project(
        cls,
        project_path: Path,
        metadata: ProjectMetadata,
        dry_run: bool = False,
    ) -> list[FixAction]:
        """
        Applies automated fixes for Node.js / Express / MERN projects:
        - Creates production .env with PORT and NODE_ENV
        - Ensures 'start' script exists in package.json
        """
        actions: list[FixAction] = []

        target_dir = project_path
        backend_name = None
        if metadata and metadata.framework_details and "backend_dir" in metadata.framework_details.get("metadata", {}):
            backend_name = metadata.framework_details["metadata"]["backend_dir"]
        elif (project_path / "backend" / "package.json").is_file():
            backend_name = "backend"
        elif (project_path / "server" / "package.json").is_file():
            backend_name = "server"
        elif (project_path / "api" / "package.json").is_file():
            backend_name = "api"

        if backend_name and (project_path / backend_name / "package.json").is_file():
            target_dir = project_path / backend_name

        # 1. Fix .env
        env_file = target_dir / ".env"
        if not env_file.exists() and not (project_path / ".env").exists():
            env_content = "PORT=5000\nNODE_ENV=production\n"
            if not dry_run:
                env_file.write_text(env_content, encoding="utf-8")
            target_rel = str(env_file.relative_to(project_path))
            actions.append(
                FixAction(
                    check_id="node_env_present",
                    action_type="create_file",
                    target_file=target_rel,
                    description=f"Generated production {target_rel} file with PORT and NODE_ENV=production.",
                    diff_or_content="+ PORT=5000\n+ NODE_ENV=production",
                )
            )

        # 2. Fix package.json start script
        pkg_file = target_dir / "package.json"
        if pkg_file.is_file():
            try:
                import json
                data = json.loads(pkg_file.read_text(encoding="utf-8"))
                scripts = data.get("scripts", {})
                if "start" not in scripts:
                    main = data.get("main", "server.js")
                    scripts["start"] = f"node {main}"
                    data["scripts"] = scripts
                    if not dry_run:
                        pkg_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
                    target_pkg_rel = str(pkg_file.relative_to(project_path))
                    actions.append(
                        FixAction(
                            check_id="node_start_script",
                            action_type="modify_file",
                            target_file=target_pkg_rel,
                            description=f"Added 'start': 'node {main}' to {target_pkg_rel} scripts.",
                            diff_or_content=f'+   "start": "node {main}"',
                        )
                    )
            except Exception:
                pass

        # 3. Frontend API URL Normalization
        frontend_dir = None
        for cand in ["frontend", "client", "ui", "web"]:
            if (project_path / cand / "package.json").is_file():
                frontend_dir = project_path / cand
                break

        if frontend_dir and (frontend_dir / "src").is_dir():
            normalized_files = []
            for ext in ["*.js", "*.jsx", "*.ts", "*.tsx"]:
                for src_file in (frontend_dir / "src").rglob(ext):
                    try:
                        content = src_file.read_text(encoding="utf-8")
                        new_content = re.sub(r'https?://(?:localhost|127\.0\.0\.1):[0-9]+', '', content)
                        if new_content != content:
                            if not dry_run:
                                src_file.write_text(new_content, encoding="utf-8")
                            normalized_files.append(str(src_file.relative_to(project_path)))
                    except Exception:
                        pass
            if normalized_files:
                actions.append(
                    FixAction(
                        check_id="node_frontend_api_url_hardcoded",
                        action_type="modify_file",
                        target_file=normalized_files[0],
                        description=f"Normalized hardcoded localhost URLs to relative API paths in {len(normalized_files)} frontend file(s).",
                        diff_or_content='- const backendDomain = "http://localhost:8000"\n+ const backendDomain = ""',
                    )
                )

        # 4. Full-Stack UI Bridge Injection in backend entrypoint
        if frontend_dir:
            entrypoint_candidates = ["server.js", "index.js", "app.js", "src/server.js", "src/index.js"]
            found_ep = None
            for ep_name in entrypoint_candidates:
                if (target_dir / ep_name).is_file():
                    found_ep = target_dir / ep_name
                    break

            if found_ep:
                try:
                    ep_text = found_ep.read_text(encoding="utf-8")
                    if "StackDoctor Full-Stack MERN UI Static Bridge" not in ep_text and "express.static" not in ep_text:
                        # Replace generic placeholder app.get('/', (req,res)=>res.send("hello world!"))
                        cleaned_ep = re.sub(
                            r'app\.get\(\s*[\'"]\/[\'"]\s*,\s*\([^)]*\)\s*=>\s*\{[^}]*res\.send\([^)]*\)[^}]*\}\s*\);?',
                            '// [StackDoctor] Placeholder root handler replaced by Static UI Bridge below',
                            ep_text,
                        )
                        # Ensure CORS origin allows same-origin and dynamic client URL if frontendUrl is omitted
                        cleaned_ep = re.sub(
                            r'origin\s*:\s*process\.env\.(frontendUrl|FRONTEND_URL|CLIENT_URL)',
                            r'origin: process.env.\1 || true',
                            cleaned_ep,
                        )

                        bridge_code = """

// --- StackDoctor Full-Stack MERN UI Static Bridge ---
const _path = require('path');
const _fs = require('fs');
const _distPath = _path.resolve(__dirname, '../frontend/dist');
const _localDistPath = _path.resolve(__dirname, 'dist');
const _activeDist = _fs.existsSync(_distPath) ? _distPath : (_fs.existsSync(_localDistPath) ? _localDistPath : null);
if (_activeDist) {
    app.use(express.static(_activeDist));
    app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api')) {
            return res.sendFile(_path.join(_activeDist, 'index.html'));
        }
        next();
    });
}
"""
                        if "app.listen" in cleaned_ep:
                            if "connectDB().then" in cleaned_ep:
                                new_ep_text = cleaned_ep.replace("connectDB().then", f"{bridge_code}\nconnectDB().then")
                            else:
                                idx = cleaned_ep.rfind("app.listen")
                                new_ep_text = cleaned_ep[:idx] + bridge_code + "\n" + cleaned_ep[idx:]
                        else:
                            new_ep_text = cleaned_ep + bridge_code

                        if not dry_run:
                            found_ep.write_text(new_ep_text, encoding="utf-8")

                        actions.append(
                            FixAction(
                                check_id="node_fullstack_ui_bridge",
                                action_type="modify_file",
                                target_file=str(found_ep.relative_to(project_path)),
                                description=f"Injected Full-Stack React UI static file serving bridge into {found_ep.relative_to(project_path)}.",
                                diff_or_content="+ app.use(express.static(distPath));\n+ app.get('*', ... res.sendFile('index.html'));",
                            )
                        )
                except Exception:
                    pass

        return actions


DoctorFixer = Fixer
