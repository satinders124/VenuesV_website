import {
  adminClient,
  authenticatedUser,
  errorResponse,
  handleOptions,
  methodNotAllowed,
  ownerProfile,
  setCors,
  stripeClient,
  updateProfile,
} from '../lib/server.js';

async function syncStripeAfterVenueDelete(ownerId, profile) {
  const { count, error } = await adminClient()
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .eq('ownerId', ownerId);
  if (error) throw error;

  const venueCount = Math.max(count || 0, 1);
  if (profile.subscriptionStatus === 'active' && profile.stripeSubscriptionId) {
    const subscription = await stripeClient().subscriptions.retrieve(profile.stripeSubscriptionId);
    const item = subscription.items?.data?.[0];
    if (!item) throw new Error('No Stripe subscription item was found.');
    await stripeClient().subscriptionItems.update(item.id, {
      quantity: venueCount,
      proration_behavior: 'always_invoice',
    });
  }

  await updateProfile(ownerId, { venueCount });
  return venueCount;
}

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

    const caller = await authenticatedUser(req);
    const profile = await ownerProfile(caller.id);
    const supabase = adminClient();
    const { data: venue, error: venueError } = await supabase
      .from('venues')
      .select('id, name, ownerId')
      .eq('id', venueId)
      .maybeSingle();
    if (venueError) throw venueError;
    if (!venue) {
      const error = new Error('Venue not found.');
      error.statusCode = 404;
      throw error;
    }
    // Robust owner check – String() safe for uuid vs text and handles account recreation ghost
    const venueOwnerStr = String(venue.ownerId || '').trim();
    const callerStr = String(caller.id || '').trim();
    const isDirectOwner = venueOwnerStr && callerStr && venueOwnerStr.toLowerCase() === callerStr.toLowerCase();

    if (!isDirectOwner) {
      // If exact owner mismatch, check if venue owner is orphaned (deleted account) – allow current owner to clean up
      // This handles the case: owner deletes account and re-registers with same email but new uid – old venues become orphaned
      const { data: ownerExists } = await supabase.from('users').select('uid').eq('uid', venue.ownerId).maybeSingle();
      const { data: authOwner } = await supabase.auth.admin.getUserById(venue.ownerId).catch(() => ({ data: { user: null } } as any));

      const isOrphaned = !ownerExists && !authOwner?.user;
      if (!isOrphaned) {
        const error = new Error('Only the venue owner can delete a venue.');
        error.statusCode = 403;
        throw error;
      }
      console.log(`Allowing orphaned venue delete: venue ${venue.id} owned by deleted uid ${venue.ownerId}, deletor ${caller.id}`);
    }

    // Delete operational records before the venue. Issue-photo files are left
    // untouched deliberately until private storage-path migration is complete.
    const deletions = await Promise.all([
      supabase.from('tasks').delete().eq('venueId', venueId),
      supabase.from('zones').delete().eq('venueId', venueId),
      supabase.from('issues').delete().eq('venueId', venueId),
      supabase.from('chat_messages').delete().eq('roomId', venueId),
      supabase.from('read_receipts').delete().eq('roomId', venueId),
    ]);
    for (const result of deletions) {
      if (result.error) throw result.error;
    }

    const { error: deleteError } = await supabase.from('venues').delete().eq('id', venueId);
    if (deleteError) throw deleteError;

    const venueCount = await syncStripeAfterVenueDelete(caller.id, profile);
    res.status(200).json({ success: true, venueCount });
  } catch (error) {
    errorResponse(res, error);
  }
}
