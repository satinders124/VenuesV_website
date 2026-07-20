-- Venues V: Complete RLS fix for production
-- Run this AFTER 20260721_create_tables_and_rls.sql
-- Fixes text=uuid cast error by adding explicit ::text casts everywhere
-- Fixes: venues insert, zones/tasks/issues CRUD, chat DM visibility
-- Safe to re-run

-- VENUES
alter table if exists public.venues enable row level security;

drop policy if exists venues_select_owner on public.venues;
create policy venues_select_owner
  on public.venues for select to authenticated
  using ( (public.venues."ownerId")::text = (auth.uid())::text );

drop policy if exists venues_select_assigned on public.venues;
create policy venues_select_assigned
  on public.venues for select to authenticated
  using ( (auth.uid())::text = ANY( COALESCE( public.venues."assignedUids"::text[], '{}'::text[] ) ) );

drop policy if exists venues_insert_authenticated on public.venues;
drop policy if exists venues_insert_owner on public.venues;
create policy venues_insert_authenticated
  on public.venues for insert to authenticated
  with check ( auth.uid() IS NOT NULL );

drop policy if exists venues_update_owner on public.venues;
create policy venues_update_owner
  on public.venues for update to authenticated
  using ( (public.venues."ownerId")::text = (auth.uid())::text )
  with check ( (public.venues."ownerId")::text = (auth.uid())::text );

drop policy if exists venues_delete_owner on public.venues;
create policy venues_delete_owner
  on public.venues for delete to authenticated
  using ( (public.venues."ownerId")::text = (auth.uid())::text );

-- ZONES
alter table if exists public.zones enable row level security;

drop policy if exists zones_select_venue_access on public.zones;
create policy zones_select_venue_access
  on public.zones for select to authenticated
  using (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.zones."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists zones_insert_venue_access on public.zones;
create policy zones_insert_venue_access
  on public.zones for insert to authenticated
  with check (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.zones."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists zones_update_venue_access on public.zones;
create policy zones_update_venue_access
  on public.zones for update to authenticated
  using (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.zones."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  )
  with check (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.zones."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists zones_delete_venue_access on public.zones;
create policy zones_delete_venue_access
  on public.zones for delete to authenticated
  using (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.zones."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

-- TASKS
alter table if exists public.tasks enable row level security;

drop policy if exists tasks_select_venue_access on public.tasks;
create policy tasks_select_venue_access
  on public.tasks for select to authenticated
  using (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.tasks."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists tasks_insert_venue_access on public.tasks;
create policy tasks_insert_venue_access
  on public.tasks for insert to authenticated
  with check (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.tasks."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists tasks_update_venue_access on public.tasks;
create policy tasks_update_venue_access
  on public.tasks for update to authenticated
  using (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.tasks."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  )
  with check (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.tasks."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists tasks_delete_venue_access on public.tasks;
create policy tasks_delete_venue_access
  on public.tasks for delete to authenticated
  using (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.tasks."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

-- ISSUES
alter table if exists public.issues enable row level security;

drop policy if exists issues_select_venue_access on public.issues;
create policy issues_select_venue_access
  on public.issues for select to authenticated
  using (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.issues."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists issues_insert_venue_access on public.issues;
create policy issues_insert_venue_access
  on public.issues for insert to authenticated
  with check (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.issues."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists issues_update_venue_access on public.issues;
create policy issues_update_venue_access
  on public.issues for update to authenticated
  using (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.issues."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  )
  with check (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.issues."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists issues_delete_venue_access on public.issues;
create policy issues_delete_venue_access
  on public.issues for delete to authenticated
  using (
    exists (
      select 1 from public.venues v
      where (v.id)::text = (public.issues."venueId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

-- CHAT_MESSAGES - fixed DM detection using starts_with to avoid LIKE ESCAPE issues
alter table if exists public.chat_messages enable row level security;

drop policy if exists chat_messages_select_venue_access on public.chat_messages;
create policy chat_messages_select_venue_access
  on public.chat_messages for select to authenticated
  using (
    starts_with( (public.chat_messages."roomId")::text, 'dm_' )
    or exists (
      select 1 from public.venues v
      where (v.id)::text = (public.chat_messages."roomId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists chat_messages_insert_venue_access on public.chat_messages;
create policy chat_messages_insert_venue_access
  on public.chat_messages for insert to authenticated
  with check (
    starts_with( (public.chat_messages."roomId")::text, 'dm_' )
    or exists (
      select 1 from public.venues v
      where (v.id)::text = (public.chat_messages."roomId")::text
        and ( (v."ownerId")::text = (auth.uid())::text or (auth.uid())::text = ANY( COALESCE( v."assignedUids"::text[], '{}'::text[] ) ) )
    )
  );

drop policy if exists chat_messages_delete_own on public.chat_messages;
create policy chat_messages_delete_own
  on public.chat_messages for delete to authenticated
  using ( (public.chat_messages."senderId")::text = (auth.uid())::text );

-- READ_RECEIPTS
alter table if exists public.read_receipts enable row level security;

drop policy if exists read_receipts_select_own on public.read_receipts;
create policy read_receipts_select_own
  on public.read_receipts for select to authenticated
  using ( (public.read_receipts."userId")::text = (auth.uid())::text );

drop policy if exists read_receipts_insert_own on public.read_receipts;
create policy read_receipts_insert_own
  on public.read_receipts for insert to authenticated
  with check ( (public.read_receipts."userId")::text = (auth.uid())::text );

drop policy if exists read_receipts_update_own on public.read_receipts;
create policy read_receipts_update_own
  on public.read_receipts for update to authenticated
  using ( (public.read_receipts."userId")::text = (auth.uid())::text )
  with check ( (public.read_receipts."userId")::text = (auth.uid())::text );
