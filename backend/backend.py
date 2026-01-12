#!/usr/bin/env python3
"""
FastAPI server version of the new 3-step IBS food analysis backend.
Uses: Vision → Verification → IBS Risk Assessment
"""
import os
import base64
import json
import requests
import tempfile
from typing import Optional, Literal

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv(".env.local")
load_dotenv()

# -----------------------------
# Configuration
# -----------------------------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = "gpt-4o"

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY not set")

# -----------------------------
# FastAPI app + CORS
# -----------------------------

app = FastAPI(title="IBS Food Vision API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Utilities
# -----------------------------

def encode_image(path: str) -> str:
    """Encode image file to base64."""
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def openai_chat(messages: list, max_completion_tokens: int = 800) -> str:
    """Call OpenAI Chat API."""
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": messages,
        "max_completion_tokens": max_completion_tokens,
    }
    r = requests.post(url, headers=headers, json=payload, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(r.text)
    return r.json()["choices"][0]["message"]["content"]


def extract_json(text: str) -> dict:
    """
    Extract the first JSON object from model output.
    Handles code fences, preambles, and extra whitespace.
    """
    if not text or not text.strip():
        raise ValueError("Model returned empty output")

    text = text.strip()

    # Remove markdown fences
    if text.startswith("```"):
        parts = text.split("```")
        for p in parts:
            p = p.strip()
            if p.startswith("{") and p.endswith("}"):
                return json.loads(p)

    # Fallback: first {...} block
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output")

    return json.loads(text[start:end + 1])


# -----------------------------
# Step 1: Vision Observation
# -----------------------------

def vision_step(image_path: str) -> dict:
    """
    Observe what's visible in the food image without assumptions.
    """
    image_b64 = encode_image(image_path)

    system_prompt = (
        "You are a careful visual observer. "
        "Describe ONLY what is visible in the image. "
        "Do NOT guess recipes, ingredients, or preparation steps. "
        "If unsure, mark items as possible or uncertain. "
        "Return ONLY valid JSON."
    )

    user_prompt = [
        {
            "type": "text",
            "text": (
                "Analyze this food image.\n"
                "Return JSON with:\n"
                "- dish_name (generic if unsure)\n"
                "- observed_food_components (clearly visible food items)\n"
                "- possible_food_components (uncertain food items)\n"
                "- non_food_objects\n"
                "- visual_cues (e.g., fried, creamy, glazed, plain)\n"
                "- overall_confidence (0–1)\n"
            ),
        },
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
        },
    ]

    out = openai_chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )
    return extract_json(out)


# -----------------------------
# Step 2: Verification
# -----------------------------

def verify_observation(obs: dict) -> dict:
    """
    Verify and clean the observation, removing assumptions.
    """
    system_prompt = (
        "You are auditing a visual description. "
        "Remove any assumptions or recipe completion. "
        "Keep only what can be justified by the image itself. "
        "Return ONLY valid JSON."
    )

    user_prompt = (
        "Review and clean the following observation:\n\n"
        f"{json.dumps(obs, indent=2)}"
    )

    out = openai_chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )
    return extract_json(out)


# -----------------------------
# Step 3: IBS Risk Assessment
# -----------------------------

def ibs_risk_step(obs: dict, ibs_subtype: str = "unknown") -> dict:
    """
    Assess IBS-related risks based on visible food components.
    """
    system_prompt = (
        "You are providing IBS-oriented food risk guidance.\n"
        "Base your reasoning ONLY on visible components and visual cues.\n"
        "Do NOT cite medical facts or guarantees.\n"
        "Avoid deterministic rules.\n"
        "Acknowledge individual variability.\n"
        "Return ONLY valid JSON."
    )

    # Build context based on subtype
    subtype_context = ""
    priority_guidance = ""
    
    if ibs_subtype and ibs_subtype != "unknown":
        subtype_context = f"\n⚠️ USER'S IBS SUBTYPE: {ibs_subtype}\n"
        
        if ibs_subtype == "IBS_C":
            priority_guidance = (
                "PRIORITY FOR IBS-C: Focus on fiber content, binding foods, and low-residue items. "
                "Foods high in insoluble fiber or those that slow motility may worsen constipation."
            )
        elif ibs_subtype == "IBS_D":
            priority_guidance = (
                "PRIORITY FOR IBS-D: Focus on foods that might trigger diarrhea, such as high-fat items, "
                "spicy foods, caffeine, dairy, and high FODMAP foods. Gentle, binding foods are typically safer."
            )
        elif ibs_subtype == "IBS_M":
            priority_guidance = (
                "PRIORITY FOR IBS-M: Consider both constipation and diarrhea triggers. "
                "Balanced fiber, avoiding extremes in fat/spice, and moderate portions are key."
            )
        elif ibs_subtype == "IBS_U":
            priority_guidance = (
                "PRIORITY FOR IBS-U: Triggers are not well-defined yet. "
                "Provide conservative guidance and emphasize careful self-monitoring."
            )
        
        subtype_context += f"{priority_guidance}\n"

    user_prompt = (
        "Given this food observation, assess IBS-related risk.\n"
        f"{subtype_context}\n"
        "Output JSON with:\n"
        "- decision: likely_ok | caution | avoid (weighted toward the user's specific subtype if provided)\n"
        "- risk_factors (list of visible triggers, prioritize those relevant to user's subtype)\n"
        "- reasons (linked to visible evidence and user's subtype concerns)\n"
        "- ibs_c_note (constipation-predominant guidance)\n"
        "- ibs_d_note (diarrhea-predominant guidance)\n"
        "- ibs_m_note (mixed pattern guidance)\n"
        "- ibs_u_note (unclassified guidance)\n"
        "- advice_short (tailored to user's subtype if provided)\n"
        "- confidence (0–1)\n\n"
        f"Food observation:\n{json.dumps(obs, indent=2)}"
    )

    out = openai_chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_completion_tokens=1000
    )
    return extract_json(out)


# -----------------------------
# API Routes
# -----------------------------

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": "2.0",
        "description": "IBS Food Vision API - 3-step analysis"
    }


@app.post("/analyze")
async def analyze_meal(
    file: UploadFile = File(...),
    ibs_subtype: Optional[Literal["IBS_C", "IBS_D", "IBS_M", "IBS_U", "unknown"]] = Form("unknown"),
):
    """
    Analyze food image for IBS safety.
    3-step process: Vision → Verification → Risk Assessment
    
    Args:
        file: Image file of the meal
        ibs_subtype: IBS subtype (IBS_C, IBS_D, IBS_M, IBS_U, or unknown)
    
    Returns:
        JSON with food observation and IBS risk assessment
    """
    tmp_path = None
    try:
        # Save uploaded file
        suffix = os.path.splitext(file.filename or "")[1] or ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Step 1: Vision observation
        raw_obs = vision_step(tmp_path)
        
        # Step 2: Verification
        verified_obs = verify_observation(raw_obs)
        
        # Step 3: IBS risk assessment
        ibs_result = ibs_risk_step(verified_obs, ibs_subtype=ibs_subtype or "unknown")

        # Combine results
        final = {
            "food_observation": verified_obs,
            "ibs_risk_result": ibs_result,
        }

        return JSONResponse(content=final)

    except Exception as e:
        print(f"Error in /analyze: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e),
                "type": type(e).__name__
            }
        )
    
    finally:
        # Clean up temp file
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
