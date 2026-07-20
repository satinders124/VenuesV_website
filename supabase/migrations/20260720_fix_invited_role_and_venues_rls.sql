-- Venues V: Fix invited team member role + venues RLS
-- Run this in Supabase Dashboard > SQL Editor after taking a backup.
--
-- This migration is ORDERED so that tables exist before any RLS policies
-- reference them. All auth.uid() comparisons use ::text to avoid type
-- mismatches between uuid and existing text columns.

-- ═════════════════════════════════════════════════════════════════════════
-- PART 1: Create missing tables (DDL before any RLS that references them)
-- ═════════════════════════════════════════════════════════════════════════

-- Venues
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  suburb text not null default '',
  type text not null default 'pub',
  score integer not null default 100,
  "ownerId" uuid not null,
  "assignedUids" text[] not null default '{}'::text[],
  "createdAt" timestamptz not null default timezone('utc', now())
);

-- Zones
create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  icon text not null default '📍',
  status text not null default 'clean',
  score integer not null default 100,
  "venueId" uuid not null,
  "createdAt" timestamptz not null default timezone('utc', now())
);

-- Tasks
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  zone text not null default '',
  frequency text not null default 'daily',
  priority text not null default 'medium',
  icon text not null default '🧹',
  done boolean not null default false,
  "assignedTo" text,
  "venueId" uuid not null,
  "created_at" timestamptz not null default timezone('utc', now())
);

-- Issues
create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  zone text not null default '',
  priority text not null default 'medium',
  status text not null default 'open',
  by text not null default '',
  "venueId" uuid not null,
  "photoUrls" text[] default '{}'::text[],
  "resolvedPhotoUrls" text[] default '{}'::text[],
  "resolvedBy" text default '',
  "resolvedAt" timestamptz,
  "resolvedNote" text default '',
  "createdAt" timestamptz not null default timezone('utc', now())
);

-- Chat messages
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  "roomId" text not null default '',
  text text not null default '',
  "senderId" text not null default '',
  "senderName" text not null default '',
  "senderRole" text not null default 'staff',
  "created_at" timestamptz not null default timezone('utc', now())
);

-- Read receipts
create table if not exists public.read_receipts (
  id text primary key,
  "userId" text not null default '',
  "roomId" text not null default '',
  "readAt" timestamptz not null default timezone('utc', now())
);

-- ═════════════════════════════════════════════════════════════════════════
-- PART 2: Indexes
-- ═════════════════════════════════════════════════════════════════════════

create index if not exists idx_venues_ownerid on public.venues("ownerId");
create index if not exists idx_zones_venueid on public.zones("venueId");
create index if not exists idx_tasks_venueid on public.tasks("venueId");
create index if not exists idx_issues_venueid on public.issues("venueId");
create index if not exists idx_chat_messages_roomid on public.chat_messages("roomId");
create index if not exists idx_read_receipts_userid_roomid on public.read_receipts("userId", "roomId");

-- ═════════════════════════════════════════════════════════════════════════
-- PART 3: Auth trigger — read role from user_metadata
-- ═════════════════════════════════════════════════════════════════════════
-- Previously: 'owner' (hardcoded)
-- Now:        coalesce(new.raw_user_meta_data ->> 'role', 'owner')
-- Website signups (no role metadata) → 'owner'
-- Invited team members (role metadata) → correct role (manager/cleaner/staff)

create or replace function public.handle_new_venuesv_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    uid, name, email, role, venue, venues, phone,
    "subscriptionStatus", "marketingOptIn", "venueCount", "createdAt"
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'owner'),
    '',
    '{}'::text[],
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'pending',
    false,
    1,
    timezone('utc', now())
  )
  on conflict (uid) do update
  set email = excluded.email,
      name = case when public.users.name = '' then excluded.name else public.users.name end,
      role = case
        -- Don't downgrade a profile that has been promoted past 'pending'
        when public.users."subscriptionStatus" <> 'pending' then public.users.role
        else coalesce(new.raw_user_meta_data ->> 'role', 'owner')
      end,
      phone = coalesce(public.users.phone, excluded.phone)
  where public.users."subscriptionStatus" = 'pending';

  return new;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- PART 4: Fix profiles created with the buggy role
-- ═════════════════════════════════════════════════════════════════════════
-- Users invited BEFORE this migration have role = 'owner' in their profile.
-- We fix them: if the auth.user_metadata contains a valid invite role
-- (manager/cleaner/staff) that differs from 'owner', update the profile.
-- This avoids touching real owners who signed up normally.

