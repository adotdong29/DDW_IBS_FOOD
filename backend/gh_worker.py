#!/usr/bin/env python3
"""
FoodSense GitHub Actions Worker
Runs inside GitHub Actions to perform food image analysis using OpenAI.
"""
import os
import json
import base64
import requests
import tempfile
from typing import Optional

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
GH_PAT = os.environ["GH_PAT"]
JOB_ID = os.environ["JOB_ID"].strip()
GIST_ID = os.environ["GIST_ID"].strip()
CONDITION = os.environ["CONDITION"].strip()
USER_ALLERGIES = os.environ.get("USER_ALLERGIES", "").strip() or None
DIABETES_TYPE = os.environ.get("DIABETES_TYPE", "").strip() or None
HYPERTENSION_SEVERITY = os.environ.get("HYPERTENSION_SEVERITY", "").strip() or None

MODEL = "gpt-4o"
GH_HEADERS = {
    "Authorization": f"Bearer {GH_PAT}",
    "Accept": "application/vnd.github+json",
}


# ------------------------------------------------------------------
# OpenAI helpers
# ------------------------------------------------------------------

def encode_image(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def openai_chat(messages: list, max_completion_tokens: int = 1000) -> str:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": MODEL, "messages": messages, "max_completion_tokens": max_completion_tokens}
    r = requests.post(url, headers=headers, json=payload, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"OpenAI error {r.status_code}: {r.text}")
    return r.json()["choices"][0]["message"]["content"]


def extract_json(text: str) -> dict:
    if not text or not text.strip():
        raise ValueError("Model returned empty output")
    text = text.strip()
    if text.startswith("```"):
        for p in text.split("```"):
            p = p.strip()
            if p.lower().startswith("json"):
                p = p[4:].strip()
            if p.startswith("{") and p.endswith("}"):
                return json.loads(p)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in model output")
    return json.loads(text[start:end + 1])


# ------------------------------------------------------------------
# Analysis steps (mirrors backend.py logic)
# ------------------------------------------------------------------

def vision_step(image_path: str, condition: str) -> dict:
    image_b64 = encode_image(image_path)
    focus = {
        "ibs": "textures that indicate cooking methods (fried, raw, fermented)",
        "allergy": "visible allergens, cross-contamination risks",
        "diabetes": "portion size and visual carbohydrate indicators",
        "hypertension": "processing indicators (glazed, fried, cured, salted appearance)",
    }.get(condition, "general food characteristics")

    system_prompt = (
        "You are a careful visual observer. Describe ONLY what is visible in the image. "
        "Do NOT guess ingredients or hidden preparations. "
        f"Pay special attention to {focus}. Return ONLY valid JSON."
    )
    user_prompt = [
        {"type": "text", "text": (
            "Analyze this food image.\nReturn JSON with:\n"
            "- dish_name (generic if unsure)\n"
            "- observed_food_components (clearly visible food items)\n"
            "- possible_food_components (uncertain food items)\n"
            "- visual_cues (e.g., fried, creamy, glazed, fresh)\n"
            "- estimated_portion_size (if visible)\n"
            "- overall_confidence (0-1)\n"
        )},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
    ]
    out = openai_chat([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}])
    return extract_json(out)


def ibs_risk_step(obs: dict) -> dict:
    system_prompt = (
        "You are providing IBS-oriented food risk guidance.\n"
        "Base your reasoning ONLY on visible components and visual cues.\n"
        "Focus on FODMAPs and digestive patterns. Acknowledge individual variability.\n"
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
        "- confidence (0-1)\n\n"
        f"Food observation:\n{json.dumps(obs, indent=2)}"
    )
    out = openai_chat(
        [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        max_completion_tokens=1000,
    )
    return extract_json(out)


def allergy_risk_step(obs: dict, user_allergies: Optional[str] = None) -> dict:
    allergy_context = ""
    if user_allergies and user_allergies.strip():
        allergy_context = (
            f"\n⚠️ USER'S KNOWN ALLERGIES: {user_allergies}\n"
            "PRIORITY: Scan for these specific allergens and cross-contamination risks.\n"
        )
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
        "Given this food observation, assess allergy risk.\n"
        f"{allergy_context}\n"
        "Output JSON with:\n"
        "- decision: likely_ok | caution | avoid (prioritize user's specific allergies if provided)\n"
        "- suspected_allergens (visible allergens, ESPECIALLY user's known allergies)\n"
        "- possible_hidden_allergens (may be present but not visible)\n"
        "- cross_contamination_risks (especially for user's allergies)\n"
        "- reasons (linked to visible evidence and user's allergies)\n"
        "- advice_short (personalized to user's allergies if provided)\n"
        "- confidence (0-1)\n\n"
        f"Food observation:\n{json.dumps(obs, indent=2)}"
    )
    out = openai_chat([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}])
    return extract_json(out)


