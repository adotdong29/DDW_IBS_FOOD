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
MODEL = "gpt-4o"  # Ensure you are using a valid model ID like gpt-4o or gpt-4-turbo

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
        "Do NOT guess ingredients or nutritional values yet. Return STRICT JSON only."
    )
    user_prompt = [
        {"type": "text", "text": (
            "From this image, identify:\n"
            "- dish_name\n"
            "- observed_food_components\n"
            "- possible_food_components\n"
            "- visual_cues\n"
            "- estimated_portion_size\n"
            "- overall_confidence (0-1)"
        )},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}
    ]
    return extract_json(openai_chat([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]))

# -----------------------------
# Step 2: Diabetes Impact Assessment (Updated)
# -----------------------------

def diabetes_step(obs):
    # UPDATED SYSTEM PROMPT:
    # Explicitly distinguishes between "good buffers" (healthy fats/fiber) 
    # and "risk factors" (saturated fats/processed meats).
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
        "Assess the diabetes and metabolic risk for this food observation:\n\n"
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
        "- confidence (0–1)\n"
        "- uncertainty_notes"
    )
    return extract_json(openai_chat([{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]))

# -----------------------------
# Main
# -----------------------------

def main():
    if len(sys.argv) != 2:
        print("Usage: python FoodSense_Diabetes_V8.py <image.jpg>")
        sys.exit(1)

    image_path = sys.argv[1]

    print("\nAnalyzing food image (observation only)...")
    obs = vision_step(image_path)
    print("\n=== Step 1 verified ===")
    print(json.dumps(obs, indent=2))

    diabetes_result = diabetes_step(obs)

    final = {
        "food_observation": obs,
        "diabetes_risk_result": diabetes_result,
        "disclaimer": (
            "Image-based guidance only. Ingredients added off-camera "
            "cannot be detected. Not medical advice."
        )
    }

    print("\n=== Final result ===")
    print(json.dumps(final, indent=2))

if __name__ == "__main__":
    main()