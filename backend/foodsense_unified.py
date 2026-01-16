#!/usr/bin/env python3
"""
FoodSense Unified Backend - Multi-Condition Food Analysis
Supports: IBS, Allergy, Diabetes, Hypertension
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

app = FastAPI(title="FoodSense API", version="3.0")

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


def openai_chat(messages: list, max_completion_tokens: int = 1000) -> str:
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
    """Extract the first JSON object from model output."""
    if not text or not text.strip():
        raise ValueError("Model returned empty output")

    text = text.strip()

    # Remove markdown fences
    if text.startswith("```"):
        parts = text.split("```")
        for p in parts:
            p = p.strip()
            if p.lower().startswith("json"):
                p = p[4:].strip()
            if p.startswith("{") and p.endswith("}"):
                return json.loads(p)

    # Fallback: first {...} block
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output")

    return json.loads(text[start:end + 1])


# -----------------------------
# Vision Step (Shared)
# -----------------------------

def vision_step(image_path: str, condition: str) -> dict:
    """Observe what's visible in the food image."""
    image_b64 = encode_image(image_path)

    # Customize observation based on condition
    focus = {
        "ibs": "textures that indicate cooking methods (fried, raw, fermented)",
        "allergy": "visible allergens, cross-contamination risks",
        "diabetes": "portion size and visual carbohydrate indicators",
        "hypertension": "processing indicators (glazed, fried, cured, salted appearance)"
    }.get(condition, "general food characteristics")

    system_prompt = (
        "You are a careful visual observer. "
        "Describe ONLY what is visible in the image. "
        "Do NOT guess ingredients or hidden preparations. "
        f"Pay special attention to {focus}. "
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
                "- visual_cues (e.g., fried, creamy, glazed, fresh)\n"
                "- estimated_portion_size (if visible)\n"
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
# IBS Risk Assessment
# -----------------------------

def ibs_risk_step(obs: dict) -> dict:
    """Assess IBS-related risks based on visible food components."""
    system_prompt = (
        "You are providing IBS-oriented food risk guidance.\n"
        "Base your reasoning ONLY on visible components and visual cues.\n"
        "Focus on FODMAPs and digestive patterns.\n"
        "Acknowledge individual variability.\n"
        "Return ONLY valid JSON."
    )

    user_prompt = (
        "Given this food observation, assess IBS-related risk.\n\n"
        "Output JSON with:\n"
        "- decision: likely_ok | caution | avoid\n"
        "- risk_factors (list of visible triggers)\n"
        "- reasons (linked to visible evidence)\n"
        "- ibs_c_note (constipation-predominant guidance)\n"
        "- ibs_d_note (diarrhea-predominant guidance)\n"
        "- ibs_m_note (mixed pattern guidance)\n"
        "- ibs_u_note (unclassified guidance)\n"
        "- advice_short\n"
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
# Allergy Risk Assessment
# -----------------------------

def allergy_risk_step(obs: dict) -> dict:
    """Assess allergy risks focusing on cross-contamination and triggers."""
    system_prompt = (
        "You provide practical food allergy guidance.\n"
        "Use common-sense thresholds:\n"
        "- Fresh fruits and vegetables with no visible allergens → likely_ok\n"
        "- Clearly visible major allergens (nuts, wheat, dairy) → avoid\n"
        "- Mixed, processed, or unclear dishes → caution\n"
        "Focus on cross-contamination risks.\n"
        "Return ONLY valid JSON."
    )

    user_prompt = (
        "Given this food observation, assess allergy risk.\n\n"
        "Output JSON with:\n"
        "- decision: likely_ok | caution | avoid\n"
        "- suspected_allergens (visible allergens)\n"
        "- possible_hidden_allergens (may be present but not visible)\n"
        "- cross_contamination_risks\n"
        "- reasons (linked to visible evidence)\n"
        "- advice_short\n"
        "- confidence (0–1)\n\n"
        f"Food observation:\n{json.dumps(obs, indent=2)}"
    )

    out = openai_chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )
    return extract_json(out)


# -----------------------------
# Diabetes Risk Assessment
# -----------------------------

def diabetes_risk_step(obs: dict) -> dict:
    """Assess diabetes risks focusing on glycemic curve and carbohydrates."""
    system_prompt = (
        "You are a Diabetes Educator.\n"
        "Assess glycemic risk based on visible food observation.\n"
        "Categorize impact as 'Steady', 'Gradual Rise', or 'Sharp Spike'.\n"
        "Identify 'Glucose Drivers' and 'Glucose Buffers'.\n"
        "Return ONLY valid JSON."
    )

    user_prompt = (
        "Given this food observation, assess diabetes risk.\n\n"
        "Output JSON with:\n"
        "- decision: likely_ok | caution | avoid\n"
        "- glucose_curve_prediction (Sharp Spike | Gradual Rise | Steady)\n"
        "- carbohydrate_load (Low | Medium | High)\n"
        "- net_carbs_estimate (e.g., '20-30g')\n"
        "- glucose_drivers (list of visible triggers)\n"
        "- glucose_buffers (list of fiber/protein/fat sources)\n"
        "- reasons (linked to visible evidence)\n"
        "- advice_short\n"
        "- confidence (0–1)\n"
        "- uncertainty_notes\n\n"
        f"Food observation:\n{json.dumps(obs, indent=2)}"
    )

    out = openai_chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
    )
    return extract_json(out)


