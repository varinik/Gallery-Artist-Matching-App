# Project Context — Artist-Gallery Matching App

## What This App Does

A mobile app (Expo / React Native) that connects **artists** with **art galleries**. Galleries browse a Tinder-style swipe deck of artists and can like or pass on them. A Python backend computes an AI-powered **compatibility score** (0–100%) between each gallery and artist based on their profile text and artwork images, surfacing the best-matched artists at the top of the deck.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile app | Expo (SDK 56) + React Native, TypeScript, expo-router |
| Styling | NativeWind / Tailwind-style, custom theme in `src/constants/theme.ts` |
| Auth & DB | Supabase (auth, PostgreSQL, storage) |
| Vector search | pgvector extension on Supabase PostgreSQL |
| Matching backend | Python 3.10+, FastAPI, uvicorn |
| Text description | Gemma 3 4B (`google/gemma-3-4b-it`) via HuggingFace transformers |
| Text embedding | BAAI/bge-large-en-v1.5 (1024-d, via sentence-transformers) |
| Image/style embedding | OpenCLIP ViT-B-32 (512-d, via open-clip-torch) |

---

## Supabase Project

- **URL:** `https://hbclccxsfpljckxyyrtl.supabase.co`
- **Anon key** lives in `src/lib/supabase.ts` (public, safe to commit)
- **Service-role key** lives only in `backend/.env` — never commit this

### Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | One row per user. Columns: `id` (uuid), `username`, `user_type` (`artist` or `gallery`), `profile_pic` (URL), `answers` (jsonb) |
| `gallery_images` | Artwork uploaded by artists. Columns: `id`, `user_id`, `image_url`, `description` (jsonb: `{title, medium, size, description}`), `created_at` |
| `blog_posts` | Artist blog updates. Columns: `id`, `user_id`, `content`, `created_at` |
| `swipes` | Gallery swipe history. Columns: `gallery_id`, `artist_id`, `decision` (`liked` or `passed`) |
| `artist_embeddings` | AI vectors for artists. Columns: `user_id`, `text_embedding` (vector 1024), `image_embedding` (vector 512), `updated_at` |
| `gallery_embeddings` | AI vectors for galleries. Same structure — but `image_embedding` stores a CLIP **text** vector (see matching section) |

### Supabase Storage Buckets

| Bucket | Contents |
|--------|---------|
| `profile_pic` | Profile photos — path: `avatars/{userId}.jpg` |
| `gallery` | Artwork images — path: `{userId}/{timestamp}.jpg` |

### Artist Profile Questions (`answers` jsonb keys)
- `art_type` — "What type of art do you create?"
- `years_experience` — "How many years have you been creating art?"

### Gallery Profile Questions (`answers` jsonb keys)
- `artist_type` — "What type of artist are you looking for?"
- `art_style` — "What style of art are you interested in?"

---

## App File Structure

```
src/
  app/
    index.tsx              — Login screen; routes to gallery_dashboard, artist_dashboard, or new_user based on user_type from profiles table
    signup.tsx             — Email/password auth via Supabase
    new_user.tsx           — Profile creation (username, photo, user type, Q&A)
    home_page.tsx          — Post-login landing (legacy)
    artist_dashboard.tsx   — Artist's own profile (About / Gallery / Blog tabs)
    gallery_dashboard.tsx  — Gallery's swipe deck; bottom nav; info button opens artist profile modal
    gallery_profile.tsx    — Gallery's own editable profile (username, art preferences, profile pic upload)
    messages.tsx           — Placeholder
    notifications.tsx      — Placeholder
    calendar.tsx           — Placeholder
    explore.tsx            — Placeholder
    _layout.tsx            — Expo Router root layout
  lib/
    supabase.ts            — Supabase client (anon key, AsyncStorage session)
    matchApi.ts            — TypeScript client for the Python matching backend
  components/              — Shared UI components (themed text, tabs, etc.)
  constants/theme.ts       — Color palette and design tokens
  hooks/                   — useColorScheme, useTheme
```

---

## Routing & Access Control

Login (`index.tsx`) fetches `user_type` from the `profiles` table after auth and routes:
- `gallery` → `/gallery_dashboard`
- `artist` → `/artist_dashboard`
- no profile → `/new_user`

Galleries can navigate between `gallery_dashboard` ↔ `gallery_profile` via the bottom nav bar. Artists only ever see `artist_dashboard`.

---

## Matching Backend (`backend/`)

### How It Works

#### Artist embedding pipeline
1. Fetch `answers` (art_type, years_experience) + all artwork image URLs from `gallery_images`
2. Gemma 3 synthesizes a 2–3 sentence description from the structured fields
3. BAAI/bge-large-en-v1.5 encodes the description → **1024-d text vector**
4. OpenCLIP ViT-B-32 encodes each **artwork image** (profile pic excluded), averages them → **512-d image vector**
5. Both vectors upserted into `artist_embeddings`

#### Gallery embedding pipeline
1. Fetch `answers` (artist_type, art_style)
2. Gemma 3 synthesizes a 2–3 sentence description of the gallery's art preferences
3. BAAI/bge-large-en-v1.5 encodes the description → **1024-d text vector**
4. OpenCLIP's **text encoder** encodes the same description → **512-d CLIP text vector** stored in `image_embedding`
5. Both vectors upserted into `gallery_embeddings`

