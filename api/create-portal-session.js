import {
  authenticatedUser,
  errorResponse,
  handleOptions,
  methodNotAllowed,
  ownerProfile,
  setCors,
  siteUrl,
  stripeClient,
} from '../lib/server.js';

export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (handleOptions(req, res)) return;
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);

    const user = await authenticatedUser(req);
    const profile = await ownerProfile(user.id);
    if (!profile.stripeCustomerId) {
      const error = new Error('No Stripe customer was found for this account.');
      error.statusCode = 404;
      throw error;
    }

    const portal = await stripeClient().billingPortal.sessions.create({
      customer: profile.stripeCustomerId,
      return_url: `${siteUrl()}/subscribe`,
    });
    res.status(200).json({ url: portal.url });
  } catch (error) {
    errorResponse(res, error);
  }
}
