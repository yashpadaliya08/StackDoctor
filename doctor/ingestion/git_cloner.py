import re
import shutil
import subprocess
from pathlib import Path


class GitCloneError(Exception):
    """Raised when cloning a Git repository fails."""
    pass


class SafeGitCloner:
    """
    Performs shallow clones of public Git repositories for project analysis.
    Supports GitHub, GitLab, and Bitbucket URLs — with or without .git suffix.
    """

    # Regex to extract owner/repo and optional branch from GitHub/GitLab/Bitbucket browser URLs
    _GITHUB_TREE_RE = re.compile(
        r"^https?://(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)"
        r"/([^/]+/[^/]+)/tree/([^/?#]+)",
        re.IGNORECASE,
    )
    _REPO_BASE_RE = re.compile(
        r"^(https?://(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)/[^/]+/[^/]+?)(?:/.*)?$",
        re.IGNORECASE,
    )

    @classmethod
    def normalize_git_url(cls, url: str) -> tuple[str, str | None]:
        """
        Normalize any GitHub/GitLab/Bitbucket URL to a clone-compatible URL.

        Returns:
            (clone_url, branch_or_None)

        Examples:
            "https://github.com/user/repo"              -> ("https://github.com/user/repo.git", None)
            "https://github.com/user/repo.git"          -> ("https://github.com/user/repo.git", None)
            "https://github.com/user/repo/tree/develop" -> ("https://github.com/user/repo.git", "develop")
            "https://github.com/user/repo/blob/main/..."-> ("https://github.com/user/repo.git", "main")
        """
        url = url.strip().rstrip("/")

        # Case 1: URL contains /tree/<branch> or /blob/<branch>
        tree_match = cls._GITHUB_TREE_RE.match(url)
        if tree_match:
            base = f"https://{url.split('/')[2]}/{tree_match.group(1)}"
            branch = tree_match.group(2)
            clone_url = base if base.endswith(".git") else f"{base}.git"
            return clone_url, branch

        # Case 2: Clean repo base URL (strip extra paths like /issues, /pulls, etc.)
        base_match = cls._REPO_BASE_RE.match(url)
        if base_match:
            base = base_match.group(1)
            clone_url = base if base.endswith(".git") else f"{base}.git"
            return clone_url, None

        # Case 3: Already a valid git URL (ssh, etc.) — pass through
        return url, None

    @classmethod
    def is_valid_git_url(cls, url: str) -> bool:
        """
        Return True if the URL looks like a valid Git repository URL.
        Accepts http(s) URLs from GitHub, GitLab, Bitbucket, or any .git URL.
        """
        url = url.strip()
        if url.startswith("git@"):
            return True  # SSH format
        if url.endswith(".git"):
            return True
        # Accept browser-style GitHub/GitLab/Bitbucket URLs
        if re.match(r"^https?://(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)/", url, re.I):
            return True
        # Fallback: any https URL (private/self-hosted GitLab etc.)
        if url.startswith("https://") or url.startswith("http://"):
            return True
        return False

    @classmethod
    def clone(cls, repo_url: str, target_dir: str | Path, branch: str | None = None) -> Path:
        target_dir = Path(target_dir).resolve()
        target_dir.mkdir(parents=True, exist_ok=True)

        # Normalize URL and extract branch from URL if not explicitly given
        clone_url, url_branch = cls.normalize_git_url(repo_url)
        effective_branch = branch or url_branch  # explicit branch overrides URL-embedded branch

        if clone_url.startswith("-"):
            raise GitCloneError("Invalid Git repository URL format.")
        if effective_branch and (effective_branch.startswith("-") or not re.match(r"^[a-zA-Z0-9_\-\.\/]+$", effective_branch)):
            raise GitCloneError("Invalid Git branch name format.")

        cmd = [
            "git",
            "-c", "protocol.ext.allow=never",
            "clone",
            "--depth", "1",
        ]
        if effective_branch:
            cmd.extend(["--branch", effective_branch])
        cmd.extend(["--", clone_url, str(target_dir)])

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,  # 2 minute max clone
                check=False,
            )
            if result.returncode != 0:
                raise GitCloneError(f"Git clone failed: {result.stderr.strip() or result.stdout.strip()}")

            # Remove .git folder to save space and prevent accidental git operations
            git_dir = target_dir / ".git"
            if git_dir.exists():
                shutil.rmtree(git_dir, ignore_errors=True)

            return target_dir

        except subprocess.TimeoutExpired:
            raise GitCloneError("Git clone timed out after 120 seconds. Check repository URL and network.")
        except FileNotFoundError:
            raise GitCloneError("git executable not found on system PATH.")
