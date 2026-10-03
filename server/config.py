import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
PROJECTS_DIR = DATA_DIR / "projects"
DEPLOYMENTS_DIR = DATA_DIR / "deployments"

# Ensure directories exist
for d in (DATA_DIR, UPLOADS_DIR, PROJECTS_DIR, DEPLOYMENTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

# Application Configuration
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", 8000))
MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB
DEFAULT_DOMAIN_SUFFIX = "studentapp.dev"
