import {
  adminClient,
  authenticatedUser,
  errorResponse,
  handleOptions,
  methodNotAllowed,
  setCors,
  stripeClient,
  updateProfile,
} from '../lib/server.js';

/**
 * POST /api/sync-venue-count
 *
 * Called after adding a venue to sync the Stripe subscription quantity.
 * Authenticated server-only — no Firebase needed.
 */
export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (handleOptions(req, res)) return;
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);

    const caller = await authenticatedUser(req);

    // Count venues for this owner
    const { count, error } = await adminClient()
      .from('venues')
      .select('id', { count: 'exact', head: true })
      .eq('ownerId', caller.id);
    if (error) throw error;

    const venueCount = Math.max(count || 0, 1);

    // Load profile to check subscription status
    const { data: profile, error: profileError } = await adminClient()
      .from('users')
      .select('subscriptionStatus, stripeSubscriptionId')
      .eq('uid', caller.id)
      .maybeSingle();
    if (profileError) throw profileError;

    // If the owner has an active subscription, update the Stripe quantity
    if (profile?.subscriptionStatus === 'active' && profile?.stripeSubscriptionId) {
      const subscription = await stripeClient().subscriptions.retrieve(profile.stripeSubscriptionId);
      const item = subscription.items?.data?.[0];
      if (item) {
        await stripeClient().subscriptionItems.update(item.id, {
          quantity: venueCount,
          proration_behavior: 'always_invoice',
        });
      }
    }

    // Update the cached venue count on the profile
    await updateProfile(caller.id, { venueCount });

    res.status(200).json({ success: true, venueCount });
  } catch (error) {
    errorResponse(res, error);
  }
}
