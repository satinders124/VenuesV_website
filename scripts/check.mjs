import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const requiredFiles = [
  'public/index.html',
  'public/privacy.html',
  'public/terms.html',
  'public/subscribe.html',
  'public/accept-invite.html',
  'public/icon.png',
  'public/js/supabase-config.js',
  'public/js/signup.js',
  'public/js/subscribe.js',
  'public/js/accept-invite.js',
  'api/auth/check-email.js',
  'api/team-members.js',
  'api/team-invite.js',
  'api/team-remove.js',
  'api/subscription-summary.js',
  'api/create-checkout-session.js',
  'api/create-portal-session.js',
  'api/stripe-webhook.js',
  'lib/server.js',
  'lib/team.js',
  'supabase/migrations/20260712_website_signup_and_billing.sql',
];

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(root, relativePath))) {
    throw new Error(`Required file is missing: ${relativePath}`);
  }
}

const scripts = [
  'public/js/supabase-config.js',
  'public/js/signup.js',
  'public/js/subscribe.js',
  'public/js/accept-invite.js',
  'api/auth/check-email.js',
  'api/team-members.js',
  'api/team-invite.js',
  'api/team-remove.js',
  'api/subscription-summary.js',
  'api/create-checkout-session.js',
  'api/create-portal-session.js',
  'api/stripe-webhook.js',
  'lib/server.js',
  'lib/team.js',
];
for (const relativePath of scripts) {
  execFileSync(process.execPath, ['--check', path.join(root, relativePath)], { stdio: 'inherit' });
}

const publicFiles = readdirSync(path.join(root, 'public'), { recursive: true })
  .filter((entry) => String(entry).endsWith('.html') || String(entry).endsWith('.js'))
  .map((entry) => path.join(root, 'public', entry));
const publicSource = publicFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const retiredFirebaseReferences = /firebase|firestore|venuev-b24c2|cloudfunctions\.net|\.run\.app/i;
if (retiredFirebaseReferences.test(publicSource)) {
  throw new Error('A Firebase endpoint or SDK reference remains in public website code.');
}

const index = readFileSync(path.join(root, 'public/index.html'), 'utf8');
const subscribe = readFileSync(path.join(root, 'public/subscribe.html'), 'utf8');
const sql = readFileSync(path.join(root, 'supabase/migrations/20260712_website_signup_and_billing.sql'), 'utf8');
if (!index.includes('/js/signup.js') || !index.includes('supabase.js')) {
  throw new Error('Landing page is not wired to the Supabase signup client.');
}
const signup = readFileSync(path.join(root, 'public/js/signup.js'), 'utf8');
if (!signup.includes('signInWithOtp') || !signup.includes("type: 'email'")) {
  throw new Error('Landing signup must use the Email OTP flow.');
}
if (!subscribe.includes('/js/subscribe.js') || !subscribe.includes('supabase.js')) {
  throw new Error('Subscription page is not wired to the Supabase client.');
}
if (!sql.includes('complete_owner_trial_signup') || !sql.includes('handle_new_venuesv_user')) {
  throw new Error('Required Supabase profile/trial functions are missing.');
}

console.log('Static checks passed: required files, JavaScript syntax and Firebase-removal checks.');
