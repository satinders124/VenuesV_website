import { adminClient } from './server.js';

const INVITABLE_ROLES = new Set(['manager', 'cleaner', 'staff']);

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function validInviteRole(value) {
  return INVITABLE_ROLES.has(value);
}

export async function findAuthUserByEmail(email) {
  const normalized = normalizeEmail(email);
  const supabase = adminClient();
  const perPage = 200;

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = (data.users || []).find((candidate) => candidate.email?.trim().toLowerCase() === normalized);
    if (user) return user;
    if ((data.users || []).length < perPage) return null;
  }

  return null;
}

export async function getVenueAndCaller(callerId, venueId) {
  const supabase = adminClient();
  const [{ data: caller, error: callerError }, { data: venue, error: venueError }] = await Promise.all([
    supabase.from('users').select('uid, role').eq('uid', callerId).maybeSingle(),
    supabase.from('venues').select('id, name, ownerId, assignedUids').eq('id', venueId).maybeSingle(),
  ]);

  if (callerError) throw callerError;
  if (venueError) throw venueError;
  if (!caller || !venue) {
    const error = new Error(!caller ? 'Your Venues V profile could not be found.' : 'Venue not found.');
    error.statusCode = 404;
    throw error;
  }
  if (!['owner', 'manager'].includes(caller.role)) {
    const error = new Error('Only owners and site managers can manage team members.');
    error.statusCode = 403;
    throw error;
  }

  const assignedUids = Array.isArray(venue.assignedUids) ? venue.assignedUids : [];
  const hasVenueAccess = venue.ownerId === callerId || assignedUids.includes(callerId);
  if (!hasVenueAccess) {
    const error = new Error('You are not authorised to manage this venue team.');
    error.statusCode = 403;
    throw error;
  }

  return { caller, venue: { ...venue, assignedUids } };
}

export async function addUserToVenue({ uid, email, name, role, venue }) {
  const supabase = adminClient();
  const { data: existingProfile, error: profileError } = await supabase
    .from('users')
    .select('uid, name, email, role, venue, venues')
    .eq('uid', uid)
    .maybeSingle();
  if (profileError) throw profileError;

  const currentVenues = Array.isArray(existingProfile?.venues)
    ? existingProfile.venues
    : existingProfile?.venue ? [existingProfile.venue] : [];
  if (!currentVenues.includes(venue.name)) currentVenues.push(venue.name);

  // Never demote an existing venue owner through an invitation action.
  const effectiveRole = existingProfile?.role === 'owner' ? 'owner' : role;
  const { error: upsertError } = await supabase.from('users').upsert({
    uid,
    name: existingProfile?.name || name,
    email: existingProfile?.email || email,
    role: effectiveRole,
    venue: currentVenues[0] || venue.name,
    venues: currentVenues,
  }, { onConflict: 'uid' });
  if (upsertError) throw upsertError;

  const assignedUids = Array.from(new Set([...(venue.assignedUids || []), uid]));
  const { error: venueError } = await supabase
    .from('venues')
    .update({ assignedUids })
    .eq('id', venue.id);
  if (venueError) throw venueError;
}

export async function removeUserFromVenue({ uid, venue }) {
  const supabase = adminClient();
  if (venue.ownerId === uid) {
    const error = new Error('The venue owner cannot be removed from the venue team.');
    error.statusCode = 400;
    throw error;
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('uid, venue, venues')
    .eq('uid', uid)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    const error = new Error('Team member not found.');
    error.statusCode = 404;
    throw error;
  }

  const currentVenues = Array.isArray(profile.venues) ? profile.venues : profile.venue ? [profile.venue] : [];
  const venues = currentVenues.filter((name) => name !== venue.name);
  const { error: userError } = await supabase
    .from('users')
    .update({ venues, venue: venues[0] || '' })
    .eq('uid', uid);
  if (userError) throw userError;

  const assignedUids = (venue.assignedUids || []).filter((memberId) => memberId !== uid);
  const { error: venueError } = await supabase
    .from('venues')
    .update({ assignedUids })
    .eq('id', venue.id);
  if (venueError) throw venueError;
}

// Repairs an incomplete legacy/team invitation only when the authenticated
// server can prove the auth user is already assigned to this venue. This avoids
// orphaned assignedUids entries that otherwise make a member invisible in-app.
export async function ensureMemberProfiles(memberIds, venue) {
  const supabase = adminClient();
  const { data: profiles, error } = await supabase
    .from('users')
    .select('uid')
    .in('uid', memberIds);
  if (error) throw error;

  const knownIds = new Set((profiles || []).map((profile) => String(profile.uid)));
  for (const uid of memberIds) {
    if (knownIds.has(String(uid))) continue;

    const { data, error: authError } = await supabase.auth.admin.getUserById(uid);
    if (authError || !data.user) {
      console.warn(`Assigned team uid ${uid} has no matching Supabase auth user.`);
      continue;
    }

    const metadata = data.user.user_metadata || {};
    const role = validInviteRole(metadata.role) ? metadata.role : 'staff';
    await addUserToVenue({
      uid: data.user.id,
      email: data.user.email || '',
      name: String(metadata.name || data.user.user_metadata?.full_name || 'Team member'),
      role,
      venue,
    });
  }
}

export function memberResponse(profile) {
  return {
    id: profile.uid,
    uid: profile.uid,
    name: profile.name || '',
    email: profile.email || '',
    role: profile.role || 'staff',
    venue: profile.venue || '',
    venues: Array.isArray(profile.venues) ? profile.venues : [],
    expoPushToken: profile.expoPushToken || '',
  };
}
