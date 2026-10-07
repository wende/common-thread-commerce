"""Resolve Compose bind mounts correctly when running inside the setup container."""
import json
import os
from pathlib import Path
import subprocess


def project_root():
    if os.environ.get("COMMON_THREAD_PROJECT_ROOT"):
        return Path(os.environ["COMMON_THREAD_PROJECT_ROOT"])
    if os.environ.get("COMMON_THREAD_BOOTSTRAP") == "1":
        result = subprocess.run(
            ["docker", "inspect", os.environ["HOSTNAME"]],
            check=True, capture_output=True, text=True,
        )
        container = json.loads(result.stdout)[0]
        mount = next(m for m in container["Mounts"] if m["Destination"] == "/workspace")
        # Compose must use the host paths that Docker sees for bind mounts.
        root = Path(mount["Source"])
        if root != Path("/workspace") and not root.exists():
            root.parent.mkdir(parents=True, exist_ok=True)
            root.symlink_to("/workspace", target_is_directory=True)
        os.environ["COMMON_THREAD_PROJECT_ROOT"] = str(root)
        os.environ["COMPOSE_PROJECT_NAME"] = container["Config"]["Labels"]["com.docker.compose.project"]
        return root
    return Path(__file__).resolve().parents[1]


def compose_command(root=None):
    root = root or project_root()
    return ["docker", "compose", "--project-directory", str(root), "-f", str(root / "compose.yaml")]
