# Venues V website — Vercel + Supabase

This is a Vercel-ready replacement for the supplied static website. It retains
the landing, privacy, terms and subscription pages while removing Firebase from
all public website code.

## What changed

- **Landing-page signup** now uses Supabase Auth email/password signup and a
  six-digit Supabase email OTP. Once the email is verified and agreements are
  accepted, `complete_owner_trial_signup` begins the 14-day trial.
- **Profiles** are created by a database trigger, not by the browser. A person
  cannot make themselves an owner or write Stripe/trial fields from the public
  anon key.
- **`/subscribe`** signs the owner into Supabase in the browser. It never trusts
  `uid` or `email` query parameters from the mobile app.
- **Stripe checkout, customer portal and webhooks** run in Vercel serverless
  functions. The service-role key and Stripe secret key stay server-side.
- The privacy policy and security FAQ now name **Supabase** and **Vercel**.

## Before deployment

1. **Back up Supabase and Stripe mappings.** This project does not copy old
   Firebase Auth/Firestore users, Firebase Stripe customer IDs or subscriptions.
   Your Expo source already points to Supabase, but any active legacy Stripe
   records must be mapped to the matching `public.users` row before Firebase is
   retired.
2. In Supabase **SQL Editor**, run
   `supabase/migrations/20260712_website_signup_and_billing.sql`.
   - It creates/extends the `public.users` fields used by this website.
   - It adds the auth trigger, secure trial-completion RPC and RLS policies.
   - The app patch in `app-patches/` is required because the trigger replaces
     the old client-side `users.insert(...)` behaviour.
3. In Supabase **Authentication → URL Configuration** set:
   - Site URL: `https://venuesv.com`
   - Redirect URLs: `https://venuesv.com/subscribe` and
     `https://www.venuesv.com/subscribe`
   - Add your Vercel preview URL temporarily if you will test signup there.
4. In Supabase **Authentication → Providers → Email** enable email confirmation.
   In **Email Templates → Magic Link**, use a template containing
   `{{ .Token }}` so the page's six OTP boxes receive a code. The website uses
   Supabase Email OTP (`signInWithOtp`), for example:

   ```html
   <h2>Confirm your Venues V account</h2>
   <p>Your verification code is:</p>
   <h1>{{ .Token }}</h1>
   <p>This code expires shortly. If you did not request it, you can ignore this email.</p>
   ```

   Configure production SMTP before launch. The default Supabase email service
   is deliberately rate-limited and is not appropriate for a production app.
5. In Stripe, create or confirm the **AUD $19.95 weekly recurring** Price and
   copy its `price_...` ID. Enable/configure the Stripe Customer Portal.

## Deploy to Vercel

1. Put this folder in its own GitHub repository (or upload/import it as the
   website project):

   ```bash
   cd venuesv-vercel
   npm install
   npm run check
   npx vercel
   ```

2. In **Vercel → Project → Settings → Environment Variables**, set every value
   from `.env.example` for **Production** (and Preview if you test API routes
   in previews):

   | Variable | Value |
   | --- | --- |
   | `SITE_URL` | `https://venuesv.com` |
   | `SUPABASE_URL` | `https://nzicfhnnrbiilijmichh.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret/service-role key — server only |
   | `STRIPE_SECRET_KEY` | Stripe secret key — server only |
   | `STRIPE_WEEKLY_PRICE_ID` | Your $19.95/week Stripe `price_...` ID |
   | `STRIPE_WEBHOOK_SECRET` | Signing secret for the Vercel Stripe webhook |
   | `ALLOWED_ORIGINS` | `https://venuesv.com,https://www.venuesv.com` |

   **Never** commit `.env`, and never put the service-role or Stripe secret key
   in a file under `public/`.

3. Deploy production:

   ```bash
   npx vercel --prod
   ```

4. Attach `venuesv.com` and `www.venuesv.com` in **Vercel → Domains**. Update
   the DNS records at your domain provider exactly as Vercel displays. Choose a
   single canonical domain (this project uses `https://venuesv.com`) and redirect
   `www` to it in Vercel.

## Configure Stripe webhook

In **Stripe Dashboard → Developers → Webhooks**, add this production endpoint:

```text
https://venuesv.com/api/stripe-webhook
```

Subscribe it to these events:

```text
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

Copy the endpoint's `whsec_...` signing secret into Vercel as
`STRIPE_WEBHOOK_SECRET`, then redeploy. The handler verifies Stripe's signature
against the unmodified request body before making any Supabase update.

## Test checklist

Use Stripe test mode first, with test-mode Vercel environment variables:

1. Sign up at `/`; receive a six-digit code; verify it; accept the agreements.
2. In Supabase, confirm the `public.users` row has `subscriptionStatus = trial`
   and a `trialEndsAt` timestamp roughly 14 days ahead.
3. Open `/subscribe`, sign in, and confirm the server-calculated venue count and
   weekly total appear.
4. Complete a test checkout. Confirm Stripe redirects to `/subscribe?success=1`.
5. In Vercel logs, confirm `/api/stripe-webhook` received the signed event; in
   Supabase confirm `subscriptionStatus`, `stripeSubscriptionId` and
   `venueCount` updated.
6. Open `/subscribe` again and test **Manage subscription** (Stripe portal).
7. Copy the files in `app-patches/` into the Expo repository and run its
   TypeScript and Expo web-export checks.

## Important: Firebase is still referenced by the Expo app

The website is Firebase-free, but the supplied Expo repository still calls
Firebase Cloud Function URLs for password reset, team-member invitations/removal,
team-member lookup and Stripe venue-quantity syncing. Search results include
`sendPasswordReset`, `inviteTeamMember`, `removeTeamMember`,
`getVenueTeamMembers`, `updateStripeSubscription` and
`updateStripeVenueCount`.

Do **not** delete the Firebase project until those endpoints are replaced with
Supabase Edge Functions or authenticated Vercel API routes, and old production
records have been migrated and reconciled.
