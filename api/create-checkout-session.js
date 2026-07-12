import {
  authenticatedUser,
  errorResponse,
  handleOptions,
  methodNotAllowed,
  ownerProfile,
  requiredEnv,
  setCors,
  siteUrl,
  stripeClient,
  updateProfile,
  venueCountForOwner,
} from '../lib/server.js';

export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (handleOptions(req, res)) return;
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);

    const user = await authenticatedUser(req);
    const profile = await ownerProfile(user.id);
    const stripe = stripeClient();
    const venueCount = await venueCountForOwner(user.id);

    let customerId = profile.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || user.email,
        name: profile.name || undefined,
        metadata: { supabaseUserId: user.id },
      });
      customerId = customer.id;
      await updateProfile(user.id, { stripeCustomerId: customerId });
    }

    const checkout = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: user.id,
      mode: 'subscription',
      line_items: [{
        price: requiredEnv('STRIPE_WEEKLY_PRICE_ID'),
        quantity: venueCount,
        adjustable_quantity: { enabled: false },
      }],
      metadata: { supabaseUserId: user.id },
      subscription_data: {
        metadata: { supabaseUserId: user.id, venueCount: String(venueCount) },
      },
      success_url: `${siteUrl()}/subscribe?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/subscribe?cancelled=true`,
    });

    if (!checkout.url) throw new Error('Stripe did not return a checkout URL.');
    res.status(200).json({ url: checkout.url });
  } catch (error) {
    errorResponse(res, error);
  }
}
