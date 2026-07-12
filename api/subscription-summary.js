import {
  authenticatedUser,
  errorResponse,
  handleOptions,
  methodNotAllowed,
  ownerProfile,
  setCors,
  venueCountForOwner,
} from '../lib/server.js';

export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (handleOptions(req, res)) return;
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET', 'OPTIONS']);

    const user = await authenticatedUser(req);
    const profile = await ownerProfile(user.id);
    const venueCount = await venueCountForOwner(user.id);

    res.status(200).json({
      email: profile.email || user.email,
      name: profile.name || '',
      subscriptionStatus: profile.subscriptionStatus || 'trial',
      stripeSubscriptionId: profile.stripeSubscriptionId || null,
      venueCount,
    });
  } catch (error) {
    errorResponse(res, error);
  }
}
