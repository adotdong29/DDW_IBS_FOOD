#!/usr/bin/env python3
import os
import sys
import json
import base64
import requests

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


def openai_chat(messages, max_completion_tokens=800):
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
        raise RuntimeError(r.text)
    return r.json()["choices"][0]["message"]["content"]


def extract_json(text):
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

def vision_step(image_path):
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

def verify_observation(obs):
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

def ibs_risk_step(obs):
    system_prompt = (
        "You are providing IBS-oriented food risk guidance.\n"
        "Base your reasoning ONLY on visible components and visual cues.\n"
        "Do NOT cite medical facts or guarantees.\n"
        "Avoid deterministic rules.\n"
        "Acknowledge individual variability.\n"
        "Return ONLY valid JSON."
    )

    user_prompt = (
        "Given this food observation, assess IBS-related risk.\n\n"
        "Output JSON with:\n"
        "- decision: likely_ok | caution | avoid\n"
        "- risk_factors (list of visible triggers)\n"
        "- reasons (linked to visible evidence)\n"
        "- ibs_c_note (constipation-predominant)\n"
        "- ibs_d_note (diarrhea-predominant)\n"
        "- ibs_m_note (mixed pattern)\n"
        "- ibs_u_note (unclassified)\n"
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
# Main
# -----------------------------

def main():
    if len(sys.argv) != 2:
        print("Usage: python food_vision_demo.V8.py <image.jpg>")
        sys.exit(1)

    image_path = sys.argv[1]

    print("\nAnalyzing food image (observation only)...")

    raw_obs = vision_step(image_path)
    print("\n=== Step 1 raw ===")
    print(json.dumps(raw_obs, indent=2))

    verified_obs = verify_observation(raw_obs)
    print("\n=== Step 1 verified ===")
    print(json.dumps(verified_obs, indent=2))

    ibs_result = ibs_risk_step(verified_obs)

    final = {
        "food_observation": verified_obs,
        "ibs_risk_result": ibs_result,
    }

    print("\n=== Final result ===")
    print(json.dumps(final, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
