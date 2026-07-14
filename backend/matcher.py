"""
Artist-Gallery Matching Backend

Pipeline per profile:
  1. Fetch structured data from Supabase (answers + image URLs)
  2. Gemma 3 synthesizes a brief unified description from the structured fields
  3. BAAI/bge-large-en-v1.5  →  1024-d text embedding
  4. OpenCLIP ViT-B-32        →  512-d image embedding (mean of all images)
  5. Both vectors stored in Supabase via pgvector

Compatibility:
  cosine_similarity(gallery_text, artist_text)  × 0.60
  cosine_similarity(gallery_image, artist_image) × 0.40
  → scaled to 0–100 %
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Optional

import httpx
import numpy as np
import open_clip
import psycopg2
import torch
from fastapi import FastAPI, HTTPException
from transformers import pipeline as hf_pipeline
from fastapi.middleware.cors import CORSMiddleware
from pgvector.psycopg2 import register_vector
from PIL import Image
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client
import uvicorn
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY: str = os.environ["SUPABASE_SERVICE_KEY"]
DATABASE_URL: str = os.environ["DATABASE_URL"]
HUGGINGFACE_TOKEN: str = os.environ["HUGGINGFACE_TOKEN"]
GEMMA3_MODEL_ID = "google/gemma-3-4b-it"

TEXT_DIM = 1024   # BAAI/bge-large-en-v1.5
IMAGE_DIM = 512   # OpenCLIP ViT-B-32
TEXT_WEIGHT = 0.60
IMAGE_WEIGHT = 0.40

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global singletons loaded at startup
# ---------------------------------------------------------------------------

_bge: Optional[SentenceTransformer] = None
_clip_model = None
_clip_preprocess = None
_gemma3_pipe = None

def _get_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"

_device: str = _get_device()
_supabase: Optional[Client] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bge, _clip_model, _clip_preprocess, _gemma3_pipe, _supabase

    log.info("Loading BAAI/bge-large-en-v1.5 …")
    _bge = SentenceTransformer("BAAI/bge-large-en-v1.5")

    log.info("Loading OpenCLIP ViT-B-32 …")
    _clip_model, _, _clip_preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="openai"
    )
    _clip_model = _clip_model.to(_device).eval()

    log.info("Loading Gemma 3 (%s) from HuggingFace — first run downloads ~8 GB …", GEMMA3_MODEL_ID)
    _gemma3_pipe = hf_pipeline(
        "text-generation",
        model=GEMMA3_MODEL_ID,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        token=HUGGINGFACE_TOKEN,
    )
    log.info("Gemma 3 loaded.")

    _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    log.info("All models loaded. Server ready on port 8000.")
    yield


app = FastAPI(title="Artist-Gallery Matcher", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Database helpers (pgvector via psycopg2)
# ---------------------------------------------------------------------------

def _db():
    conn = psycopg2.connect(DATABASE_URL)
    register_vector(conn)
    return conn


def _upsert_embedding(table: str, user_id: str, text_emb: np.ndarray, image_emb: np.ndarray) -> None:
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {table} (user_id, text_embedding, image_embedding, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    text_embedding  = EXCLUDED.text_embedding,
                    image_embedding = EXCLUDED.image_embedding,
                    updated_at      = NOW()
                """,
                (user_id, text_emb, image_emb),
            )
        conn.commit()
    finally:
        conn.close()


def _fetch_embedding(table: str, user_id: str) -> Optional[dict]:
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT text_embedding, image_embedding FROM {table} WHERE user_id = %s",
                (user_id,),
            )
            row = cur.fetchone()
        if row is None:
            return None
        return {"text": np.array(row[0], dtype=np.float32), "image": np.array(row[1], dtype=np.float32)}
    finally:
        conn.close()


