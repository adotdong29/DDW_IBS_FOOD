#!/usr/bin/env python3
import os
import sys
import json
import base64
import requests

# -----------------------------
# Configuration
# -----------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = "gpt-5.2"

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY not set")

# -----------------------------
# Utilities
# -----------------------------

def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def openai_chat(messages, max_completion_tokens=1000):
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
    r = requests.post(url, headers=headers, json=payload)
    if r.status_code != 200:
        raise RuntimeError(f"API Error: {r.text}")
    return r.json()["choices"][0]["message"]["content"]

def extract_json(text):
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        for p in parts:
            p = p.strip()
            if p.lower().startswith("json"): p = p[4:].strip()
            if p.startswith("{") and p.endswith("}"): return json.loads(p)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1: raise ValueError("No valid JSON found")
    return json.loads(text[start:end + 1])

# -----------------------------
# Step 1: Vision Observation
# -----------------------------

def vision_step(image_path):
    image_b64 = encode_image(image_path)
    system_prompt = (
        "You are a careful food image observer. Describe ONLY what is directly visible. "
        "Focus on textures that indicate processing (shiny glazes, fried coatings, cured meats). "
        "Return STRICT JSON only."
    )
    user_prompt = [
        {"type": "text", "text": (
            "From this image, identify:\n"
            "- dish_name\n"
            "- observed_food_components\n"
            "- possible_food_components\n"
            "- visual_cues (e.g., salty/brined, fried, fresh, processed)\n"
            "- estimated_portion_size\n"
            "- overall_confidence (0-1)"
        )},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}
    ]
    return extract_json(openai_chat([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]))

# -----------------------------
# Step 2: Hypertension (DASH) Impact Assessment
# -----------------------------

def hypertension_step(obs):
    system_prompt = (
        "You are a Hypertension Specialist and DASH Diet expert. Assess blood pressure risk. "
        "Identify 'Pressure Drivers' (High Sodium, Saturated Fats, Added Sugars) and "
        "'Pressure Buffers' (Potassium, Magnesium, Fiber, Healthy Fats). "
        "Return STRICT JSON only."
    )
    user_prompt = (
        "Assess the hypertension risk for this food observation:\n\n"
        f"{json.dumps(obs, indent=2)}\n\n"
        "Output JSON with:\n"
        "- decision: likely_ok | caution | avoid\n"
        "- sodium_load_estimate: (Low | Medium | High)\n"
        "- pressure_drivers (list of visible sodium/fat triggers)\n"
        "- pressure_buffers (list of potassium/magnesium/fiber sources)\n"
        "- reasons (linked to visual evidence like 'cured appearance' or 'fresh greens')\n"
        "- advice_short (DASH-aligned tips)\n"
        "- confidence (0–1)\n"
        "- uncertainty_notes (e.g., 'hidden salt in breading/sauce')"
    )
    return extract_json(openai_chat([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]))

# -----------------------------
# Main
# -----------------------------

def main():
    if len(sys.argv) != 2:
        print("Usage: python FoodSense_Hypertension_V1.py <image.jpg>")
        sys.exit(1)

    image_path = sys.argv[1]

    print("\nAnalyzing food image (observation only)...")
    obs = vision_step(image_path)
    print("\n=== Step 1 verified ===")
    print(json.dumps(obs, indent=2))

    hyp_result = hypertension_step(obs)

    final = {
        "food_observation": obs,
        "hypertension_risk_result": hyp_result,
        "disclaimer": (
            "Image-based guidance only. Sodium and hidden fats cannot be "
            "precisely detected. Not medical advice."
        )
    }

    print("\n=== Final result ===")
    print(json.dumps(final, indent=2))

if __name__ == "__main__":
    main()
