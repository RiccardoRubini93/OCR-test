import os
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.responses import JSONResponse
from utils import image_to_base64, ollama_generate, ollama_embedding, ollama_list_models
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

@app.post("/ocr/")
async def ocr_image(file: UploadFile = File(...), provider: str = None, model: str = None):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    try:
        img_base64 = image_to_base64(file.file)
        use_provider = provider or DEFAULT_PROVIDER
        if use_provider == "ollama":
            ollama_model = model or OLLAMA_MODEL
            prompt = "Extract all text from this image. (Base64 PNG):\n" + img_base64
            text = ollama_generate(prompt, model=ollama_model)
            embedding = ollama_embedding(text, model=ollama_model)
        else:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract all text from this image."},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{img_base64}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=1024,
            )
            text = response.choices[0].message.content
            emb_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            embedding = emb_response.data[0].embedding
        # Save to DB
        async with SessionLocal() as session:
            db_obj = HandwrittenText(filename=file.filename, text=text, embedding=embedding)
            session.add(db_obj)
            await session.commit()
        return {"text": text, "provider": use_provider}
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