def _fetch_all_artist_embeddings(artist_ids: list[str]) -> dict[str, dict]:
    if not artist_ids:
        return {}
    conn = _db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id::text, text_embedding, image_embedding
                FROM artist_embeddings
                WHERE user_id = ANY(%s::uuid[])
                """,
                (artist_ids,),
            )
            rows = cur.fetchall()
        return {
            row[0]: {
                "text": np.array(row[1], dtype=np.float32),
                "image": np.array(row[2], dtype=np.float32),
            }
            for row in rows
        }
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# Embedding helpers
# ---------------------------------------------------------------------------

def embed_text(text: str) -> np.ndarray:
    return _bge.encode(text, normalize_embeddings=True).astype(np.float32)


async def _fetch_pil(url: str) -> Optional[Image.Image]:
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            return Image.open(BytesIO(r.content)).convert("RGB")
    except Exception as exc:
        log.warning("Could not fetch image %s: %s", url, exc)
        return None


def _embed_pil(img: Image.Image) -> np.ndarray:
    tensor = _clip_preprocess(img).unsqueeze(0).to(_clip_device)
    with torch.no_grad():
        feat = _clip_model.encode_image(tensor)
        feat = feat / feat.norm(dim=-1, keepdim=True)
    return feat.cpu().squeeze().numpy().astype(np.float32)


async def embed_images(urls: list[str]) -> np.ndarray:
    """Download all URLs, embed each with OpenCLIP, return mean-normalised vector."""
    pils = await asyncio.gather(*[_fetch_pil(u) for u in urls if u])
    valid = [p for p in pils if p is not None]
    if not valid:
        return np.zeros(IMAGE_DIM, dtype=np.float32)
    vecs = [_embed_pil(p) for p in valid]
    mean = np.mean(vecs, axis=0)
    norm = np.linalg.norm(mean)
    return (mean / (norm + 1e-9)).astype(np.float32)

# ---------------------------------------------------------------------------
# Gemma 3 description synthesis
# ---------------------------------------------------------------------------

def _gemma3(prompt: str) -> str:
    output = _gemma3_pipe(
        [{"role": "user", "content": prompt}],
        max_new_tokens=350,
    )
    return output[0]["generated_text"][-1]["content"].strip()


def synthesize_artist_description(profile: dict, artworks: list[dict]) -> str:
    answers = profile.get("answers") or {}
    artwork_lines = "\n".join(
        "- \"{title}\" | {medium} | {size}: {desc}".format(
            title=a.get("title") or "Untitled",
            medium=a.get("medium") or "unknown medium",
            size=a.get("size") or "unknown size",
            desc=a.get("description") or "",
        )
        for a in artworks
        if a
    ) or "No artwork details provided yet."

    return _gemma3(
        f"""You are generating a concise artist profile summary for semantic vector embedding.
This summary will be used to match the artist with suitable art galleries.

Artist data:
- Username: {profile.get("username", "Unknown")}
- Art type: {answers.get("art_type", "Not specified")}
- Years of experience: {answers.get("years_experience", "Not specified")}

Portfolio artworks:
{artwork_lines}

Write exactly 2–3 sentences that capture: the artist's medium and style, their experience level, \
and the kind of gallery context that would suit them. Be specific and factual — no marketing language."""
    )


def synthesize_gallery_description(profile: dict) -> str:
    answers = profile.get("answers") or {}
    gallery_name = answers.get("gallery_name") or profile.get("username") or "Unknown Gallery"
    location = answers.get("location") or "Location not specified"

    return _gemma3(
        f"""You are generating a concise gallery profile summary for semantic vector embedding.
This summary will be used to match the gallery with suitable artists.

Gallery data:
- Gallery name: {gallery_name}
- Location: {location}

Write exactly 2–3 sentences that capture: the gallery's likely artistic identity, the types of \
artists or mediums it would typically represent, and the cultural or geographic context of its \
location. Be specific and factual — no marketing language."""
    )

# ---------------------------------------------------------------------------
# Full embedding pipelines
# ---------------------------------------------------------------------------

async def compute_artist_embedding(user_id: str) -> dict:
    profile_resp = _supabase.from_("profiles").select("*").eq("id", user_id).single().execute()
    if not profile_resp.data:
        raise HTTPException(404, f"Artist profile {user_id} not found")
    profile = profile_resp.data

    images_resp = (
        _supabase.from_("gallery_images")
        .select("image_url, description")
        .eq("user_id", user_id)
        .execute()
    )
    gallery_rows = images_resp.data or []

    artwork_descs = [row.get("description") or {} for row in gallery_rows]

    # Step 1: Gemma 3 synthesizes description
    description = synthesize_artist_description(profile, artwork_descs)
    log.info("Artist %s description: %s", user_id, description)

    # Step 2: BAAI text embedding
    text_emb = embed_text(description)

    # Step 3: OpenCLIP image embedding (profile pic + all artwork images)
    image_urls = []
    if profile.get("profile_pic"):
        image_urls.append(profile["profile_pic"])
    image_urls += [row["image_url"] for row in gallery_rows if row.get("image_url")]
    image_emb = await embed_images(image_urls)

    # Step 4: pgvector upsert
    _upsert_embedding("artist_embeddings", user_id, text_emb, image_emb)

    return {"user_id": user_id, "description": description, "status": "ok"}


async def compute_gallery_embedding(user_id: str) -> dict:
    profile_resp = _supabase.from_("profiles").select("*").eq("id", user_id).single().execute()
    if not profile_resp.data:
        raise HTTPException(404, f"Gallery profile {user_id} not found")
    profile = profile_resp.data

    # Step 1: Gemma 3 synthesizes description
    description = synthesize_gallery_description(profile)
    log.info("Gallery %s description: %s", user_id, description)

    # Step 2: BAAI text embedding
    text_emb = embed_text(description)

    # Step 3: OpenCLIP image embedding (profile pic only for galleries)
    image_urls = [profile["profile_pic"]] if profile.get("profile_pic") else []
    image_emb = await embed_images(image_urls)

    # Step 4: pgvector upsert
    _upsert_embedding("gallery_embeddings", user_id, text_emb, image_emb)

    return {"user_id": user_id, "description": description, "status": "ok"}

# ---------------------------------------------------------------------------
# Compatibility scoring
# ---------------------------------------------------------------------------

def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = a / (np.linalg.norm(a) + 1e-9)
    b = b / (np.linalg.norm(b) + 1e-9)
    return float(np.dot(a, b))


