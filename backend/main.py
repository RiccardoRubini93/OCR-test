import os
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.responses import JSONResponse
# Removed early utils import so .env loads first
from openai import OpenAI
from dotenv import load_dotenv
import traceback
from fastapi.middleware.cors import CORSMiddleware
from db import SessionLocal, engine
from models import HandwrittenText, Base, Project
from sqlalchemy.future import select
import asyncio
from sqlalchemy import select, or_, func as sa_func, text as sa_text
import numpy as np
from pydantic import BaseModel
from PIL import Image
import pytesseract
import requests

# Load environment variables from .env if present
load_dotenv()

# Now import utils so it sees env like OLLAMA_URL
from utils import image_to_base64, ollama_generate, ollama_embedding, ollama_list_models, preprocess_image_for_ocr, pil_image_to_base64_png
from utils import ollama_list_running_models

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY environment variable not set.")

# Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

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
        # Ensure the project_id column exists even if table already created previously
        await conn.execute(sa_text(
            "ALTER TABLE handwritten_texts ADD COLUMN IF NOT EXISTS project_id integer REFERENCES projects(id)"
        ))
        await conn.execute(sa_text(
            "CREATE INDEX IF NOT EXISTS idx_handwritten_texts_project_id ON handwritten_texts(project_id)"
        ))

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


def _gemini_generate(parts: list[dict], model: str | None = None) -> str:
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set")
    model_name = model or GEMINI_MODEL
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": GEMINI_API_KEY,
    }
    payload = {"contents": [{"parts": parts}]}
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {resp.status_code} {resp.text}")
    data = resp.json()
    # Extract text from candidates
    text_chunks: list[str] = []
    try:
        for cand in data.get("candidates", []) or []:
            content = cand.get("content") or {}
            for p in content.get("parts", []) or []:
                t = p.get("text")
                if t:
                    text_chunks.append(t)
    except Exception:
        pass
    return "\n".join(text_chunks).strip()


async def perform_gemini_ocr(img_b64: str, model: str | None = None) -> str:
    parts = [
        {"text": "Extract all text from this image. Do not refuse. If no text is present, return an empty string."},
        {"inlineData": {"mimeType": "image/png", "data": img_b64}},
    ]
    # Run blocking HTTP call in a thread to avoid blocking event loop
    return await asyncio.to_thread(_gemini_generate, parts, model)


async def perform_gemini_text(prompt: str, model: str | None = None) -> str:
    parts = [{"text": prompt}]
    return await asyncio.to_thread(_gemini_generate, parts, model)


# Project endpoints
class CreateProjectRequest(BaseModel):
    name: str
    description: str | None = None

@app.post("/projects/")
async def create_project(body: CreateProjectRequest):
    async with SessionLocal() as session:
        # check unique name
        existing = await session.execute(select(Project).where(Project.name == body.name))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Project with this name already exists")
        proj = Project(name=body.name, description=body.description)
        session.add(proj)
        await session.commit()
        await session.refresh(proj)
        return {"id": proj.id, "name": proj.name, "description": proj.description, "created_at": proj.created_at.isoformat()}

@app.get("/projects/")
async def list_projects():
    async with SessionLocal() as session:
        result = await session.execute(select(Project).order_by(Project.created_at.desc()))
        items = result.scalars().all()
        return [
            {"id": p.id, "name": p.name, "description": p.description, "created_at": p.created_at.isoformat()} for p in items
        ]

@app.get("/projects/{project_id}")
async def get_project(project_id: int):
    async with SessionLocal() as session:
        result = await session.execute(select(Project).where(Project.id == project_id))
        proj = result.scalar_one_or_none()
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        return {"id": proj.id, "name": proj.name, "description": proj.description, "created_at": proj.created_at.isoformat()}


