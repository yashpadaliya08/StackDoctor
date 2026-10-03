import os
from pathlib import Path
from dotenv import load_dotenv

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file
env_file = BASE_DIR / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    load_dotenv()

DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
PROJECTS_DIR = DATA_DIR / "projects"
DEPLOYMENTS_DIR = DATA_DIR / "deployments"

# Ensure directories exist
for d in (DATA_DIR, UPLOADS_DIR, PROJECTS_DIR, DEPLOYMENTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Application & Network Binding Configuration
HOST: str = os.getenv("STACKDOCTOR_HOST", os.getenv("HOST", "127.0.0.1"))
PORT: int = int(os.getenv("STACKDOCTOR_PORT", os.getenv("PORT", "8000")))
MAX_UPLOAD_SIZE_BYTES: int = int(os.getenv("MAX_UPLOAD_SIZE_BYTES", str(100 * 1024 * 1024)))
DEFAULT_DOMAIN_SUFFIX: str = os.getenv("DEFAULT_DOMAIN_SUFFIX", "studentapp.dev")

# Security & Authentication Secrets
# Master operator API key for privileged operations (exec, restarts, deletes)
STACKDOCTOR_API_KEY: str = os.getenv("STACKDOCTOR_API_KEY", "")
# Security audit logger authorization key
SD_AUDIT_API_KEY: str = os.getenv("SD_AUDIT_API_KEY", "stackdoctor-internal-key")
# Optional JWT secret for session verification
JWT_SECRET: str = os.getenv("JWT_SECRET", "")

# Edge Phone Runtime Drivers (Termux / ADB)
PHONE_HOST: str = os.getenv("PHONE_HOST", "127.0.0.1")
PHONE_PORT: int = int(os.getenv("PHONE_PORT", "8022"))
PHONE_USER: str = os.getenv("PHONE_USER", "termux")
PHONE_PASSWORD: str = os.getenv("PHONE_PASSWORD", "")

# Networking & Tunneling
CLOUDFLARE_TUNNEL_ENABLED: bool = os.getenv("CLOUDFLARE_TUNNEL_ENABLED", "true").lower() in ("true", "1", "yes")

# Supervision & Watchdog
WATCHDOG_INTERVAL: int = int(os.getenv("WATCHDOG_INTERVAL", "25"))

# Allowed CORS Origins
CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
    ).split(",")
    if origin.strip()
]
