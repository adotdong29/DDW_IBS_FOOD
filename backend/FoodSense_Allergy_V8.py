#!/usr/bin/env python3
"""
FoodSense_Allergy_V7.py

Minimal food allergy guidance tool.
STRUCTURE IDENTICAL to FoodSense_IBS_V8.py.
"""

import argparse
import base64
import json
import os
from openai import OpenAI


# -----------------------------
# OpenAI call (DO NOT TOUCH)
# -----------------------------
def openai_chat(client, messages):
    resp = client.responses.create(
        model="gpt-5.2",
        input=messages
    )
    return resp.output_text


# -----------------------------
# Vision step (observation only)
# -----------------------------
def vision_step(client, image_path):
    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("utf-8")

    messages = [
        {
            "role": "system",
            "content": (
                "You are a careful food image observer.\n"
                "Only describe what is directly visible.\n"
                "Do NOT guess ingredients.\n"
                "Return STRICT JSON only."
            )
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": (
                        "From this image, identify:\n"
                        "- dish_name\n"
                        "- observed_food_components\n"
                        "- possible_food_components\n"
                        "- non_food_objects\n"
                        "- visual_cues\n"
                        "- overall_confidence (0–1)\n\n"
                        "Return JSON only."
                    )
                },
                {
                    "type": "input_image",
                    "image_url": f"data:image/jpeg;base64,{image_b64}"
                }
            ]
        }
    ]

    raw = openai_chat(client, messages)
    return json.loads(raw)


# -----------------------------
# Allergy reasoning step
# -----------------------------
def allergy_step(client, observation):
    messages = [
	{
    	    "role": "system",
    	    "content": (
        		"You provide practical, user-facing food allergy guidance.\n"
        		"Use common-sense thresholds:\n"
        		"- Fresh fruits and vegetables with no visible allergens → likely_ok\n"
        		"- Clearly visible major allergens (e.g., nuts, wheat, dairy) → avoid\n"
        		"- Mixed, processed, or unclear dishes → caution\n\n"
        		"Do NOT escalate to caution solely because a food *can* cause allergy.\n"
        		"Only escalate when there is realistic risk for the general population.\n"
        		"Return STRICT JSON only."
    		)
	},
        {
            "role": "user",
            "content": (
                "Given this food observation:\n\n"
                f"{json.dumps(observation, indent=2)}\n\n"
                "Assess allergy risk.\n"
                "Return JSON with:\n"
                "- decision: likely_ok | caution | avoid\n"
                "- suspected_allergens\n"
                "- possible_hidden_allergens\n"
                "- cross_contamination_risks\n"
                "- reasons\n"
                "- advice_short\n"
                "- confidence (0–1)\n\n"
                "Return JSON only."
            )
        }
    ]

    raw = openai_chat(client, messages)
    return json.loads(raw)


# -----------------------------
# Main
# -----------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image_path")
    args = parser.parse_args()

    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY not set")

    client = OpenAI()

    print("\nAnalyzing food image (observation only)...\n")

    obs = vision_step(client, args.image_path)
    print("=== Step 1 verified ===")
    print(json.dumps(obs, indent=2))

    allergy = allergy_step(client, obs)

    final = {
        "food_observation": obs,
        "allergy_risk_result": allergy,
        "disclaimer": (
            "Image-based guidance only. Ingredients added off-camera "
            "cannot be detected. Not medical advice."
        )
    }

    print("\n=== Final result ===")
    print(json.dumps(final, indent=2))


if __name__ == "__main__":
    main()

