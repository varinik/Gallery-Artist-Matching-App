-- Run each block separately in the Supabase SQL Editor if needed.

-- 1. pgvector is pre-installed on Supabase; this is a no-op if already present.
create extension if not exists vector with schema extensions;

-- 2. Artist embeddings
create table if not exists public.artist_embeddings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  text_embedding vector(1024),
  image_embedding vector(512),
  updated_at timestamptz not null default now()
);

-- 3. Gallery embeddings
create table if not exists public.gallery_embeddings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  text_embedding vector(1024),
  image_embedding vector(512),
  updated_at timestamptz not null default now()
);
