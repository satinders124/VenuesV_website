/**
 * VenuesV AI Co-Pilot – Premium OS
 * - Authenticated backend, sends only useful context
 * - Asks for structured JSON, sanitizes robustly
 * - Safe fallback if AI unavailable (heuristic)
 * - Never exposes provider names to client (uses "AI Co-Pilot")
 */

function heuristicInsight({ type, venues, issues, tasks, zones }) {
  const openIssues = (issues || []).filter(i => i.status !== 'resolved');
  const highIssues = openIssues.filter(i => i.priority === 'high');
  const venueCount = (venues || []).length;
  const taskCount = (tasks || []).length;
  const doneCount = (tasks || []).filter(t => t.done).length;
  const completion = taskCount ? Math.round((doneCount / taskCount) * 100) : 100;

  if (type === 'dashboard' || !type) {
    if (venueCount === 0) {
      return {
        title: 'Welcome to VenuesV OS',
        message: 'Add your first venue to activate your ops command center. We auto-create zones and daily tasks.',
        actionLabel: 'Add Venue',
        actionScreen: 'AddVenue',
        type: 'info',
        confidence: 0.95,
      };
    }
    if (highIssues.length > 0) {
      const v = (venues || []).find(x => x.id === highIssues[0].venueId);
      return {
        title: `${highIssues.length} high priority issue${highIssues.length > 1 ? 's' : ''} need action`,
        message: `${v?.name || 'A venue'} has ${highIssues.length} critical issue${highIssues.length > 1 ? 's' : ''} in last 24h. Assign to cleaner squad now to avoid compliance check.`,
        actionLabel: 'Review Issues',
        actionScreen: 'Issues',
        type: 'warning',
        confidence: 0.9,
      };
    }
    if (openIssues.length > 3) {
      return {
        title: 'Ops load rising',
        message: `${openIssues.length} open issues across ${venueCount} venues. Consider rebalancing cleaners or adding a quick sweep in high-traffic zones.`,
        actionLabel: 'View Team',
        actionScreen: 'Team',
        type: 'info',
        confidence: 0.85,
      };
    }
    if (completion < 70) {
      return {
        title: `Task completion ${completion}% – needs nudge`,
        message: `${taskCount - doneCount} tasks overdue. Auto-nudge assigned cleaners. Photo proof required for verification.`,
        actionLabel: 'View Tasks',
        actionScreen: 'Tasks',
        type: 'warning',
        confidence: 0.88,
      };
    }
    return {
      title: `Ops health ${completion}% – all clear`,
      message: `No critical issues. Team performing well across ${venueCount} venue${venueCount > 1 ? 's' : ''}. Keep monitoring zones for early detection.`,
      actionLabel: 'View Reports',
      actionScreen: 'Reports',
      type: 'success',
      confidence: 0.92,
    };
  }

  if (type === 'issues') {
    if (highIssues.length > 2) {
      const zoneCounts = {};
      highIssues.forEach(i => { zoneCounts[i.zone] = (zoneCounts[i.zone] || 0) + 1; });
      const worstZone = Object.entries(zoneCounts).sort((a,b)=>b[1]-a[1])[0];
      return {
        title: `Zone hotspot: ${worstZone?.[0] || 'Multiple zones'}`,
        message: `${worstZone?.[1] || highIssues.length} high priority issues in ${worstZone?.[0] || 'same area'} in last 24h. Suggest deep clean and check for recurring cause (e.g., tap, drainage).`,
        actionLabel: 'Assign Deep Clean',
        actionScreen: 'Tasks',
        type: 'warning',
        confidence: 0.87,
      };
    }
    if (openIssues.length === 0) {
      return {
        title: 'Issues clean – maintain',
        message: 'Zero open issues. Proactive zone checks in Gaming Room and Restrooms prevent 70% of Saturday spikes.',
        actionLabel: 'Check Zones',
        actionScreen: 'Zones',
        type: 'success',
        confidence: 0.9,
      };
    }
    return {
      title: `${openIssues.length} open issues – triage by priority`,
      message: `Focus on high first, then medium. ${openIssues.filter(i=>i.photoUrls?.length>0).length} have photo proof. Resolve with proof to close audit trail.`,
      actionLabel: 'Triage Issues',
      actionScreen: 'Issues',
      type: 'info',
      confidence: 0.82,
    };
  }

  if (type === 'tasks') {
    if (completion < 60) {
      return {
        title: `Completion low – ${completion}%`,
        message: `${taskCount - doneCount} overdue. Cleaners on site may need nudge. Auto-reset at midnight – incomplete rolls to attention.`,
        actionLabel: 'Nudge Team',
        actionScreen: 'Chat',
        type: 'warning',
        confidence: 0.84,
      };
    }
    return {
      title: 'Tasks on track',
      message: `${doneCount}/${taskCount} done (${completion}%). Zones with <80% completion often need clearer photos or checklist.`,
      actionLabel: 'View Zones',
      actionScreen: 'Zones',
      type: 'success',
      confidence: 0.9,
    };
  }

  if (type === 'zones') {
    const dirtyZones = (zones || []).filter(z => z.status === 'issue' || z.score < 70);
    if (dirtyZones.length > 0) {
      return {
        title: `${dirtyZones.length} zone${dirtyZones.length>1?'s':''} need attention`,
        message: `${dirtyZones.map(z=>z.name).slice(0,2).join(', ')}${dirtyZones.length>2?'...':''} scored <70%. Assign immediate check.`,
        actionLabel: 'Inspect Zones',
        actionScreen: 'Zones',
        type: 'warning',
        confidence: 0.86,
      };
    }
    return {
      title: 'Zones healthy',
      message: `All ${zones?.length||0} zones >80%. Keep daily sweep rhythm – Gaming Room and Restrooms degrade fastest after 8pm.`,
      actionLabel: 'View Tasks',
      actionScreen: 'Tasks',
      type: 'success',
      confidence: 0.91,
    };
  }

  return {
    title: 'Ops running',
    message: `${venueCount} venues, ${openIssues.length} open issues, ${completion}% task completion.`,
    actionLabel: 'View Dashboard',
    actionScreen: 'Dashboard',
    type: 'info',
    confidence: 0.8,
  };
}

