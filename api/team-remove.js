import {
  authenticatedUser,
  errorResponse,
  handleOptions,
  methodNotAllowed,
  setCors,
} from '../lib/server.js';
import { getVenueAndCaller, removeUserFromVenue } from '../lib/team.js';

export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (handleOptions(req, res)) return;
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);

    const targetUid = String(req.body?.targetUid || '').trim();
    const venueId = String(req.body?.venueId || '').trim();
    if (!targetUid || !venueId) {
      res.status(400).json({ error: 'targetUid and venueId are required.' });
      return;
    }

    const caller = await authenticatedUser(req);
    const { venue } = await getVenueAndCaller(caller.id, venueId, { requireManager: true });
    await removeUserFromVenue({ uid: targetUid, venue });

    res.status(200).json({ success: true });
  } catch (error) {
    errorResponse(res, error);
  }
}
