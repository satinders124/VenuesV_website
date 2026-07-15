import {
  adminClient,
  authenticatedUser,
  errorResponse,
  handleOptions,
  methodNotAllowed,
  setCors,
} from '../lib/server.js';
import { ensureMemberProfiles, getVenueAndCaller, memberResponse } from '../lib/team.js';

export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (handleOptions(req, res)) return;
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);

    const venueId = String(req.body?.venueId || '').trim();
    if (!venueId) {
      res.status(400).json({ error: 'venueId is required.' });
      return;
    }

    const user = await authenticatedUser(req);
    const { venue } = await getVenueAndCaller(user.id, venueId);
    const memberIds = venue.assignedUids || [];
    if (memberIds.length === 0) {
      res.status(200).json({ members: [] });
      return;
    }

    await ensureMemberProfiles(memberIds, venue);

    const { data, error } = await adminClient()
      .from('users')
      // Select the row then return an explicit safe allowlist below. This keeps
      // team listing compatible with existing projects that have not yet added
      // optional expoPushToken, billing or profile columns.
      .select('*')
      .in('uid', memberIds);
    if (error) throw error;

    const order = new Map(memberIds.map((id, index) => [id, index]));
    const members = (data || [])
      .map(memberResponse)
      .sort((left, right) => (order.get(left.uid) || 0) - (order.get(right.uid) || 0));

    res.status(200).json({ members });
  } catch (error) {
    errorResponse(res, error);
  }
}
