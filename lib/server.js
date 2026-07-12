import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function siteUrl() {
  return requiredEnv('SITE_URL').replace(/\/$/, '');
}

export function adminClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function stripeClient() {
  return new Stripe(requiredEnv('STRIPE_SECRET_KEY'));
}

export function setCors(req, res) {
  const origin = req.headers.origin;
  const allowlist = (process.env.ALLOWED_ORIGINS || siteUrl())
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (origin && allowlist.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

export function handleOptions(req, res) {
  if (req.method !== 'OPTIONS') return false;
  res.status(204).end();
  return true;
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ error: 'Method not allowed' });
}

export async function authenticatedUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    const error = new Error('Sign in is required.');
    error.statusCode = 401;
    throw error;
  }

  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) {
    const authError = new Error('Your session is invalid or has expired.');
    authError.statusCode = 401;
    throw authError;
  }
  return data.user;
}

export async function ownerProfile(userId) {
  const { data, error } = await adminClient()
    .from('users')
    .select('uid, name, email, role, subscriptionStatus, stripeCustomerId, stripeSubscriptionId, stripeStatus, venueCount')
    .eq('uid', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const profileError = new Error('Your Venues V profile could not be found.');
    profileError.statusCode = 404;
    throw profileError;
  }
  if (data.role !== 'owner') {
    const roleError = new Error('Only venue owners can manage a subscription.');
    roleError.statusCode = 403;
    throw roleError;
  }
  return data;
}

export async function venueCountForOwner(userId) {
  const { count, error } = await adminClient()
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .eq('ownerId', userId);

  if (error) throw error;
  return Math.max(count || 0, 1);
}

export async function updateProfile(userId, values) {
  const { error } = await adminClient().from('users').update(values).eq('uid', userId);
  if (error) throw error;
}

export function errorResponse(res, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: status >= 500 ? 'An unexpected server error occurred.' : error.message,
  });
}
