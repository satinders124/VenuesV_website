import { adminClient, errorResponse, requiredEnv, stripeClient, updateProfile } from '../lib/server.js';

export const config = {
  api: { bodyParser: false },
};

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function findUserId(customerId, metadata = {}) {
  if (metadata.supabaseUserId) return metadata.supabaseUserId;
  if (!customerId) return null;

  const { data, error } = await adminClient()
    .from('users')
    .select('uid')
    .eq('stripeCustomerId', String(customerId))
    .maybeSingle();
  if (error) throw error;
  return data?.uid || null;
}

async function syncSubscription(subscription) {
  const userId = await findUserId(subscription.customer, subscription.metadata);
  if (!userId) {
    console.warn(`Stripe subscription ${subscription.id} has no Venues V user mapping.`);
    return;
  }

  const item = subscription.items?.data?.[0];
  const venueCount = Math.max(Number(item?.quantity || subscription.quantity || 1), 1);
  const periodEnd = item?.current_period_end || subscription.current_period_end;
  const values = {
    subscriptionStatus: subscription.status === 'active' ? 'active' : subscription.status,
    stripeSubscriptionId: subscription.id,
    stripeStatus: subscription.status,
    venueCount,
  };
  if (periodEnd) values.subscriptionEndsAt = new Date(periodEnd * 1000).toISOString();

  await updateProfile(userId, values);
}

async function markInvoice(invoice, successful) {
  const userId = await findUserId(invoice.customer);
  if (!userId) return;

  await updateProfile(userId, successful
    ? { subscriptionStatus: 'active', lastPaymentAt: new Date().toISOString() }
    : { subscriptionStatus: 'payment_failed', stripeStatus: 'past_due' });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      res.status(400).json({ error: 'Missing Stripe signature.' });
      return;
    }

    const payload = await rawBody(req);
    const event = stripeClient().webhooks.constructEvent(
      payload,
      signature,
      requiredEnv('STRIPE_WEBHOOK_SECRET'),
    );

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await syncSubscription(event.data.object);
        break;
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = await findUserId(subscription.customer, subscription.metadata);
        if (userId) {
          await updateProfile(userId, {
            subscriptionStatus: 'expired',
            stripeStatus: 'canceled',
            stripeSubscriptionId: subscription.id,
          });
        }
        break;
      }
      case 'invoice.payment_succeeded':
        await markInvoice(event.data.object, true);
        break;
      case 'invoice.payment_failed':
        await markInvoice(event.data.object, false);
        break;
      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (error) {
    errorResponse(res, error);
  }
}
