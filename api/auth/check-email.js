import { adminClient, errorResponse, handleOptions, methodNotAllowed, setCors } from '../../lib/server.js';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const USERS_PER_PAGE = 200;
const MAX_PAGES = 25;

/**
 * Checks whether an email already has a Venues V Auth account before the public
 * registration form starts its OTP flow. The service-role key remains server-only.
 *
 * Add Cloudflare Turnstile before high-volume public launch to prevent automated
 * account enumeration/abuse; see README.md.
 */
export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (handleOptions(req, res)) return;
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);

    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    const supabase = adminClient();
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: USERS_PER_PAGE,
      });
      if (error) throw error;

      const users = data.users || [];
      if (users.some((user) => user.email?.trim().toLowerCase() === email)) {
        res.status(200).json({ exists: true });
        return;
      }
      if (users.length < USERS_PER_PAGE) break;
    }

    res.status(200).json({ exists: false });
  } catch (error) {
    errorResponse(res, error);
  }
}
