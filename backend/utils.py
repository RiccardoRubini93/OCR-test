import base64
from io import BytesIO
from PIL import Image
import os
import requests

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")


def image_to_base64(image_file) -> str:
    """
    Convert an image file to a base64-encoded string.
    """
    image = Image.open(image_file)
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return img_str


def ollama_generate(prompt, model="llama3"):
    url = f"{OLLAMA_URL}/api/generate"
    response = requests.post(url, json={"model": model, "prompt": prompt, "stream": False})
    response.raise_for_status()
    return response.json()["response"]


def ollama_embedding(text, model="llama3"):
    url = f"{OLLAMA_URL}/api/embeddings"
    response = requests.post(url, json={"model": model, "prompt": text})
    response.raise_for_status()
    return response.json()["embedding"]


def ollama_list_models():
    url = f"{OLLAMA_URL}/api/tags"
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()
    return [m["name"] for m in data.get("models", [])] 