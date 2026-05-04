#!/usr/bin/env python3
"""
FoodSense Bridge Server
Drop-in replacement for backend.py that routes every /analyze request
through a GitHub Actions workflow instead of processing locally.

Usage:
    cd backend && uvicorn bridge:app --host 0.0.0.0 --port 8000
"""
import io
import json
import os
import subprocess
import time
import uuid
import zipfile
import base64
from typing import Optional, Literal

import requests as http_requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv(".env.local")
load_dotenv()

GITHUB_OWNER = "adotdong29"
GITHUB_REPO = "DDW_IBS_FOOD"
POLL_INTERVAL = 8    # seconds between artifact polls
MAX_WAIT = 360       # max wait time in seconds (6 min)


def _get_github_token() -> str:
    token = os.getenv("GITHUB_TOKEN")
    if token:
        return token
    try:
        return subprocess.check_output(
            ["gh", "auth", "token"], stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        raise RuntimeError(
            "GitHub token not found. Set GITHUB_TOKEN env var or run `gh auth login`."
        )


GITHUB_TOKEN = _get_github_token()
GH_HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

app = FastAPI(title="FoodSense Bridge API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "status": "ok",
        "mode": "github-actions",
        "version": "1.0",
        "description": "FoodSense Bridge — analysis runs in GitHub Actions",
        "supported_conditions": ["ibs", "allergy", "diabetes", "hypertension"],
    }


@app.post("/analyze")
def analyze_meal(
    file: UploadFile = File(...),
    condition: Literal["ibs", "allergy", "diabetes", "hypertension"] = Form("ibs"),
    user_allergies: Optional[str] = Form(None),
    diabetes_type: Optional[str] = Form(None),
    hypertension_severity: Optional[str] = Form(None),
):
    job_id = str(uuid.uuid4())
    image_bytes = file.file.read()
    gist_id = None

    try:
        # 1. Upload image to a private GitHub Gist so the workflow can fetch it
        gist_id = _create_gist(job_id, image_bytes)
        print(f"[{job_id[:8]}] Gist created: {gist_id}")

        # 2. Trigger the GitHub Actions workflow
        _trigger_dispatch(job_id, gist_id, condition, user_allergies, diabetes_type, hypertension_severity)
        print(f"[{job_id[:8]}] Workflow triggered — waiting for result...")

        # 3. Block until the artifact is ready (or timeout)
        result = _poll_for_artifact(job_id)
        print(f"[{job_id[:8]}] Result received: decision={result.get(f'{condition}_risk_result', {}).get('decision', '?')}")

        return JSONResponse(content=result)

    except TimeoutError as e:
        return JSONResponse(status_code=504, content={"error": str(e), "type": "TimeoutError"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e), "type": type(e).__name__})
    finally:
        if gist_id:
            _delete_gist(gist_id)
            print(f"[{job_id[:8]}] Gist deleted.")


# ------------------------------------------------------------------
# GitHub Gist helpers
# ------------------------------------------------------------------

def _create_gist(job_id: str, image_bytes: bytes) -> str:
    image_b64 = base64.b64encode(image_bytes).decode()
    resp = http_requests.post(
        "https://api.github.com/gists",
        headers=GH_HEADERS,
        json={
            "description": f"FoodSense job {job_id}",
            "public": False,
            "files": {f"image_{job_id}.b64": {"content": image_b64}},
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["id"]


def _delete_gist(gist_id: str):
    try:
        http_requests.delete(
            f"https://api.github.com/gists/{gist_id}", headers=GH_HEADERS, timeout=10
        )
    except Exception:
        pass


# ------------------------------------------------------------------
# GitHub Actions dispatch
# ------------------------------------------------------------------

def _trigger_dispatch(job_id, gist_id, condition, user_allergies, diabetes_type, hypertension_severity):
    resp = http_requests.post(
        f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/dispatches",
        headers=GH_HEADERS,
        json={
            "event_type": "analyze-food",
            "client_payload": {
                "job_id": job_id,
                "gist_id": gist_id,
                "condition": condition,
                "user_allergies": user_allergies or "",
                "diabetes_type": diabetes_type or "",
                "hypertension_severity": hypertension_severity or "",
            },
        },
        timeout=30,
    )
    resp.raise_for_status()


# ------------------------------------------------------------------
# Artifact polling and download
# ------------------------------------------------------------------

def _poll_for_artifact(job_id: str) -> dict:
    artifact_name = f"result-{job_id}"
    deadline = time.time() + MAX_WAIT

    while time.time() < deadline:
        resp = http_requests.get(
            f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/actions/artifacts",
            headers=GH_HEADERS,
            params={"name": artifact_name, "per_page": 5},
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data["total_count"] > 0:
                artifact_id = data["artifacts"][0]["id"]
                print(f"[{job_id[:8]}] Artifact found (id={artifact_id}), downloading...")
                return _download_artifact(artifact_id)

        elapsed = int(time.time() - (deadline - MAX_WAIT))
        print(f"[{job_id[:8]}] Still waiting... ({elapsed}s)")
        time.sleep(POLL_INTERVAL)

    raise TimeoutError(
        f"Analysis timed out after {MAX_WAIT}s. "
        "GitHub Actions may be queued or the workflow may have failed. "
        "Check https://github.com/adotdong29/DDW_IBS_FOOD/actions for details."
    )


def _download_artifact(artifact_id: int) -> dict:
    resp = http_requests.get(
        f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/actions/artifacts/{artifact_id}/zip",
        headers=GH_HEADERS,
        allow_redirects=True,
        timeout=60,
    )
    resp.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
        with z.open("result.json") as f:
            return json.loads(f.read())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