def compatibility_score(gallery_emb: dict, artist_emb: dict) -> float:
    """Return a 0–100 compatibility percentage."""
    text_sim  = _cosine(gallery_emb["text"],  artist_emb["text"])
    image_sim = _cosine(gallery_emb["image"], artist_emb["image"])
    raw = TEXT_WEIGHT * text_sim + IMAGE_WEIGHT * image_sim
    return round(min(100.0, max(0.0, (raw + 1.0) / 2.0 * 100.0)), 1)

# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------

class EmbedResponse(BaseModel):
    user_id: str
    description: str
    status: str


class CompatibilityResponse(BaseModel):
    gallery_id: str
    artist_id: str
    compatibility: float  # 0–100


class RankedArtist(BaseModel):
    artist_id: str
    username: str
    profile_pic: str
    answers: dict
    compatibility: float

# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.post("/embed/artist/{user_id}", response_model=EmbedResponse)
async def embed_artist(user_id: str):
    """Compute (or refresh) the embedding for an artist profile and persist it."""
    return await compute_artist_embedding(user_id)


@app.post("/embed/gallery/{user_id}", response_model=EmbedResponse)
async def embed_gallery(user_id: str):
    """Compute (or refresh) the embedding for a gallery profile and persist it."""
    return await compute_gallery_embedding(user_id)


@app.get("/compatibility/{gallery_id}/{artist_id}", response_model=CompatibilityResponse)
async def get_compatibility(gallery_id: str, artist_id: str):
    """
    Return the compatibility percentage between a gallery and an artist.
    Requires that both profiles have already been embedded.
    """
    gallery_emb = _fetch_embedding("gallery_embeddings", gallery_id)
    artist_emb  = _fetch_embedding("artist_embeddings",  artist_id)

    if gallery_emb is None:
        raise HTTPException(
            404,
            f"No embedding for gallery {gallery_id}. "
            f"Call POST /embed/gallery/{gallery_id} first.",
        )
    if artist_emb is None:
        raise HTTPException(
            404,
            f"No embedding for artist {artist_id}. "
            f"Call POST /embed/artist/{artist_id} first.",
        )

    score = compatibility_score(gallery_emb, artist_emb)
    return CompatibilityResponse(gallery_id=gallery_id, artist_id=artist_id, compatibility=score)


@app.get("/ranked_artists/{gallery_id}", response_model=list[RankedArtist])
async def get_ranked_artists(gallery_id: str):
    """
    Return all artist profiles ranked by compatibility with the given gallery.
    Auto-computes the gallery embedding on first call if it doesn't exist.
    Artists without embeddings appear last with 0 % compatibility.
    """
    gallery_emb = _fetch_embedding("gallery_embeddings", gallery_id)
    if gallery_emb is None:
        log.info("Gallery %s has no embedding yet — computing now …", gallery_id)
        await compute_gallery_embedding(gallery_id)
        gallery_emb = _fetch_embedding("gallery_embeddings", gallery_id)

    artists_resp = (
        _supabase.from_("profiles")
        .select("id, username, profile_pic, answers")
        .eq("user_type", "artist")
        .neq("id", gallery_id)
        .execute()
    )
    artists = artists_resp.data or []

    artist_ids = [a["id"] for a in artists]
    emb_map = _fetch_all_artist_embeddings(artist_ids)

    results: list[RankedArtist] = []
    for artist in artists:
        aid = artist["id"]
        emb = emb_map.get(aid)
        compat = compatibility_score(gallery_emb, emb) if emb else 0.0
        results.append(
            RankedArtist(
                artist_id=aid,
                username=artist.get("username") or "",
                profile_pic=artist.get("profile_pic") or "",
                answers=artist.get("answers") or {},
                compatibility=compat,
            )
        )

    results.sort(key=lambda r: r.compatibility, reverse=True)
    return results


@app.post("/embed/all")
async def embed_all():
    """
    Batch-(re)embed every artist and gallery profile.
    Useful after bulk profile updates or initial deployment.
    """
    artists_resp   = _supabase.from_("profiles").select("id").eq("user_type", "artist").execute()
    galleries_resp = _supabase.from_("profiles").select("id").eq("user_type", "gallery").execute()

    artist_ids  = [r["id"] for r in (artists_resp.data  or [])]
    gallery_ids = [r["id"] for r in (galleries_resp.data or [])]

    successes: dict[str, list[str]] = {"artists": [], "galleries": []}
    errors: list[dict] = []

    for uid in artist_ids:
        try:
            await compute_artist_embedding(uid)
            successes["artists"].append(uid)
        except Exception as exc:
            errors.append({"id": uid, "type": "artist", "error": str(exc)})

    for uid in gallery_ids:
        try:
            await compute_gallery_embedding(uid)
            successes["galleries"].append(uid)
        except Exception as exc:
            errors.append({"id": uid, "type": "gallery", "error": str(exc)})

    return {**successes, "errors": errors}


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "models": {
            "text": "BAAI/bge-large-en-v1.5",
            "image": "OpenCLIP/ViT-B-32 (openai)",
            "synthesis": "gemma3",
        },
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