def diabetes_risk_step(obs: dict, diabetes_type: Optional[str] = None) -> dict:
    diabetes_context = ""
    if diabetes_type and diabetes_type != "general":
        type_guidance = {
            "type1": "Type 1 - Focus on carb counting for insulin dosing.",
            "type2": "Type 2 - Focus on glycemic control and weight management.",
            "gestational": "Gestational - Focus on blood sugar stability.",
            "prediabetes": "Prediabetes - Focus on prevention.",
        }.get(diabetes_type, "")
        if type_guidance:
            diabetes_context = f"\n⚠️ USER HAS: {type_guidance}\n"
    system_prompt = (
        "You are a Diabetes Educator. Assess health risks based on the provided food observation. "
        "1. Assess Glycemic Risk (Carbs/Sugar).\n"
        "2. Assess Insulin Resistance & Heart Health (Saturated Fats, Sodium, Processed Meats).\n"
        "IMPORTANT: Do not treat high-fat items like bacon, butter, or processed meats merely as 'Glucose Buffers'. "
        "While they may slow absorption, they pose risks for insulin resistance and heart health. "
        "If these are present, downgrade the decision to 'Caution' or 'Avoid' even if carbs are low. "
        "Return STRICT JSON only."
    )
    user_prompt = (
        "Assess the diabetes and metabolic risk for this food observation:\n"
        f"{diabetes_context}\n"
        f"{json.dumps(obs, indent=2)}\n\n"
        "Output JSON with:\n"
        "- decision: likely_ok | caution | avoid\n"
        "- glucose_curve_prediction (Sharp Spike | Gradual Rise | Steady | Delayed Rise)\n"
        "- carbohydrate_load (Low | Medium | High)\n"
        "- net_carbs_estimate (e.g. '20-30g')\n"
        "- glucose_drivers (list of visible carb/sugar triggers)\n"
        "- glucose_buffers (list of fiber/protein/healthy fat sources)\n"
        "- insulin_resistance_risks (list high saturated fats, processed meats like bacon/sausage, or heavy cream)\n"
        "- reasons (explain the balance of carbs vs. insulin resistance risks)\n"
        "- advice_short\n"
        "- confidence (0-1)\n"
        "- uncertainty_notes"
    )
    out = openai_chat([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}])
    return extract_json(out)


def hypertension_risk_step(obs: dict, hypertension_severity: Optional[str] = None) -> dict:
    hypertension_context = ""
    if hypertension_severity and hypertension_severity != "general":
        severity_guidance = {
            "stage1": "Stage 1 (130-139/80-89) - Need moderate sodium restriction. DASH diet recommended.",
            "stage2": "Stage 2 (>=140/>=90) - Need strict sodium restriction (<1500mg/day).",
            "controlled": "Controlled with medication - Maintain DASH diet.",
        }.get(hypertension_severity, "")
        if severity_guidance:
            hypertension_context = f"\n⚠️ USER HAS: {severity_guidance}\n"
    system_prompt = (
        "You are a Hypertension Specialist and DASH Diet expert.\n"
        "Assess blood pressure risk based on visible food observation.\n"
        "Identify 'Pressure Drivers' (sodium, saturated fats, added sugars)\n"
        "and 'Pressure Buffers' (potassium, magnesium, fiber, healthy fats).\n"
        "Return ONLY valid JSON."
    )
    user_prompt = (
        "Given this food observation, assess hypertension risk.\n"
        f"{hypertension_context}\n"
        "Output JSON with:\n"
        "- decision: likely_ok | caution | avoid\n"
        "- sodium_load_estimate (Low | Medium | High)\n"
        "- pressure_drivers (list of visible sodium/fat triggers)\n"
        "- pressure_buffers (list of potassium/magnesium/fiber sources)\n"
        "- reasons (linked to visual evidence and severity if provided)\n"
        "- advice_short (DASH-aligned tips, tailored to severity if provided)\n"
        "- confidence (0-1)\n"
        "- uncertainty_notes\n\n"
        f"Food observation:\n{json.dumps(obs, indent=2)}"
    )
    out = openai_chat([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}])
    return extract_json(out)


# ------------------------------------------------------------------
# Gist image fetch
# ------------------------------------------------------------------

def fetch_image_from_gist(gist_id: str, job_id: str) -> bytes:
    resp = requests.get(f"https://api.github.com/gists/{gist_id}", headers=GH_HEADERS, timeout=30)
    resp.raise_for_status()
    gist = resp.json()

    file_key = f"image_{job_id}.b64"
    file_info = gist["files"].get(file_key)
    if not file_info:
        raise ValueError(f"Image file '{file_key}' not found in gist {gist_id}")

    # Handle truncated content (files >10MB raw are served via raw_url)
    if file_info.get("truncated"):
        raw_resp = requests.get(file_info["raw_url"], timeout=60)
        raw_resp.raise_for_status()
        content = raw_resp.text
    else:
        content = file_info["content"]

    return base64.b64decode(content)


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

def main():
    print(f"FoodSense Worker | job={JOB_ID} | condition={CONDITION}")

    print(f"Fetching image from gist {GIST_ID}...")
    image_bytes = fetch_image_from_gist(GIST_ID, JOB_ID)
    print(f"Image fetched: {len(image_bytes):,} bytes")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        print("Running vision analysis...")
        obs = vision_step(tmp_path, CONDITION)
        print(f"Vision step done: dish={obs.get('dish_name', '?')}")

        print(f"Running {CONDITION} risk assessment...")
        if CONDITION == "ibs":
            risk_result = ibs_risk_step(obs)
            result_key = "ibs_risk_result"
        elif CONDITION == "allergy":
            risk_result = allergy_risk_step(obs, USER_ALLERGIES)
            result_key = "allergy_risk_result"
        elif CONDITION == "diabetes":
            risk_result = diabetes_risk_step(obs, DIABETES_TYPE)
            result_key = "diabetes_risk_result"
        elif CONDITION == "hypertension":
            risk_result = hypertension_risk_step(obs, HYPERTENSION_SEVERITY)
            result_key = "hypertension_risk_result"
        else:
            raise ValueError(f"Unsupported condition: {CONDITION}")

        result = {
            "condition": CONDITION,
            "food_observation": obs,
            result_key: risk_result,
            "disclaimer": (
                "Image-based guidance only. Hidden ingredients, seasonings, and "
                "off-camera additions cannot be detected. Not medical advice. "
                "Always consult with a healthcare provider for personalized guidance."
            ),
        }

        with open("result.json", "w") as f:
            json.dump(result, f, indent=2)

        print(f"Done. decision={risk_result.get('decision', '?')}")

    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass


if __name__ == "__main__":
    main()
