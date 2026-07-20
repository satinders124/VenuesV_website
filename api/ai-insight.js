import { adminClient, authenticatedUser, errorResponse, handleOptions, methodNotAllowed, setCors } from '../lib/server.js';
import { getAIInsight } from '../lib/ai.js';

export default async function handler(req, res) {
  try {
    setCors(req, res);
    if (handleOptions(req, res)) return;
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST', 'OPTIONS']);

    const user = await authenticatedUser(req);
    const { venueId, type } = req.body || {};

    const supabase = adminClient();

    // Fetch venues user has access to (RLS bypass via admin, but we filter manually for security)
    const { data: allVenues } = await supabase.from('venues').select('*').limit(30);
    const filteredVenues = (allVenues || []).filter(v => {
      const ownerMatch = String(v.ownerId) === String(user.id);
      const assigned = Array.isArray(v.assignedUids) ? v.assignedUids.map(String).includes(String(user.id)) : false;
      return ownerMatch || assigned;
    });

    // If venueId specified, verify access
    let targetVenues = filteredVenues;
    if (venueId) {
      targetVenues = filteredVenues.filter(v => String(v.id) === String(venueId));
      if (targetVenues.length === 0) {
        const err = new Error('Venue not found or no access.');
        err.statusCode = 404;
        throw err;
      }
    }

    const venueIds = targetVenues.map(v => v.id).slice(0, 10);

    // Fetch related data for AI context – only for venues user can access
    const [issuesRes, tasksRes, zonesRes] = await Promise.all([
      venueIds.length ? supabase.from('issues').select('id, title, zone, priority, status, venueId, createdAt, photoUrls').in('venueId', venueIds).order('createdAt', { ascending: false }).limit(20) : { data: [] },
      venueIds.length ? supabase.from('tasks').select('id, title, zone, done, venueId, frequency, priority').in('venueId', venueIds).limit(20) : { data: [] },
      venueIds.length ? supabase.from('zones').select('id, name, status, score, venueId').in('venueId', venueIds).limit(20) : { data: [] },
    ]);

    const insight = await getAIInsight({
      type: type || 'dashboard',
      venues: targetVenues,
      issues: issuesRes.data || [],
      tasks: tasksRes.data || [],
      zones: zonesRes.data || [],
    });

    // Log usage for analytics without exposing sensitive data
    console.log(`AI insight for ${user.id} type=${type} venues=${venueIds.length} confidence=${insight.confidence}`);

    res.status(200).json(insight);
  } catch (error) {
    errorResponse(res, error);
  }
}
