import os
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.responses import JSONResponse
from utils import image_to_base64, ollama_generate, ollama_embedding, ollama_list_models, preprocess_image_for_ocr, pil_image_to_base64_png
from openai import OpenAI
from dotenv import load_dotenv
import traceback
from fastapi.middleware.cors import CORSMiddleware
from db import SessionLocal, engine
from models import HandwrittenText, Base
from sqlalchemy.future import select
import asyncio
from sqlalchemy import select, or_, func as sa_func, text as sa_text
import numpy as np
from pydantic import BaseModel
from PIL import Image
import pytesseract

# Load environment variables from .env if present
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY environment variable not set.")

client = OpenAI(api_key=OPENAI_API_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables if they don't exist
@app.on_event("startup")
async def on_startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

DEFAULT_PROVIDER = os.getenv("LLM_PROVIDER", "openai")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")


def is_refusal(text: str) -> bool:
    if not text:
        return True
    lowered = text.strip().lower()
    refusal_markers = [
        "i'm sorry, i can't",
        "i am sorry, i can't",
        "cannot extract text from this image",
        "can't extract text",
        "unable to extract text",
        "as an ai",
    ]
    return any(marker in lowered for marker in refusal_markers)


async def perform_openai_ocr(img_b64: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extract all text from this image. Do not refuse. If no text is present, return an empty string."},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{img_b64}"
                        }
                    }
                ]
            }
        ],
        max_tokens=1024,
    )
    return response.choices[0].message.content or ""


@app.post("/ocr/")
async def ocr_image(file: UploadFile = File(...), provider: str = None, model: str = None):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    try:
        # Load original image
        original_image = Image.open(file.file)
        img_base64 = pil_image_to_base64_png(original_image)

        use_provider = provider or DEFAULT_PROVIDER
        extracted_text = None
        final_provider_used = None

        if use_provider == "ollama":
            ollama_model = model or OLLAMA_MODEL
            prompt = "Extract all text from this image (Base64 PNG). Return only the transcribed text, no explanations.\n" + img_base64
            text = ollama_generate(prompt, model=ollama_model)
            if is_refusal(text):
                # Retry with stronger instruction
                retry_prompt = (
                    "You must transcribe any readable text from this image (Base64 PNG). "
                    "If no text is present, return an empty string. Return only the text.\n" + img_base64
                )
                text = ollama_generate(retry_prompt, model=ollama_model)
            if is_refusal(text):
                # Preprocess and retry via OpenAI if available, else fall back to tesseract
                processed = preprocess_image_for_ocr(original_image)
                processed_b64 = pil_image_to_base64_png(processed)
                text_openai = await perform_openai_ocr(processed_b64)
                if not is_refusal(text_openai):
                    extracted_text = text_openai
                    final_provider_used = "openai+preprocess"
                else:
                    # Tesseract fallback
                    extracted_text = pytesseract.image_to_string(processed)
                    final_provider_used = "tesseract"
            else:
                extracted_text = text
                final_provider_used = "ollama"
        else:
            # OpenAI primary
            text = await perform_openai_ocr(img_base64)
            if is_refusal(text):
                # Preprocess and retry
                processed = preprocess_image_for_ocr(original_image)
                processed_b64 = pil_image_to_base64_png(processed)
                text_retry = await perform_openai_ocr(processed_b64)
                if is_refusal(text_retry):
                    # Tesseract fallback
                    extracted_text = pytesseract.image_to_string(processed)
                    final_provider_used = "tesseract"
                else:
                    extracted_text = text_retry
                    final_provider_used = "openai+preprocess"
            else:
                extracted_text = text
                final_provider_used = "openai"

        # Ensure we have a string (avoid None)
        if extracted_text is None:
            extracted_text = ""

        # Generate embedding (skip if completely empty)
        if final_provider_used.startswith("ollama"):
            emb_model = model or OLLAMA_MODEL
            embedding = ollama_embedding(extracted_text, model=emb_model) if extracted_text.strip() else None
        else:
            emb_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=extracted_text or " "
            )
            embedding = emb_response.data[0].embedding if extracted_text.strip() else None

        # Save to DB
        async with SessionLocal() as session:
            db_obj = HandwrittenText(filename=file.filename, text=extracted_text, embedding=embedding)
            session.add(db_obj)
            await session.commit()

        return {"text": extracted_text, "provider": final_provider_used}
    except Exception as e:
        print("Exception in /ocr/:", e)
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/texts/")
async def get_texts():
    async with SessionLocal() as session:
        result = await session.execute(select(HandwrittenText).order_by(HandwrittenText.created_at.desc()))
        items = result.scalars().all()
        return [
            {"id": i.id, "filename": i.filename, "text": i.text, "created_at": i.created_at.isoformat()} for i in items
        ]