@app.post("/ocr/")
async def ocr_image(file: UploadFile = File(...), provider: str = None, model: str = None, project_id: int | None = None):
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
        elif use_provider == "gemini":
            gemini_model = model or GEMINI_MODEL
            text = await perform_gemini_ocr(img_base64, model=gemini_model)
            if is_refusal(text):
                processed = preprocess_image_for_ocr(original_image)
                processed_b64 = pil_image_to_base64_png(processed)
                text_retry = await perform_gemini_ocr(processed_b64, model=gemini_model)
                if is_refusal(text_retry):
                    # Tesseract fallback
                    extracted_text = pytesseract.image_to_string(processed)
                    final_provider_used = "tesseract"
                else:
                    extracted_text = text_retry
                    final_provider_used = f"gemini:{gemini_model}+preprocess"
            else:
                extracted_text = text
                final_provider_used = f"gemini:{gemini_model}"
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
            db_obj = HandwrittenText(filename=file.filename, text=extracted_text, embedding=embedding, project_id=project_id)
            session.add(db_obj)
            await session.commit()

        return {"text": extracted_text, "provider": final_provider_used, "project_id": project_id}
    except Exception as e:
        print("Exception in /ocr/:", e)
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/texts/")
async def get_texts(project_id: int | None = None):
    async with SessionLocal() as session:
        stmt = select(HandwrittenText).order_by(HandwrittenText.created_at.desc())
        if project_id is not None:
            stmt = stmt.where(HandwrittenText.project_id == project_id)
        result = await session.execute(stmt)
        items = result.scalars().all()
        return [
            {"id": i.id, "filename": i.filename, "text": i.text, "created_at": i.created_at.isoformat(), "project_id": i.project_id} for i in items
        ]

@app.get("/texts/search")
async def search_texts(q: str = Query(..., min_length=1), project_id: int | None = None):
    async with SessionLocal() as session:
        stmt = select(HandwrittenText).where(HandwrittenText.text.ilike(f"%{q}%")).order_by(HandwrittenText.created_at.desc())
        if project_id is not None:
            stmt = stmt.where(HandwrittenText.project_id == project_id)
        result = await session.execute(stmt)
        items = result.scalars().all()
        return [
            {"id": i.id, "filename": i.filename, "text": i.text, "created_at": i.created_at.isoformat(), "project_id": i.project_id} for i in items
        ]

class SimilarityQuery(BaseModel):
    query: str
    project_id: int | None = None

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
        stmt = select(HandwrittenText)
        if body.project_id is not None:
            stmt = stmt.where(HandwrittenText.project_id == body.project_id)
        result = await session.execute(stmt)
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
            {"id": i.id, "filename": i.filename, "text": i.text, "created_at": i.created_at.isoformat(), "score": sim, "project_id": i.project_id}
            for sim, i in scored[:10]
        ]
        return top 

@app.get("/stats")
async def get_stats(project_id: int | None = None):
    async with SessionLocal() as session:
        if project_id is None:
            count = await session.scalar(select(sa_func.count(HandwrittenText.id)))
            min_date = await session.scalar(select(sa_func.min(HandwrittenText.created_at)))
            max_date = await session.scalar(select(sa_func.max(HandwrittenText.created_at)))
            avg_len = await session.scalar(select(sa_func.avg(sa_func.length(HandwrittenText.text))))
        else:
            count = await session.scalar(
                select(sa_func.count(HandwrittenText.id)).where(HandwrittenText.project_id == project_id)
            )
            min_date = await session.scalar(
                select(sa_func.min(HandwrittenText.created_at)).where(HandwrittenText.project_id == project_id)
            )
            max_date = await session.scalar(
                select(sa_func.max(HandwrittenText.created_at)).where(HandwrittenText.project_id == project_id)
            )
            avg_len = await session.scalar(
                select(sa_func.avg(sa_func.length(HandwrittenText.text))).where(HandwrittenText.project_id == project_id)
            )
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

@app.get("/ollama/models/running")
def get_ollama_running_models():
    try:
        models = ollama_list_running_models()
        return {"models": models}
    except Exception as e:
        return {"error": str(e)}

class SummarizeRequest(BaseModel):
    text_id: int | None = None
    text: str | None = None
    provider: str | None = None
    model: str | None = None
    summary_length: str | None = None  # 'short' | 'medium' | 'long'
    format: str | None = None          # 'bullets' | 'plain'
    instructions: str | None = None    # optional extra guidance
    project_id: int | None = None      # optional project scope
    summarize_all: bool | None = None  # if true, summarize all texts (optionally in project)


