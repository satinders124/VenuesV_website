-- Venues V: Fix invited team member role
-- Run this in Supabase Dashboard > SQL Editor.
--
-- This migration ONLY fixes:
-- 1. The auth trigger (was hardcoding role='owner' for ALL users)
-- 2. Repair existing profiles that were created with the wrong role

-- ═════════════════════════════════════════════════════════════════════════
-- FIX 1: Auth trigger — read role from user_metadata
-- ═════════════════════════════════════════════════════════════════════════
-- Previously: 'owner' (hardcoded)
-- Now:        coalesce(new.raw_user_meta_data ->> 'role', 'owner')

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
        when public.users."subscriptionStatus" <> 'pending' then public.users.role
        else coalesce(new.raw_user_meta_data ->> 'role', 'owner')
      end,
      phone = coalesce(public.users.phone, excluded.phone)
  where public.users."subscriptionStatus" = 'pending';

  return new;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- FIX 2: Repair buggy profiles (role=owner but actually staff)
-- ═════════════════════════════════════════════════════════════════════════

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
    select a.raw_user_meta_data ->> 'role'
    into meta_role
    from auth.users a
    where a.id::text = rec.uid::text
      and a.raw_user_meta_data ->> 'role' = any(valid_roles);

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