@app.get("/texts/search")
async def search_texts(q: str = Query(..., min_length=1)):
    async with SessionLocal() as session:
        result = await session.execute(
            select(HandwrittenText).where(HandwrittenText.text.ilike(f"%{q}%")).order_by(HandwrittenText.created_at.desc())
        )
        items = result.scalars().all()
        return [
            {"id": i.id, "filename": i.filename, "text": i.text, "created_at": i.created_at.isoformat()} for i in items
        ]

class SimilarityQuery(BaseModel):
    query: str

@app.post("/texts/similarity")
async def similarity_search(body: SimilarityQuery):
    query = body.query
    # Generate embedding for query
    emb_response = client.embeddings.create(
        model="text-embedding-3-small",
        input=query
    )
    query_emb = np.array(emb_response.data[0].embedding)
    # Fetch all embeddings from DB
    async with SessionLocal() as session:
        result = await session.execute(select(HandwrittenText))
        items = result.scalars().all()
        scored = []
        for i in items:
            if i.embedding and len(i.embedding) == len(query_emb):
                emb = np.array(i.embedding)
                sim = float(np.dot(query_emb, emb) / (np.linalg.norm(query_emb) * np.linalg.norm(emb)))
                scored.append((sim, i))
            else:
                # Skip or log mismatched embedding sizes
                continue
        scored.sort(reverse=True, key=lambda x: x[0])
        top = [
            {"id": i.id, "filename": i.filename, "text": i.text, "created_at": i.created_at.isoformat(), "score": sim}
            for sim, i in scored[:10]
        ]
        return top 

@app.get("/stats")
async def get_stats():
    async with SessionLocal() as session:
        count = await session.scalar(sa_func.count(HandwrittenText.id))
        min_date = await session.scalar(sa_func.min(HandwrittenText.created_at))
        max_date = await session.scalar(sa_func.max(HandwrittenText.created_at))
        avg_len = await session.scalar(sa_func.avg(sa_func.length(HandwrittenText.text)))
        return {
            "count": count,
            "earliest": min_date.isoformat() if min_date else None,
            "latest": max_date.isoformat() if max_date else None,
            "avg_text_length": avg_len
        }

from pydantic import BaseModel
class RawQueryRequest(BaseModel):
    query: str

@app.post("/texts/raw_query")
async def run_raw_query(body: RawQueryRequest):
    query = body.query.strip()
    async with SessionLocal() as session:
        result = await session.execute(sa_text(query))
        # If the query is a SELECT, return rows and columns
        if query.lower().startswith("select"):
            rows = result.fetchall()
            columns = list(result.keys())
            return {
                "columns": columns,
                "rows": [list(row) for row in rows]
            }
        else:
            await session.commit()
            return {"message": f"Query executed. {result.rowcount} row(s) affected."} 

@app.get("/ollama/models")
def get_ollama_models():
    try:
        models = ollama_list_models()
        return {"models": models}
    except Exception as e:
        return {"error": str(e)} 