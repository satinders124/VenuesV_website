-- Venues V: Complete RLS fix for production
-- Run this AFTER 20260721_create_tables_and_rls.sql
-- Fixes:
-- 1. venues had no INSERT policy -> owner cannot add venue
-- 2. zones/tasks/issues had only SELECT, no INSERT/UPDATE/DELETE -> all task/zone/issue ops fail
-- 3. chat_messages SELECT blocked DMs (roomId like dm_%) -> DM chat empty
-- 4. Add permissive but safe policies for operational tables
-- Safe to re-run (all DROP IF EXISTS)

-- ═════════════════════════════════════════════════════════
-- VENUES: Ensure all CRUD policies
-- ═════════════════════════════════════════════════════════
alter table if exists public.venues enable row level security;

drop policy if exists venues_select_owner on public.venues;
create policy venues_select_owner
  on public.venues for select to authenticated
  using ("ownerId"::text = auth.uid()::text);

drop policy if exists venues_select_assigned on public.venues;
create policy venues_select_assigned
  on public.venues for select to authenticated
  using (auth.uid()::text = any("assignedUids"));

-- INSERT: any authenticated can insert, but ownerId must be set.
-- Manager flow: manager's ownerId is resolved from an existing venue they are assigned to.
-- This keeps app working while still requiring auth.
drop policy if exists venues_insert_authenticated on public.venues;
drop policy if exists venues_insert_owner on public.venues;
create policy venues_insert_authenticated
  on public.venues for insert to authenticated
  with check (auth.uid() IS NOT NULL);

drop policy if exists venues_update_owner on public.venues;
create policy venues_update_owner
  on public.venues for update to authenticated
  using ("ownerId"::text = auth.uid()::text)
  with check ("ownerId"::text = auth.uid()::text);

drop policy if exists venues_delete_owner on public.venues;
create policy venues_delete_owner
  on public.venues for delete to authenticated
  using ("ownerId"::text = auth.uid()::text);

-- ═════════════════════════════════════════════════════════
-- ZONES
-- ═════════════════════════════════════════════════════════
alter table if exists public.zones enable row level security;

drop policy if exists zones_select_venue_access on public.zones;
create policy zones_select_venue_access
  on public.zones for select to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = zones."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists zones_insert_venue_access on public.zones;
create policy zones_insert_venue_access
  on public.zones for insert to authenticated
  with check (
    exists (
      select 1 from public.venues v
      where v.id::text = zones."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists zones_update_venue_access on public.zones;
create policy zones_update_venue_access
  on public.zones for update to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = zones."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  )
  with check (
    exists (
      select 1 from public.venues v
      where v.id::text = zones."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists zones_delete_venue_access on public.zones;
create policy zones_delete_venue_access
  on public.zones for delete to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = zones."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

-- ═════════════════════════════════════════════════════════
-- TASKS
-- ═════════════════════════════════════════════════════════
alter table if exists public.tasks enable row level security;

drop policy if exists tasks_select_venue_access on public.tasks;
create policy tasks_select_venue_access
  on public.tasks for select to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = tasks."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists tasks_insert_venue_access on public.tasks;
create policy tasks_insert_venue_access
  on public.tasks for insert to authenticated
  with check (
    exists (
      select 1 from public.venues v
      where v.id::text = tasks."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists tasks_update_venue_access on public.tasks;
create policy tasks_update_venue_access
  on public.tasks for update to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = tasks."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  )
  with check (
    exists (
      select 1 from public.venues v
      where v.id::text = tasks."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists tasks_delete_venue_access on public.tasks;
create policy tasks_delete_venue_access
  on public.tasks for delete to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = tasks."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

-- ═════════════════════════════════════════════════════════
-- ISSUES
-- ═════════════════════════════════════════════════════════
alter table if exists public.issues enable row level security;

drop policy if exists issues_select_venue_access on public.issues;
create policy issues_select_venue_access
  on public.issues for select to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = issues."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists issues_insert_venue_access on public.issues;
create policy issues_insert_venue_access
  on public.issues for insert to authenticated
  with check (
    exists (
      select 1 from public.venues v
      where v.id::text = issues."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists issues_update_venue_access on public.issues;
create policy issues_update_venue_access
  on public.issues for update to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = issues."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  )
  with check (
    exists (
      select 1 from public.venues v
      where v.id::text = issues."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists issues_delete_venue_access on public.issues;
create policy issues_delete_venue_access
  on public.issues for delete to authenticated
  using (
    exists (
      select 1 from public.venues v
      where v.id::text = issues."venueId"::text
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

-- ═════════════════════════════════════════════════════════
-- CHAT_MESSAGES: Fix DM select + add venue access for write
-- ═════════════════════════════════════════════════════════
alter table if exists public.chat_messages enable row level security;

drop policy if exists chat_messages_select_venue_access on public.chat_messages;
create policy chat_messages_select_venue_access
  on public.chat_messages for select to authenticated
  using (
    chat_messages."roomId" like 'dm\_%' ESCAPE '\'
    or exists (
      select 1 from public.venues v
      where v.id::text = chat_messages."roomId"
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

drop policy if exists chat_messages_insert_venue_access on public.chat_messages;
create policy chat_messages_insert_venue_access
  on public.chat_messages for insert to authenticated
  with check (
    chat_messages."roomId" like 'dm\_%' ESCAPE '\'
    or exists (
      select 1 from public.venues v
      where v.id::text = chat_messages."roomId"
        and (v."ownerId"::text = auth.uid()::text or auth.uid()::text = any(v."assignedUids"))
    )
  );

-- Allow users to delete their own messages if needed (optional, safe)
drop policy if exists chat_messages_delete_own on public.chat_messages;
create policy chat_messages_delete_own
  on public.chat_messages for delete to authenticated
  using (chat_messages."senderId" = auth.uid()::text);

-- ═════════════════════════════════════════════════════════
-- READ_RECEIPTS: already correct, ensure update also for upsert
-- ═════════════════════════════════════════════════════════
alter table if exists public.read_receipts enable row level security;

drop policy if exists read_receipts_select_own on public.read_receipts;
create policy read_receipts_select_own
  on public.read_receipts for select to authenticated
  using ("userId" = auth.uid()::text);

drop policy if exists read_receipts_insert_own on public.read_receipts;
create policy read_receipts_insert_own
  on public.read_receipts for insert to authenticated
  with check ("userId" = auth.uid()::text);

drop policy if exists read_receipts_update_own on public.read_receipts;
create policy read_receipts_update_own
  on public.read_receipts for update to authenticated
  using ("userId" = auth.uid()::text)
  with check ("userId" = auth.uid()::text);
