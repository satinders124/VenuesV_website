import {
  adminClient,
  authenticatedUser,
  errorResponse,
  handleOptions,
  methodNotAllowed,
  setCors,
  siteUrl,
} from '../lib/server.js';
import {
  addUserToVenue,
  findAuthUserByEmail,
  getVenueAndCaller,
  normalizeEmail,
  validInviteRole,
} from '../lib/team.js';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (handleOptions(req, res)) return;
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);

    const email = normalizeEmail(req.body?.email);
    const name = String(req.body?.name || '').trim();
    const role = String(req.body?.role || '').trim();
    const venueId = String(req.body?.venueId || '').trim();
    if (!EMAIL_PATTERN.test(email) || !name || !validInviteRole(role) || !venueId) {
      res.status(400).json({ error: 'A valid name, email, role and venue are required.' });
      return;
    }

    const caller = await authenticatedUser(req);
    const { venue } = await getVenueAndCaller(caller.id, venueId, { requireManager: true });

    let invitedUser = await findAuthUserByEmail(email);
    let existed = Boolean(invitedUser);
    if (!invitedUser) {
      const { data, error } = await adminClient().auth.admin.inviteUserByEmail(email, {
        data: { name, role, venue: venue.name },
        redirectTo: `${siteUrl()}/accept-invite`,
      });
      if (error) {
        // If race condition: user was created between list and invite, recover
        if (/already exists|already registered/i.test(error.message || '')) {
          invitedUser = await findAuthUserByEmail(email);
          if (invitedUser) {
            existed = true;
          } else {
            throw new Error('An account with this email already exists, but could not be found. Please try again.');
          }
        } else {
          throw error;
        }
      } else {
        if (!data.user) throw new Error('Supabase did not create the invited user.');
        invitedUser = data.user;
      }
    }

    await addUserToVenue({
      uid: invitedUser.id,
      email: invitedUser.email || email,
      name,
      role,
      venue,
    });

    res.status(200).json({
      success: true,
      uid: invitedUser.id,
      existed,
      inviteSent: !existed,
    });
  } catch (error) {
    errorResponse(res, error);
  }
}
