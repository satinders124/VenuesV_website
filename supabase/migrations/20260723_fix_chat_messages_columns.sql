-- Fix chat_messages missing columns (PGRST204 senderRole not in schema cache)
-- This happens when table was created before senderRole was added and CREATE IF NOT EXISTS didn't add columns
-- Safe to re-run

-- Ensure table exists
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  "roomId" text not null default '',
  text text not null default '',
  "senderId" text not null default '',
  "senderName" text not null default '',
  "senderRole" text not null default 'staff',
  "created_at" timestamptz not null default timezone('utc', now())
);

-- IMPORTANT: Enable RLS immediately after creation to avoid Supabase warning
-- "This query creates a table without enabling Row Level Security"
alter table if exists public.chat_messages enable row level security;
alter table if exists public.venues enable row level security;
alter table if exists public.tasks enable row level security;
alter table if exists public.issues enable row level security;
alter table if exists public.zones enable row level security;

-- Add missing columns if table existed without them (pre 20260721)
alter table public.chat_messages add column if not exists "roomId" text not null default '';
alter table public.chat_messages add column if not exists text text not null default '';
alter table public.chat_messages add column if not exists "senderId" text not null default '';
alter table public.chat_messages add column if not exists "senderName" text not null default '';
alter table public.chat_messages add column if not exists "senderRole" text not null default 'staff';
alter table public.chat_messages add column if not exists "created_at" timestamptz not null default timezone('utc', now());

-- Also ensure other operational tables have expected columns (prevent similar PGRST204)
alter table public.venues add column if not exists name text not null default '';
alter table public.venues add column if not exists suburb text not null default '';
alter table public.venues add column if not exists type text not null default 'pub';
alter table public.venues add column if not exists score integer not null default 100;
alter table public.venues add column if not exists "ownerId" uuid;
alter table public.venues add column if not exists "assignedUids" text[] not null default '{}'::text[];
alter table public.venues add column if not exists "createdAt" timestamptz not null default timezone('utc', now());

alter table public.tasks add column if not exists title text not null default '';
alter table public.tasks add column if not exists zone text not null default '';
alter table public.tasks add column if not exists frequency text not null default 'daily';
alter table public.tasks add column if not exists priority text not null default 'medium';
alter table public.tasks add column if not exists icon text not null default '🧹';
alter table public.tasks add column if not exists done boolean not null default false;
alter table public.tasks add column if not exists "assignedTo" text;
alter table public.tasks add column if not exists "venueId" uuid;
alter table public.tasks add column if not exists "created_at" timestamptz not null default timezone('utc', now());

alter table public.issues add column if not exists title text not null default '';
alter table public.issues add column if not exists zone text not null default '';
alter table public.issues add column if not exists priority text not null default 'medium';
alter table public.issues add column if not exists status text not null default 'open';
alter table public.issues add column if not exists by text not null default '';
alter table public.issues add column if not exists "venueId" uuid;
alter table public.issues add column if not exists "photoUrls" text[] default '{}'::text[];
alter table public.issues add column if not exists "resolvedPhotoUrls" text[] default '{}'::text[];
alter table public.issues add column if not exists "resolvedBy" text default '';
alter table public.issues add column if not exists "resolvedAt" timestamptz;
alter table public.issues add column if not exists "resolvedNote" text default '';
alter table public.issues add column if not exists "createdAt" timestamptz not null default timezone('utc', now());

alter table public.zones add column if not exists name text not null default '';
alter table public.zones add column if not exists icon text not null default '📍';
alter table public.zones add column if not exists status text not null default 'clean';
alter table public.zones add column if not exists score integer not null default 100;
alter table public.zones add column if not exists "venueId" uuid;
alter table public.zones add column if not exists "createdAt" timestamptz not null default timezone('utc', now());

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