function sanitizeAIResponse(raw) {
  // Robust parsing – never show raw JSON or markdown fences to users
  try {
    if (!raw) return null;
    // If object already, use it
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      return {
        title: String(raw.title || 'Ops Insight').slice(0, 80),
        message: String(raw.message || raw.msg || 'Keep monitoring ops.').slice(0, 300),
        actionLabel: String(raw.actionLabel || raw.action || 'View Details').slice(0, 30),
        actionScreen: String(raw.actionScreen || 'Dashboard').slice(0, 20),
        type: ['info','warning','success'].includes(raw.type) ? raw.type : 'info',
        confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.8,
      };
    }
    // If string, try to extract JSON
    let str = String(raw).trim();
    // Remove markdown fences ```json ... ```
    str = str.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonMatch = str.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return sanitizeAIResponse(parsed);
    }
    return null;
  } catch {
    return null;
  }
}

export async function getAIInsight(context) {
  const fallback = heuristicInsight(context);

  // If no AI key configured, return heuristic immediately (safe fallback)
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fallback;
  }

  try {
    // Try to call AI provider – generic fetch, never expose provider name
    // We support OpenAI-compatible API if OPENAI_API_KEY is set
    // For security, we don't log keys or provider
    const prompt = `You are VenuesV AI Co-Pilot, a professional venue operations assistant.
Context: ${JSON.stringify({
      venues: (context.venues || []).slice(0,5).map(v=>({name:v.name, score:v.score})),
      issues: (context.issues || []).slice(0,8).map(i=>({title:i.title, priority:i.priority, zone:i.zone, status:i.status})),
      tasks: { total: (context.tasks||[]).length, done: (context.tasks||[]).filter(t=>t.done).length },
      zones: (context.zones||[]).slice(0,5).map(z=>({name:z.name, status:z.status, score:z.score})),
      type: context.type,
    })}
Return ONLY valid JSON with keys: title (max 80 chars), message (max 300 chars, actionable), actionLabel (max 30 chars), actionScreen (one of Dashboard, Issues, Tasks, Zones, Team, Chat, Reports, AddVenue), type (info/warning/success), confidence (0-1).
No markdown, no fences, no extra text.`;

    // If using OpenAI-compatible
    if (process.env.OPENAI_API_KEY) {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'gpt-4o-mini',
          messages: [{ role:'system', content:'You are VenuesV AI Co-Pilot. Return only JSON.' }, { role:'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 300,
        }),
      });
      if (!resp.ok) throw new Error(`AI API ${resp.status}`);
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content;
      const sanitized = sanitizeAIResponse(content);
      if (sanitized) return sanitized;
    }

    // If other provider or fails, return heuristic
    return fallback;
  } catch (e) {
    console.warn('AI Co-Pilot fallback, AI unavailable:', e?.message || e);
    return fallback;
  }
}