@app.post("/texts/summarize")
async def summarize_text(body: SummarizeRequest):
    use_provider = body.provider or DEFAULT_PROVIDER
    text_to_summarize = body.text

    # Defaults
    length = (body.summary_length or "medium").lower()
    if length not in {"short", "medium", "long"}:
        length = "medium"
    out_format = (body.format or "bullets").lower()
    if out_format not in {"bullets", "plain"}:
        out_format = "bullets"
    extra = (body.instructions or "").strip()

    if text_to_summarize is None:
        if body.summarize_all:
            # Concatenate all texts, optionally filtered by project
            async with SessionLocal() as session:
                stmt = select(HandwrittenText.text).order_by(HandwrittenText.created_at.asc())
                if body.project_id is not None:
                    stmt = stmt.where(HandwrittenText.project_id == body.project_id)
                result = await session.execute(stmt)
                texts = [row[0] for row in result.fetchall() if row and row[0]]
                if not texts:
                    raise HTTPException(status_code=404, detail="No texts found to summarize")
                # Naive concatenation; consider chunking for very large corpora
                text_to_summarize = "\n\n".join(texts)
        elif body.text_id is None:
            raise HTTPException(status_code=400, detail="Provide text_id, text, or set summarize_all=true")
        else:
            async with SessionLocal() as session:
                result = await session.execute(select(HandwrittenText).where(HandwrittenText.id == body.text_id))
                item = result.scalar_one_or_none()
                if not item:
                    raise HTTPException(status_code=404, detail="Text not found")
                text_to_summarize = item.text

    # Construct prompt according to parameters
    length_clause = {
        "short": "Keep it very brief: 2-3 sentences OR 3 bullet points maximum.",
        "medium": "Keep it concise: ~4-6 sentences OR 3-5 bullet points.",
        "long": "Provide a detailed summary: 1-2 paragraphs OR 5-8 bullet points.",
    }[length]
    format_clause = "Return the summary as a bullet point list." if out_format == "bullets" else "Return the summary as plain prose text (no bullets)."
    extra_clause = f" Additional guidance: {extra}" if extra else ""
    prompt_header = (
        "Summarize the following text. "
        f"{length_clause} {format_clause}{extra_clause}\n\nTEXT:\n"
    )

    try:
        if use_provider == "ollama":
            ollama_model = body.model or OLLAMA_MODEL
            prompt = prompt_header + text_to_summarize
            summary = ollama_generate(prompt, model=ollama_model)
            provider_used = f"ollama:{ollama_model}"
        elif use_provider == "gemini":
            gemini_model = body.model or GEMINI_MODEL
            prompt = prompt_header + text_to_summarize
            summary = await perform_gemini_text(prompt, model=gemini_model)
            provider_used = f"gemini:{gemini_model}"
        else:
            # Adapt max tokens according to requested length
            max_tokens = {"short": 250, "medium": 400, "long": 800}[length]
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": prompt_header + text_to_summarize,
                    }
                ],
                max_tokens=max_tokens,
            )
            summary = response.choices[0].message.content
            provider_used = "openai:gpt-4o"
        return {"summary": summary, "provider": provider_used, "length": length, "format": out_format}
    except Exception as e:
        print("Exception in /texts/summarize:", e)
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)}) 

@app.get("/db/schemas")
async def list_db_schemas():
    try:
        async with SessionLocal() as session:
            result = await session.execute(sa_text(
                "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name"
            ))
            rows = result.fetchall()
            return {"schemas": [row[0] for row in rows]}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/db/tables")
async def list_db_tables(schema: str | None = None):
    try:
        async with SessionLocal() as session:
            if schema:
                query = sa_text(
                    """
                    SELECT table_schema, table_name
                    FROM information_schema.tables
                    WHERE table_type = 'BASE TABLE' AND table_schema = :schema
                    ORDER BY table_schema, table_name
                    """
                )
                result = await session.execute(query, {"schema": schema})
            else:
                query = sa_text(
                    """
                    SELECT table_schema, table_name
                    FROM information_schema.tables
                    WHERE table_type = 'BASE TABLE'
                    AND table_schema NOT IN ('pg_catalog','information_schema')
                    ORDER BY table_schema, table_name
                    """
                )
                result = await session.execute(query)
            rows = result.fetchall()
            tables = [{"schema": r[0], "table": r[1]} for r in rows]
            return {"tables": tables}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)}) 

@app.get("/analytics/project_counts")
async def analytics_project_counts():
    try:
        async with SessionLocal() as session:
            query = sa_text(
                """
                SELECT p.id, p.name, COALESCE(COUNT(ht.id), 0) AS num_texts
                FROM projects p
                LEFT JOIN handwritten_texts ht ON ht.project_id = p.id
                GROUP BY p.id, p.name
                ORDER BY num_texts DESC, p.name ASC
                """
            )
            result = await session.execute(query)
            rows = result.fetchall()
            return {"projects": [{"id": r[0], "name": r[1], "count": int(r[2])} for r in rows]}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/analytics/activity")