do $$
declare
  rec record;
  meta_role text;
  valid_roles text[] := array['manager', 'cleaner', 'staff'];
begin
  for rec in
    select u.uid
    from public.users u
    where u.role = 'owner'
      and not exists (
        select 1 from public.venues v where v."ownerId"::text = u.uid::text
      )
  loop
    -- Check if auth user_metadata has a valid invite role
    select a.raw_user_meta_data ->> 'role'
    into meta_role
    from auth.users a
    where a.id::text = rec.uid::text
      and a.raw_user_meta_data ->> 'role' = any(valid_roles);

    -- Only update if we found a valid non-owner role in metadata
    if meta_role is not null then
      update public.users
      set role = meta_role
      where uid::text = rec.uid::text
        and role = 'owner'
        and not exists (select 1 from public.venues v where v."ownerId"::text = rec.uid::text);

      raise notice 'Fixed role for uid %: owner → %', rec.uid, meta_role;
    end if;
  end loop;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- PART 5: Row Level Security policies
-- ═════════════════════════════════════════════════════════════════════════
-- All comparisons use ::text to handle existing tables that may have text
-- columns instead of uuid. auth.uid() returns uuid, so ::text makes it
-- compatible with both text and uuid columns via implicit coercion.

-- 5a. venues
alter table if exists public.venues enable row level security;

drop policy if exists venues_select_owner on public.venues;
create policy venues_select_owner
  on public.venues for select
  to authenticated
  using ("ownerId"::text = auth.uid()::text);

drop policy if exists venues_select_assigned on public.venues;
create policy venues_select_assigned
  on public.venues for select
  to authenticated
  using (
    auth.uid()::text = any("assignedUids")
  );

drop policy if exists venues_update_owner on public.venues;
create policy venues_update_owner
  on public.venues for update
  to authenticated
  using ("ownerId"::text = auth.uid()::text)
  with check ("ownerId"::text = auth.uid()::text);

drop policy if exists venues_delete_owner on public.venues;
create policy venues_delete_owner
  on public.venues for delete
  to authenticated
  using ("ownerId"::text = auth.uid()::text);

-- 5b. zones (venue-access based)
alter table if exists public.zones enable row level security;

drop policy if exists zones_select_venue_access on public.zones;
create policy zones_select_venue_access
  on public.zones for select
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = zones."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

-- 5c. tasks (venue-access based)
alter table if exists public.tasks enable row level security;

drop policy if exists tasks_select_venue_access on public.tasks;
create policy tasks_select_venue_access
  on public.tasks for select
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = tasks."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

-- 5d. issues (venue-access based)
alter table if exists public.issues enable row level security;

drop policy if exists issues_select_venue_access on public.issues;
create policy issues_select_venue_access
  on public.issues for select
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = issues."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

-- 5e. chat_messages (venue-access based for group, DM allowed for all)
alter table if exists public.chat_messages enable row level security;

drop policy if exists chat_messages_select_venue_access on public.chat_messages;
create policy chat_messages_select_venue_access
  on public.chat_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = chat_messages."roomId"
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists chat_messages_insert_venue_access on public.chat_messages;
create policy chat_messages_insert_venue_access
  on public.chat_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.venues v
      where v.id::text = chat_messages."roomId"
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
    or chat_messages."roomId" like 'dm\_%'
  );

-- 5f. read_receipts (per-user)
alter table if exists public.read_receipts enable row level security;

drop policy if exists read_receipts_select_own on public.read_receipts;
create policy read_receipts_select_own
  on public.read_receipts for select
  to authenticated
  using ("userId" = auth.uid()::text);

drop policy if exists read_receipts_insert_own on public.read_receipts;
create policy read_receipts_insert_own
  on public.read_receipts for insert
  to authenticated
  with check ("userId" = auth.uid()::text);

drop policy if exists read_receipts_update_own on public.read_receipts;
create policy read_receipts_update_own
  on public.read_receipts for update
  to authenticated
  using ("userId" = auth.uid()::text)
  with check ("userId" = auth.uid()::text);

-- ═════════════════════════════════════════════════════════════════════════
-- PART 6: Enable realtime for subscribed tables
-- ═════════════════════════════════════════════════════════════════════════

do $$
begin
  begin
    alter publication supabase_realtime add table public.venues;
  exception when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.issues;
  exception when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.zones;
  exception when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_messages;
  exception when undefined_table then null;
  end;
end;
$$;
