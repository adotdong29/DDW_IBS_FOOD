import os
import base64
import json
import requests
import tempfile
from typing import Literal, Optional

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# NEW: load environment variables from .env.local (and optionally .env)
from dotenv import load_dotenv

# Try to load from .env.local first, then fall back to default .env, etc.
load_dotenv(".env.local")
load_dotenv()

# -----------------------------
# Configuration
# -----------------------------

API_URL = "https://api.openai.com/v1/chat/completions"

# Use a vision-capable model. You can change this to another id your account supports.
VISION_MODEL = "gpt-4o"
TEXT_MODEL = "gpt-4o"  # text-only step; can be the same model

# -----------------------------
# FastAPI app + CORS
# -----------------------------

app = FastAPI()

# Allow everything during development. In production, lock this down.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Helper functions
# -----------------------------

def encode_image(image_path: str) -> str:
    """Read an image file and return a base64-encoded string."""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def get_api_key() -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY environment variable is not set.")
    return api_key


def openai_chat(messages, model: str, max_tokens: int = 500, response_format: Optional[dict] = None) -> str:
    """
    Thin wrapper around the Chat Completions API.
    Returns the raw text content from the first choice.
    """
    api_key = get_api_key()

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if response_format:
        payload["response_format"] = response_format

    resp = requests.post(API_URL, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    return content


def parse_json_from_model_output(content: str) -> dict:
    """
    Strip ```json fences if present and parse JSON.
    """
    text = (content or "").strip()
    if not text:
        raise ValueError("Model returned empty content instead of JSON.")

    # If the response starts with ``` (e.g., ```json), strip the first and last fence lines.
    if text.startswith("```"):
        lines = text.splitlines()
        # Drop the first line (``` or ```json)
        lines = lines[1:]
        # Drop the last line if it's a closing ```
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        print("Could not parse JSON. Raw model output was:\n")
        print(content)
        raise


# -----------------------------
# Step 1: Vision → dish + ingredients
# -----------------------------

def analyze_food_image(image_path: str) -> dict:
    """
    Use the vision model to extract:
      - dish_name (string)
      - ingredients (list of strings)
      - preparation (string)
    """
    base64_image = encode_image(image_path)
    data_url = f"data:image/jpeg;base64,{base64_image}"

    system_prompt = (
        "You are a food recognition assistant helping patients with digestive issues. "
        "Given a photo of a meal, identify: "
        "1) a short dish name, "
        "2) a list of main ingredients, "
        "3) how the food is prepared (e.g., fried, baked, raw, grilled). "
        "Respond ONLY with valid JSON and no extra text, with keys: "
        "dish_name (string), ingredients (list of strings), preparation (string)."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Please analyze this meal image."},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        },
    ]

    content = openai_chat(
        messages,
        model=VISION_MODEL,
        max_tokens=300,
        response_format={"type": "json_object"},
    )
    food_info = parse_json_from_model_output(content)
    return food_info


# -----------------------------
# Step 2: GI interpretation
# -----------------------------

def gi_interpretation(food_info: dict, ibs_subtype: str = "unknown") -> dict:
    """
    Given dish_name, ingredients, and preparation, ask an LLM to infer GI-relevant properties:
      - fodmap_overall: 'low' | 'medium' | 'high'
      - fodmap_breakdown: {ingredient: level}
      - fiber: 'low' | 'medium' | 'high'
      - fat: 'low' | 'medium' | 'high'
      - lactose: 'low' | 'medium' | 'high'
      - gluten: 'yes' | 'no' | 'unknown'
      - spice: 'low' | 'medium' | 'high'
      - eat_recommendation: 'yes' | 'caution' | 'no'
      - eat_label: short label like 'Generally safe', 'Use caution', 'Better to avoid'
      - advice_short: short patient-facing recommendation
      - explanation: 2–3 sentence explanation
    """
    dish_name = food_info.get("dish_name")
    ingredients = food_info.get("ingredients", [])
    preparation = food_info.get("preparation")

    system_prompt = (
        "You are a gastroenterology nutrition assistant for IBS patients. "
        "Based on standard knowledge of FODMAPs, fat content, lactose, gluten, fiber, "
        "and common IBS triggers, you will estimate GI-relevant properties for a meal. "
        "Be conservative and cautious. This is NOT medical advice or a diagnosis."
    )

    user_prompt = {
        "dish_name": dish_name,
        "ingredients": ingredients,
        "preparation": preparation,
        "ibs_subtype": ibs_subtype,  # 'IBS_C', 'IBS_D', 'IBS_M', or 'unknown'
    }

    assistant_instruction = (
        "Given this meal description, respond ONLY with valid JSON (no extra text) with keys:\n"
        "  fodmap_overall: one of 'low', 'medium', 'high'\n"
        "  fodmap_breakdown: an object mapping each ingredient to 'low', 'medium', or 'high'\n"
        "  fiber: one of 'low', 'medium', 'high'\n"
        "  fat: one of 'low', 'medium', 'high'\n"
        "  lactose: one of 'low', 'medium', 'high'\n"
        "  gluten: one of 'yes', 'no', 'unknown'\n"
        "  spice: one of 'low', 'medium', 'high'\n"
        "  eat_recommendation: one of 'yes', 'caution', or 'no', indicating whether the meal is generally acceptable for most IBS patients, should be consumed with care, or is best avoided\n"
        "  eat_label: a short label (<=40 chars), e.g. 'Generally safe', 'Use caution', 'Better to avoid'\n"
        "  advice_short: a short (<=140 chars) patient-facing recommendation, e.g. "
        "'Generally well tolerated in small portions.'\n"
        "  explanation: 2–3 sentences explaining why you gave these ratings. "
        "Do not mention that you are an AI model. Do not mention guidelines explicitly.\n"
        "Remember this is not medical advice or a diagnosis.\n"
        "Now, here is the meal description:\n"
        f"{json.dumps(user_prompt)}"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": assistant_instruction},
    ]

    content = openai_chat(
        messages,
        model=TEXT_MODEL,
        max_tokens=600,
        response_format={"type": "json_object"},
    )
    gi_info = parse_json_from_model_output(content)
    return gi_info


# -----------------------------
# API route
# -----------------------------

@app.post("/analyze")
async def analyze_meal(
    file: UploadFile = File(...),
    ibs_subtype: Optional[Literal["IBS_C", "IBS_D", "IBS_M", "unknown"]] = Form("unknown"),
):
    """
    Accepts an image + IBS subtype, returns combined food + GI interpretation.
    """
    try:
        suffix = os.path.splitext(file.filename or "")[1] or ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        food_info = analyze_food_image(tmp_path)
        gi_info = gi_interpretation(food_info, ibs_subtype=ibs_subtype or "unknown")

        combined = {
            "food": food_info,
            "gi_interpretation": gi_info,
        }

        try:
            os.remove(tmp_path)
        except OSError:
            pass

        return JSONResponse(content=combined)

    except Exception as e:
        print("Error in /analyze:", e)
        return JSONResponse(status_code=500, content={"error": str(e)})