async def analytics_activity(project_id: int | None = None, interval: str = "day", points: int = 30):
    try:
        interval = interval if interval in {"hour", "day", "week", "month"} else "day"
        points = max(1, min(points, 365))
        async with SessionLocal() as session:
            if project_id is None:
                query = sa_text(
                    f"""
                    SELECT date_trunc(:interval, created_at) AS bucket, COUNT(*)
                    FROM handwritten_texts
                    GROUP BY bucket
                    ORDER BY bucket DESC
                    LIMIT :points
                    """
                )
                result = await session.execute(query, {"interval": interval, "points": points})
            else:
                query = sa_text(
                    f"""
                    SELECT date_trunc(:interval, created_at) AS bucket, COUNT(*)
                    FROM handwritten_texts
                    WHERE project_id = :pid
                    GROUP BY bucket
                    ORDER BY bucket DESC
                    LIMIT :points
                    """
                )
                result = await session.execute(query, {"interval": interval, "points": points, "pid": project_id})
            rows = result.fetchall()
            data = [{"bucket": r[0].isoformat(), "count": int(r[1])} for r in reversed(rows)]
            return {"series": data, "interval": interval}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/analytics/length_histogram")
async def analytics_length_histogram(project_id: int | None = None, bins: int = 10):
    try:
        bins = max(2, min(bins, 50))
        async with SessionLocal() as session:
            if project_id is None:
                query = sa_text(
                    """
                    WITH stats AS (
                      SELECT MIN(LENGTH(text)) AS minlen, MAX(LENGTH(text)) AS maxlen FROM handwritten_texts
                    )
                    SELECT width_bucket(LENGTH(ht.text), stats.minlen, stats.maxlen + 1, :bins) AS bucket,
                           COUNT(*) AS c,
                           stats.minlen AS minlen,
                           stats.maxlen AS maxlen
                    FROM handwritten_texts ht, stats
                    GROUP BY bucket, stats.minlen, stats.maxlen
                    ORDER BY bucket
                    """
                )
                result = await session.execute(query, {"bins": bins})
            else:
                query = sa_text(
                    """
                    WITH filtered AS (
                      SELECT text FROM handwritten_texts WHERE project_id = :pid
                    ), stats AS (
                      SELECT MIN(LENGTH(text)) AS minlen, MAX(LENGTH(text)) AS maxlen FROM filtered
                    )
                    SELECT width_bucket(LENGTH(f.text), stats.minlen, stats.maxlen + 1, :bins) AS bucket,
                           COUNT(*) AS c,
                           stats.minlen AS minlen,
                           stats.maxlen AS maxlen
                    FROM filtered f, stats
                    GROUP BY bucket, stats.minlen, stats.maxlen
                    ORDER BY bucket
                    """
                )
                result = await session.execute(query, {"bins": bins, "pid": project_id})
            rows = result.fetchall()
            if not rows:
                return {"bins": [], "min": 0, "max": 0}
            minlen = int(rows[0][2])
            maxlen = int(rows[0][3])
            series = [{"bucket": int(r[0]), "count": int(r[1])} for r in rows]
            return {"bins": series, "min": minlen, "max": maxlen}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/analytics/top_filenames")
async def analytics_top_filenames(project_id: int | None = None, limit: int = 10):
    try:
        limit = max(1, min(limit, 100))
        async with SessionLocal() as session:
            if project_id is None:
                query = sa_text(
                    """
                    SELECT COALESCE(filename, '(none)') AS name, COUNT(*) AS c
                    FROM handwritten_texts
                    GROUP BY name
                    ORDER BY c DESC, name ASC
                    LIMIT :limit
                    """
                )
                result = await session.execute(query, {"limit": limit})
            else:
                query = sa_text(
                    """
                    SELECT COALESCE(filename, '(none)') AS name, COUNT(*) AS c
                    FROM handwritten_texts
                    WHERE project_id = :pid
                    GROUP BY name
                    ORDER BY c DESC, name ASC
                    LIMIT :limit
                    """
                )
                result = await session.execute(query, {"limit": limit, "pid": project_id})
            rows = result.fetchall()
            return {"top": [{"name": r[0], "count": int(r[1])} for r in rows]}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/db/columns")
async def list_columns(schema: str = "public", table: str = "handwritten_texts"):
    try:
        async with SessionLocal() as session:
            query = sa_text(
                """
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = :schema AND table_name = :table
                ORDER BY ordinal_position
                """
            )
            result = await session.execute(query, {"schema": schema, "table": table})
            rows = result.fetchall()
            cols = [
                {"name": r[0], "type": r[1], "nullable": (r[2] == "YES")}
                for r in rows
            ]
            return {"columns": cols}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)}) 