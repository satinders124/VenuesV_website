-- Venues V: Supabase website signup + Stripe billing support
-- Run this once in Supabase Dashboard > SQL Editor, after taking a database backup.
-- This migration uses the existing public.users table shape used by the Expo app.

create table if not exists public.users (
  uid uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'owner',
  venue text not null default '',
  venues text[] not null default '{}'::text[],
  phone text,
  "expoPushToken" text,
  "subscriptionStatus" text not null default 'trial',
  "trialEndsAt" timestamptz,
  "venueCount" integer not null default 1,
  "marketingOptIn" boolean not null default false,
  "stripeCustomerId" text,
  "stripeSubscriptionId" text,
  "stripeStatus" text,
  "subscriptionEndsAt" timestamptz,
  "lastPaymentAt" timestamptz,
  "termsAcceptedAt" timestamptz,
  "privacyAcceptedAt" timestamptz,
  "createdAt" timestamptz not null default timezone('utc', now())
);

-- Safe additions when public.users already exists from the mobile-app migration.
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists "expoPushToken" text;
alter table public.users add column if not exists "subscriptionStatus" text not null default 'trial';
alter table public.users add column if not exists "trialEndsAt" timestamptz;
alter table public.users add column if not exists "venueCount" integer not null default 1;
alter table public.users add column if not exists "marketingOptIn" boolean not null default false;
alter table public.users add column if not exists "stripeCustomerId" text;
alter table public.users add column if not exists "stripeSubscriptionId" text;
alter table public.users add column if not exists "stripeStatus" text;
alter table public.users add column if not exists "subscriptionEndsAt" timestamptz;
alter table public.users add column if not exists "lastPaymentAt" timestamptz;
alter table public.users add column if not exists "termsAcceptedAt" timestamptz;
alter table public.users add column if not exists "privacyAcceptedAt" timestamptz;
alter table public.users add column if not exists "createdAt" timestamptz not null default timezone('utc', now());

-- The auth trigger's ON CONFLICT clause needs a unique uid. This block is a no-op
-- if uid is already the primary key or already has a unique constraint.
do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_attribute attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
     and attribute_row.attnum = any(constraint_row.conkey)
    where constraint_row.conrelid = 'public.users'::regclass
      and constraint_row.contype in ('p', 'u')
      and array_length(constraint_row.conkey, 1) = 1
      and attribute_row.attname = 'uid'
  ) then
    alter table public.users add constraint users_uid_unique unique (uid);
  end if;
end;
$$;

-- A profile is created only on the server-side auth trigger. Browser clients cannot
-- assign themselves an owner/manager role or set subscription/billing fields.
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
    'owner',
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
      phone = coalesce(public.users.phone, excluded.phone)
  where public.users."subscriptionStatus" = 'pending';

  return new;
end;
$$;

drop trigger if exists on_auth_venuesv_user_created on auth.users;
create trigger on_auth_venuesv_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_venuesv_user();

-- Authenticated users may update harmless profile fields (for example their Expo
-- push token). The trigger below blocks browser/mobile clients from setting role,
-- trial or Stripe fields directly. The service-role Vercel API bypasses this check.
create or replace function public.prevent_client_billing_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
     and current_setting('venuesv.allow_billing_update', true) is distinct from 'true'
     and (
       new.uid is distinct from old.uid
       or new.role is distinct from old.role
       or new."subscriptionStatus" is distinct from old."subscriptionStatus"
       or new."trialEndsAt" is distinct from old."trialEndsAt"
       or new."venueCount" is distinct from old."venueCount"
       or new."stripeCustomerId" is distinct from old."stripeCustomerId"
       or new."stripeSubscriptionId" is distinct from old."stripeSubscriptionId"
       or new."stripeStatus" is distinct from old."stripeStatus"
       or new."subscriptionEndsAt" is distinct from old."subscriptionEndsAt"
       or new."lastPaymentAt" is distinct from old."lastPaymentAt"
       or new."termsAcceptedAt" is distinct from old."termsAcceptedAt"
       or new."privacyAcceptedAt" is distinct from old."privacyAcceptedAt"
       or new."marketingOptIn" is distinct from old."marketingOptIn"
     )
  then
    raise exception 'This profile field can only be changed by the server.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_client_billing_changes on public.users;
create trigger prevent_client_billing_changes
  before update on public.users
  for each row execute procedure public.prevent_client_billing_changes();

-- This RPC begins the trial only after the account's email has been confirmed and
-- the customer has accepted the website agreements. It cannot be used twice.
create or replace function public.complete_owner_trial_signup(p_marketing_opt_in boolean default false)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  confirmed_at timestamptz;
  current_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required.';
  end if;

  select email_confirmed_at into confirmed_at
  from auth.users
  where id = auth.uid();

  if confirmed_at is null then
    raise exception 'Verify your email before starting a trial.';
  end if;

  select "subscriptionStatus" into current_status
  from public.users
  where uid = auth.uid()
  for update;

  if current_status is null then
    raise exception 'Your Venues V profile could not be found.';
  end if;

  if current_status <> 'pending' then
    raise exception 'A trial or subscription already exists for this account.';
  end if;

  perform set_config('venuesv.allow_billing_update', 'true', true);
  update public.users
  set "subscriptionStatus" = 'trial',
      "trialEndsAt" = timezone('utc', now()) + interval '14 days',
      "marketingOptIn" = coalesce(p_marketing_opt_in, false),
      "termsAcceptedAt" = timezone('utc', now()),
      "privacyAcceptedAt" = timezone('utc', now())
  where uid = auth.uid();
end;
$$;

revoke all on function public.complete_owner_trial_signup(boolean) from public;
grant execute on function public.complete_owner_trial_signup(boolean) to authenticated;

-- RLS is the security boundary for the public Supabase anon key used by the website.
alter table public.users enable row level security;

drop policy if exists users_select_own_profile on public.users;
create policy users_select_own_profile
  on public.users for select to authenticated
  using (uid = auth.uid());

drop policy if exists users_update_own_profile on public.users;
create policy users_update_own_profile
  on public.users for update to authenticated
  using (uid = auth.uid())
  with check (uid = auth.uid());

-- Do not create an INSERT policy for authenticated/anon users. New profiles come
-- from the auth trigger above; staff accounts should be invited server-side.
