import os


def detect_language(repo_path: str) -> str:
    """Deterministic detection (no LLM)."""

    def exists(name: str) -> bool:
        return os.path.exists(os.path.join(repo_path, name))

    if exists("go.mod"):
        return "go"
    if exists("Cargo.toml"):
        return "rust"
    if exists("package.json"):
        return "node"
    if exists("pyproject.toml") or exists("requirements.txt") or exists("setup.py"):
        return "python"

    return "unknown"
