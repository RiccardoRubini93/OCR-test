import base64
from io import BytesIO
from PIL import Image, ImageOps, ImageFilter
import os
import requests

# Initial base from env; will be validated and possibly overridden
_ENV_OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
_RESOLVED_OLLAMA_URL = None


def _probe_ollama_base(base_url: str) -> bool:
    try:
        resp = requests.get(f"{base_url}/api/tags", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False


def _get_ollama_base_url() -> str:
    global _RESOLVED_OLLAMA_URL
    if _RESOLVED_OLLAMA_URL:
        return _RESOLVED_OLLAMA_URL
    candidates = [
        _ENV_OLLAMA_URL,
        "http://ollama:11434",
        "http://localhost:11434",
        "http://host.docker.internal:11434",
    ]
    seen = set()
    ordered = [c for c in candidates if not (c in seen or seen.add(c))]
    for base in ordered:
        if _probe_ollama_base(base):
            _RESOLVED_OLLAMA_URL = base
            break
    if not _RESOLVED_OLLAMA_URL:
        # Fall back to env even if probe fails; requests will raise clearer error
        _RESOLVED_OLLAMA_URL = _ENV_OLLAMA_URL
    return _RESOLVED_OLLAMA_URL


def image_to_base64(image_file) -> str:
    """
    Convert an image file to a base64-encoded string.
    """
    image = Image.open(image_file)
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return img_str


def pil_image_to_base64_png(image: Image.Image) -> str:
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


def preprocess_image_for_ocr(image: Image.Image) -> Image.Image:
    """
    Light preprocessing to improve OCR performance:
    - Convert to grayscale
    - Auto-contrast
    - Slight sharpen
    """
    img = image.convert("L")
    img = ImageOps.autocontrast(img)
    img = img.filter(ImageFilter.SHARPEN)
    return img


def ollama_generate(prompt, model="llama3"):
    base = _get_ollama_base_url()
    url = f"{base}/api/generate"
    payload = {"model": model, "prompt": prompt, "stream": False}
    response = requests.post(url, json=payload)
    if response.status_code == 404:
        # Likely model not found; try to pull and retry once
        _ollama_pull_model(model)
        response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json().get("response", "")


def ollama_embedding(text, model="llama3"):
    base = _get_ollama_base_url()
    url = f"{base}/api/embeddings"
    payload = {"model": model, "prompt": text}
    response = requests.post(url, json=payload)
    if response.status_code == 404:
        _ollama_pull_model(model)
        response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json().get("embedding", [])


def ollama_list_models():
    base = _get_ollama_base_url()
    url = f"{base}/api/tags"
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()
    return [m["name"] for m in data.get("models", [])]


def ollama_list_running_models():
    """Return model names that currently have running instances."""
    base = _get_ollama_base_url()
    url = f"{base}/api/ps"
    response = requests.get(url)
    response.raise_for_status()
    data = response.json() or {}
    running = []
    for item in data.get("models", []):
        name = item.get("model") or item.get("name")
        if name:
            running.append(name)
    # Deduplicate while preserving order
    seen = set()
    result = []
    for n in running:
        if n not in seen:
            seen.add(n)
            result.append(n)
    return result


def _ollama_pull_model(model: str):
    """Attempt to pull a model; ignore errors so caller can handle."""
    try:
        base = _get_ollama_base_url()
        url = f"{base}/api/pull"
        requests.post(url, json={"name": model, "stream": False}, timeout=600)
    except Exception:
        pass 