# Required Expo app alignment

Copy these two files into the matching locations in the Expo repository after
running `supabase/migrations/20260712_website_signup_and_billing.sql`:

- `AuthContext.tsx` → `src/context/AuthContext.tsx`
- `SubscriptionBanner.tsx` → `src/components/SubscriptionBanner.tsx`

Why:

1. The Supabase auth trigger now creates `public.users` securely. The old app
   code attempted a second browser/client-side insert into `users`, which would
   fail after the trigger creates the profile.
2. The old banner put `uid` and `email` in `/subscribe` query parameters and
   allowed the Firebase checkout endpoint to trust them. The new website signs
   the owner into Supabase and verifies the bearer token server-side instead.

This only aligns registration and billing hand-off. The Expo app still contains
several Firebase Cloud Function URLs for invitations, password reset, team
queries and Stripe quantity syncing. Do not turn Firebase off until those are
migrated to Supabase Edge Functions or authenticated Vercel API routes.