# -----------------------------
# Hypertension Risk Assessment
# -----------------------------

def hypertension_risk_step(obs: dict) -> dict:
    """Assess hypertension risks focusing on sodium/potassium balance (DASH)."""
    system_prompt = (
        "You are a Hypertension Specialist and DASH Diet expert.\n"
        "Assess blood pressure risk based on visible food observation.\n"
        "Identify 'Pressure Drivers' (sodium, saturated fats, added sugars)\n"
        "and 'Pressure Buffers' (potassium, magnesium, fiber, healthy fats).\n"
        "Return ONLY valid JSON."
    )

    user_prompt = (
        "Given this food observation, assess hypertension risk.\n\n"
        "Output JSON with:\n"
        "- decision: likely_ok | caution | avoid\n"
        "- sodium_load_estimate (Low | Medium | High)\n"
        "- pressure_drivers (list of visible sodium/fat triggers)\n"
        "- pressure_buffers (list of potassium/magnesium/fiber sources)\n"
        "- reasons (linked to visual evidence)\n"
        "- advice_short (DASH-aligned tips)\n"
        "- confidence (0–1)\n"
        "- uncertainty_notes\n\n"
        f"Food observation:\n{json.dumps(obs, indent=2)}"
    )

    out = openai_chat(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
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
        "version": "3.0",
        "description": "FoodSense API - Multi-condition food analysis",
        "supported_conditions": ["ibs", "allergy", "diabetes", "hypertension"]
    }


@app.post("/analyze")
async def analyze_meal(
    file: UploadFile = File(...),
    condition: Literal["ibs", "allergy", "diabetes", "hypertension"] = Form("ibs"),
):
    """
    Analyze food image for specified health condition.
    
    Args:
        file: Image file of the meal
        condition: Health condition to analyze for (ibs, allergy, diabetes, hypertension)
    
    Returns:
        JSON with food observation and condition-specific risk assessment
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
        obs = vision_step(tmp_path, condition)
        
        # Step 2: Condition-specific risk assessment
        if condition == "ibs":
            risk_result = ibs_risk_step(obs)
            result_key = "ibs_risk_result"
        elif condition == "allergy":
            risk_result = allergy_risk_step(obs)
            result_key = "allergy_risk_result"
        elif condition == "diabetes":
            risk_result = diabetes_risk_step(obs)
            result_key = "diabetes_risk_result"
        elif condition == "hypertension":
            risk_result = hypertension_risk_step(obs)
            result_key = "hypertension_risk_result"
        else:
            raise ValueError(f"Unsupported condition: {condition}")

        # Combine results
        final = {
            "condition": condition,
            "food_observation": obs,
            result_key: risk_result,
            "disclaimer": (
                "Image-based guidance only. Hidden ingredients, seasonings, and "
                "off-camera additions cannot be detected. Not medical advice. "
                "Always consult with a healthcare provider for personalized guidance."
            )
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
