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

export async function getVenueAndCaller(callerId, venueId, { requireManager = false } = {}) {
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
  if (requireManager && !['owner', 'manager'].includes(caller.role)) {
    const error = new Error('Only owners and site managers can manage team members.');
    error.statusCode = 403;
    throw error;
  }

  const assignedUids = Array.isArray(venue.assignedUids) ? venue.assignedUids : [];
  // Robust comparison: both sides as strings (uuid vs text[] storage)
  const callerStr = String(callerId);
  const ownerStr = String(venue.ownerId);
  const hasVenueAccess = ownerStr === callerStr || assignedUids.map(String).includes(callerStr);
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
    ? existingProfile.venues.filter(Boolean)
    : existingProfile?.venue ? [existingProfile.venue] : [];
  // Deduplicate by name, case-insensitive trim
  const normalizedCurrent = currentVenues.map(v => String(v).trim()).filter(Boolean);
  if (!normalizedCurrent.map(v => v.toLowerCase()).includes(String(venue.name).trim().toLowerCase())) {
    normalizedCurrent.push(String(venue.name).trim());
  }

  // Use the invited role. Previously the auth trigger hardcoded role = 'owner',
  // which meant every invited person appeared as an owner and was invisible to
  // the team screen. The trigger has been fixed to read role from metadata, so
  // the invitation is now authoritative. If a profile was created before the
  // trigger fix, we still override so previously-buggy members become visible.
  // Also, if existing is owner but they own no venues, force invited role.
  let effectiveRole = role;
  if (existingProfile?.role === 'owner') {
    // Check if this uid owns any venue
    const { data: owned } = await supabase.from('venues').select('id').eq('ownerId', uid).limit(1);
    if (!owned || owned.length === 0) {
      effectiveRole = role; // repair buggy owner -> invited role
    } else {
      // User already owns venues elsewhere - prevent hijacking owner into staff
      // But if this invite is for same business (venue.ownerId owns target), allow role override?
      // For safety, keep owner role only if they are being added to a venue they already own
      if (String(venue.ownerId) !== String(uid)) {
        effectiveRole = role;
      }
    }
  }

  const { data: savedProfile, error: upsertError } = await supabase.from('users').upsert({
    uid,
    name: existingProfile?.name?.trim() || String(name || '').trim() || 'Team member',
    email: existingProfile?.email || String(email || '').toLowerCase().trim(),
    role: effectiveRole,
    venue: normalizedCurrent[0] || String(venue.name).trim(),
    venues: normalizedCurrent,
  }, { onConflict: 'uid' }).select('uid').single();
  if (upsertError) throw upsertError;
  if (!savedProfile || String(savedProfile.uid) !== String(uid)) {
    throw new Error('Could not create the invited team member profile.');
  }

  const assignedUids = Array.from(new Set([...(venue.assignedUids || []).map(String), String(uid)]));
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

// Repairs an incomplete legacy/team invitation and fixes buggy owner roles
// that made members invisible in Team screen.
// - If assignedUids contains uid with no profile, create profile from auth metadata
// - If profile exists but role=owner and they own no venues, repair to metadata role
export async function ensureMemberProfiles(memberIds, venue) {
  const supabase = adminClient();
  const { data: profiles, error } = await supabase
    .from('users')
    .select('uid, role')
    .in('uid', memberIds);
  if (error) throw error;

  const profileMap = new Map((profiles || []).map(p => [String(p.uid), p]));
  const knownIds = new Set(profileMap.keys());

  for (const uid of memberIds) {
    const uidStr = String(uid);
    const existing = profileMap.get(uidStr);

    // Case 1: No profile at all -> create from auth
    if (!knownIds.has(uidStr)) {
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
        name: String(metadata.name || metadata.full_name || 'Team member'),
        role,
        venue,
      });
      continue;
    }

    // Case 2: Profile exists but role is buggy owner -> repair if they own no venues
    if (existing && existing.role === 'owner') {
      const { data: owned } = await supabase.from('venues').select('id').eq('ownerId', uid).limit(1);
      if (!owned || owned.length === 0) {
        const { data: authData } = await supabase.auth.admin.getUserById(uid);
        const metaRole = authData?.user?.user_metadata?.role;
        if (validInviteRole(metaRole)) {
          await supabase.from('users').update({ role: metaRole }).eq('uid', uid);
          console.log(`Repaired buggy owner role for ${uid} -> ${metaRole}`);
        }
      }
    }
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
