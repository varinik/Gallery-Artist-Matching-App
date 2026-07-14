// Client for the Python matching backend (backend/matcher.py).
// Set EXPO_PUBLIC_BACKEND_URL in your .env to point at the running server.
// Falls back to localhost for local development.

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");

export interface RankedArtist {
  artist_id: string;
  username: string;
  profile_pic: string;
  answers: Record<string, string>;
  compatibility: number; // 0–100
}

export interface CompatibilityResult {
  gallery_id: string;
  artist_id: string;
  compatibility: number;
}

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Matcher API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Ranked list of all artists by compatibility with the given gallery. */
export function getRankedArtists(galleryId: string): Promise<RankedArtist[]> {
  return apiCall<RankedArtist[]>(`/ranked_artists/${galleryId}`);
}

/** Point-in-time compatibility score between one gallery and one artist (0–100). */
export function getCompatibility(galleryId: string, artistId: string): Promise<CompatibilityResult> {
  return apiCall<CompatibilityResult>(`/compatibility/${galleryId}/${artistId}`);
}

/** Trigger (or refresh) the embedding for an artist profile. */
export function embedArtist(userId: string): Promise<void> {
  return apiCall<void>(`/embed/artist/${userId}`, { method: "POST" });
}

/** Trigger (or refresh) the embedding for a gallery profile. */
export function embedGallery(userId: string): Promise<void> {
  return apiCall<void>(`/embed/gallery/${userId}`, { method: "POST" });
}

/** Batch-embed every profile in the database (admin use). */
export function embedAll(): Promise<unknown> {
  return apiCall<unknown>("/embed/all", { method: "POST" });
}