Galleries never upload images that affect matching. Their `image_embedding` is a CLIP text vector, not an image vector.

### Compatibility Score Formula

```
text_sim  = cosine(gallery_text_1024,  artist_text_1024)   # BAAI ↔ BAAI
style_sim = cosine(gallery_clip_text_512, artist_clip_image_512)  # cross-modal CLIP

score = (0.60 × text_sim + 0.40 × style_sim) scaled to 0–100%
```

The cross-modal CLIP comparison ("does the artist's actual work look like what the gallery described?") is possible because CLIP was trained to align text and images in the same embedding space.

If an artist has no artwork images uploaded, `style_sim` is skipped and the score is 100% text-based. Both sides gracefully handle missing image embeddings.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Confirm all models are loaded |
| `POST` | `/embed/artist/{user_id}` | Embed (or refresh) one artist |
| `POST` | `/embed/gallery/{user_id}` | Embed (or refresh) one gallery |
| `POST` | `/embed/all` | Batch-embed every profile |
| `GET`  | `/compatibility/{gallery_id}/{artist_id}` | Point-in-time score |
| `GET`  | `/ranked_artists/{gallery_id}` | All artists sorted by match % |

### Running the Backend

```bash
cd backend
cp .env.example .env        # fill in DATABASE_URL password + HUGGINGFACE_TOKEN
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn matcher:app --reload   # first run downloads Gemma 3 (~8 GB)
```

### Backend Environment Variables (`backend/.env`)

| Variable | What it is |
|----------|-----------|
| `SUPABASE_URL` | `https://hbclccxsfpljckxyyrtl.supabase.co` (no trailing slash, no `/rest/v1/`) |
| `SUPABASE_SERVICE_KEY` | Service-role key from Supabase Dashboard → Settings → API |
| `DATABASE_URL` | Postgres URI — use the **Session mode pooler** (port 5432) from Supabase Dashboard → Settings → Database → Connection string. Transaction pooler (port 6543) does not work with pgvector's register_vector. |
| `HUGGINGFACE_TOKEN` | HF read token; must accept Gemma 3 terms at hf.co/google/gemma-3-4b-it |

### pgvector Schema

Run `backend/schema.sql` once in the Supabase SQL Editor to create the two embedding tables and enable the vector extension. The vector extension must also be explicitly enabled:

```sql
create extension if not exists vector;
```

---

## App ↔ Backend Integration

- `src/lib/matchApi.ts` — typed fetch wrapper; reads `EXPO_PUBLIC_BACKEND_URL` (defaults to `http://localhost:8000`)
- `gallery_dashboard.tsx` `loadArtists()` — tries `GET /ranked_artists/{galleryId}` first; silently falls back to direct Supabase query if the backend is unreachable
- Artist cards show a dark **"XX% match"** badge in the top-right corner when a score is available
- The backend must be running locally for scores to appear; the app works without it (no badges)

---

## gallery_dashboard.tsx Features

- Swipe deck with animated cards (PanResponder)
- Info button `ⓘ` between ✕ and ♥ opens a full-screen **artist profile modal** showing photo, username, match %, Q&A answers, and artwork image grid (fetched from `gallery_images`)
- Modal has a sticky header with `← Back` button to dismiss
- Bottom nav: Discover (active) · Messages · Notifications · Calendar · Profile → `gallery_profile`
- Compatibility badges on cards when backend is running

## gallery_profile.tsx Features

- Shows gallery's username and `artist_type` answer in header
- Tappable profile picture to upload a new one (same pattern as `new_user.tsx`)
- About section shows `artist_type` and `art_style` answers
- Pencil FAB opens edit modal to update both answer fields
- Bottom nav: Discover → `gallery_dashboard` · Messages · Notifications · Calendar · Profile (active)

---

## Key Design Decisions

- **Two-stage pipeline:** Gemma 3 first converts sparse structured fields into rich prose, then BAAI/CLIP encode that prose. Better semantic signal than embedding raw Q&A answers directly.
- **Cross-modal CLIP matching:** Gallery's style description is encoded with CLIP's text encoder; artist's artwork is encoded with CLIP's image encoder. Both live in the same 512-d CLIP space — cosine similarity across modalities is meaningful.
- **Separate text + image vectors:** Stored separately so weights (currently 60/40) can be tuned without re-embedding.
- **Graceful degradation:** Gallery dashboard works without the backend (no scores). Artists without artwork get text-only scores.
- **Service-role key on backend only:** The mobile app uses only the anon key. All privileged reads happen server-side.
- **Session pooler required:** Supabase's transaction pooler (port 6543) does not support pgvector's `register_vector`. Use session pooler (port 5432).

---

## What Is Not Yet Built

- `messages.tsx` — messaging between matched gallery/artist pairs
- `notifications.tsx` — match/like notifications
- `calendar.tsx` — scheduling exhibitions or meetings
- `explore.tsx` — discovery feed (non-swipe browsing)
- Artist-side visibility into which galleries liked them
- Automatic re-embedding when a profile is updated (currently manual via `/embed/artist/{id}`)
- Production deployment of the Python backend (currently local only)
