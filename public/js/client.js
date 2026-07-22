(() => {
  const supabase = () => window.venuesvSupabase;
  let currentUser = null;
  let profile = null;
  let venues = [];
  let members = [];
  let currentTab = 'overview';

  const $ = (id) => document.getElementById(id);
  const showErr = (msg) => { const el = $('authError'); if (el){ el.textContent = msg; el.style.display='block'; } };
  const clearErr = () => { const el = $('authError'); if (el) el.style.display='none'; };

  async function checkAuth(){
    const { data } = await supabase().auth.getSession();
    if (data.session?.user){ currentUser = data.session.user; await loadProfile(); showDash(); } else showAuth();
  }

  async function loadProfile(){
    try{
      const { data } = await supabase().from('users').select('*').eq('uid', currentUser.id).maybeSingle();
      profile = data || { name: currentUser.email?.split('@')[0]||'Owner', email: currentUser.email, role:'owner', venueCount:1, subscriptionStatus:'trial', trialEndsAt: new Date(Date.now()+14*864e5).toISOString() };
      $('userName').textContent = profile.name || profile.email;
      $('userEmail').textContent = profile.email || currentUser.email;
      $('userAvatar').textContent = (profile.name||profile.email||'O').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      $('roleBadge').textContent = (profile.role||'owner').toUpperCase();
      const days = profile.trialEndsAt ? Math.ceil((new Date(profile.trialEndsAt).getTime()-Date.now())/864e5) : 14;
      $('trialPill').textContent = profile.subscriptionStatus==='active' ? `Active • ${profile.venueCount||venues.length||1} venues • $${((profile.venueCount||1)*19.95).toFixed(2)}/w` : `Trial ${days>0?days:0}d left • 2 venues max`;
      // top sub
      const topSub = $('topSub');
      if (topSub) topSub.textContent = `${venues.length||0} venues • ${profile.subscriptionStatus||'trial'} • OS v1.0 • ${profile.role||'owner'}`;
    }catch(e){ console.log(e); }
  }

  window.signIn = async ()=>{
    clearErr();
    const email = ($('email').value||'').trim().toLowerCase();
    const password = $('password').value||'';
    if (!email||!password){ showErr('Enter email and password'); return; }
    const btn = $('signInBtn'); btn.disabled=true; btn.textContent='Signing in...';
    const { data, error } = await supabase().auth.signInWithPassword({ email, password });
    if (error){ showErr(error.message); btn.disabled=false; btn.textContent='Sign in to Client OS →'; return; }
    currentUser = data.user || data.session?.user;
    await loadProfile(); showDash(); btn.disabled=false;
  };

  window.signOut = async ()=>{ try{ await supabase().auth.signOut(); }catch{} currentUser=null; profile=null; showAuth(); };

  function showAuth(){ $('authScreen').style.display='block'; $('sidebar').style.display='none'; $('main').style.display='none'; }
  function showDash(){ $('authScreen').style.display='none'; $('sidebar').style.display='flex'; $('main').style.display='flex'; fetchVenues(); setupNav(); openTab('overview'); }

  function setupNav(){ document.querySelectorAll('.nav-item').forEach(el=>{ el.onclick = ()=> openTab(el.dataset.tab); }); }

  window.openTab = async (tab)=>{
    currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(el=> el.classList.toggle('active', el.dataset.tab===tab));
    const titles = { overview:'Overview • Command Center', venues:'Venues • RLS Secured', team:'Team • OS', tasks:'Tasks • Auto-reset', issues:'Issues • Photo Proof', zones:'Zones • Health', chat:'Chat • Group + DM', billing:'Billing • Stripe OS', reports:'Reports • Analytics' };
    $('topTitle').textContent = titles[tab]||tab;
    if (tab==='overview') await renderOverview();
    if (tab==='venues') await renderVenues();
    if (tab==='team') await renderTeam();
    if (tab==='tasks') await renderTasks();
    if (tab==='issues') await renderIssues();
    if (tab==='zones') await renderZones();
    if (tab==='chat') await renderChat();
    if (tab==='billing') await renderBilling();
    if (tab==='reports') renderReports();
  };

  async function fetchVenues(){
    try{
      const { data, error } = await supabase().from('venues').select('*');
      if (error) throw error;
      venues = data||[];
      const vb=$('venueBadge'); if(vb) vb.textContent = venues.length;
      const tb=$('trialPill'); if(tb && profile){ const days = profile.trialEndsAt ? Math.ceil((new Date(profile.trialEndsAt).getTime()-Date.now())/864e5) : 14; tb.textContent = profile.subscriptionStatus==='active' ? `Active • ${venues.length||profile.venueCount||1} venues` : `Trial ${days>0?days:0}d • ${venues.length}/2 venues`; }
      return venues;
    }catch(e){ console.log('fetchVenues',e); return []; }
  }

  async function fetchTeamForVenues(){
    try{
      const { data: { session } } = await supabase().auth.getSession();
      if (!session?.access_token) return [];
      const results = await Promise.all(venues.map(v=> fetch('/api/team-members',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` }, body: JSON.stringify({ venueId: v.id }) }).then(r=>r.json()).then(j=>j.members||[]).catch(()=>[])));
      const flat = results.flat();
      members = Array.from(new Map(flat.map(m=>[m.id,m])).values());
      const tb=$('teamBadge'); if(tb) tb.textContent = members.length;
      return members;
    }catch(e){ console.log(e); return []; }
  }

  // --- OVERVIEW ---
  async function renderOverview(){
    await fetchVenues();
    const issueCount = 2; // could fetch real
    const html = `
      <div class="grid4">
        <div class="metric"><div class="metric-val">${venues.length}</div><div class="metric-label">Venues • Trial max 2</div></div>
        <div class="metric"><div class="metric-val" style="color:var(--brand)">${venues.length?87:0}%</div><div class="metric-label">Health • OS</div></div>
        <div class="metric"><div class="metric-val">${members.length||0}</div><div class="metric-label">Team • RLS</div></div>
        <div class="metric"><div class="metric-val" style="color:var(--amber)">$19.95</div><div class="metric-label">Per venue / week</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:14px;margin-top:14px;">
        <div class="card">
          <div class="card-title">AI Co-Pilot • Actionable Intelligence <span class="pill-green">Live</span></div>
          <div class="ai-card"><div class="ai-icon">✦</div><div><div class="ai-title">${venues.length===0?'Welcome to Client OS – Add first venue':'Ops: Gaming Room needs deep clean'}</div><div class="ai-msg">${venues.length===0?'Add venue to activate command center. Trial includes 2 venues free. Web OS manages billing, spend shown here only.':'Gaming Room has 3x high issues on Fridays – schedule deep clean Thursday. Tasks 12/16 done. AI saves actions, improves future analytics.'}</div></div></div>
          <div class="list" style="margin-top:12px;">
            <div class="list-item" onclick="openTab('venues')"><div class="list-icon" style="background:rgba(0,200,150,.1);color:var(--brand)">🏢</div><div class="list-main"><div class="list-title">Manage Venues • RLS Secured</div><div class="list-sub">Add/remove venues – quantity auto-syncs to Stripe via /api/sync-venue-count</div></div><div class="list-action">→</div></div>
            <div class="list-item" onclick="openTab('team')"><div class="list-icon" style="background:rgba(77,159,255,.1);color:var(--blue)">👥</div><div class="list-main"><div class="list-title">Invite Team – Role enforced server-side</div><div class="list-sub">Managers, cleaners, staff – no per-user fees, $19.95 per venue only</div></div><div class="list-action">→</div></div>
            <div class="list-item" onclick="openTab('billing')"><div class="list-icon" style="background:rgba(245,166,35,.1);color:var(--amber)">💳</div><div class="list-main"><div class="list-title">Billing OS • Stripe Secure • Spend here only</div><div class="list-sub">Mobile More shows status only – spend, invoices, portal managed here on web dashboard</div></div><div class="list-action">→</div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">Venues • ${venues.length} active • Trial 2 max</div>
          <div class="list" id="venueListOverview">${venues.map(v=>`<div class="list-item"><div class="list-icon" style="background:rgba(0,200,150,.1);color:var(--brand)">🏢</div><div class="list-main"><div class="list-title">${v.name}</div><div class="list-sub">📍 ${v.suburb||'AU'} • Score ${v.score||100}% • ${v.assignedUids?.length||0} team</div></div><div class="list-action" onclick="deleteVenue('${v.id}','${v.name.replace(/'/g,"\\'")}')">Delete</div></div>`).join('') || '<div class="empty"><div class="empty-icon">🏢</div><div class="empty-title">No venues yet</div><div class="empty-sub">Trial includes 2 venues free. Add first to activate OS – auto-creates zones.</div><button class="btn btn-primary" style="margin-top:12px;" onclick="openTab(\'venues\')">Add First Venue →</button></div>'}</div>
          <button class="btn btn-primary" style="width:100%;margin-top:12px;justify-content:center;" onclick="openTab('venues')">Manage Venues on Web OS →</button>
        </div>
      </div>
    `;
    $('content').innerHTML = html;
  }

  // VENUES TAB
  window.addVenuePrompt = async () => {
    const name = prompt('Venue name (e.g. Eagle Heights Tavern):'); if (!name) return;
    const suburb = prompt('Suburb / Location (e.g. Toowoomba QLD):'); if (!suburb) return;
    if (!currentUser) return;
    try {
      const { data, error } = await supabase().from('venues').insert([{ name: name.trim(), suburb: suburb.trim(), type:'pub', score:100, ownerId: currentUser.id, assignedUids: [] }]).select().single();
      if (error) throw error;
      const zones = ['Front Bar','Beer Garden','Gaming Room','Restrooms','Carpark'];
      await supabase.from('zones').insert(zones.map(z=>({ name:z, icon:'📍', status:'clean', score:100, venueId: data.id })));
      const { data: { session } } = await supabase().auth.getSession();
      if (session?.access_token) await fetch('/api/sync-venue-count',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` } });
      alert('✅ Venue added with 5 default zones – OS + App sync, Stripe quantity updated');
      renderVenues();
    } catch(e){ alert('Error: '+e.message); }
  };

  window.deleteVenue = async (id,name) => {
    if (!confirm(`Delete ${name}? Removes zones, tasks, issues, chat history. Cannot be undone.`)) return;
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch('/api/venue-delete',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token}` }, body: JSON.stringify({ venueId: id }) });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(body.error||'Delete failed');
      alert('Venue deleted • Stripe quantity synced');
      renderVenues();
    } catch(e){ alert('Could not delete: '+e.message); }
  };

  async function renderVenues(){
    await fetchVenues();
    const html = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div><div style="font-size:14px;font-weight:800;letter-spacing:-0.3px;">Venues • ${venues.length} active • Trial max 2</div><div style="font-size:11px;color:var(--muted);margin-top:2px;">Add/remove venues – quantity auto-syncs to Stripe via /api/sync-venue-count • RLS isolated • Mobile More shows status only</div></div>
          <button class="btn btn-primary" onclick="addVenuePrompt()">+ Add Venue</button>
        </div>
        <div class="list">${venues.map(v=>`<div class="list-item"><div class="list-icon" style="background:rgba(0,200,150,.12);color:var(--brand)">🏢</div><div class="list-main"><div class="list-title">${v.name} <span class="pill-green">${v.score||100}% health</span></div><div class="list-sub">📍 ${v.suburb} • Owner ${String(v.ownerId).slice(0,6)} • ${v.assignedUids?.length||0} team • ${v.type||'pub'}</div></div><div style="display:flex;gap:6px;"><div class="list-action" onclick="deleteVenue('${v.id}','${v.name.replace(/'/g,"\\'")}')" style="color:var(--red);border-color:rgba(242,78,110,.2);">Delete</div></div></div>`).join('') || '<div class="empty"><div class="empty-icon">🏢</div><div class="empty-title">No venues</div><div class="empty-sub">Trial includes 2 free. Add first – auto-creates 5 zones, daily tasks.</div></div>'}</div>
      </div>
    `;
    $('content').innerHTML = html;
  }

  // TEAM TAB
  async function renderTeam(){
    await fetchVenues();
    await fetchTeamForVenues();
    const html = `
      <div class="grid2">
        <div class="card"><div class="card-title">Invite Team • RLS isolated • Premium OS</div>
          <div style="display:flex;gap:8px;margin:12px 0;"><input class="input" id="inviteName" placeholder="Full name e.g. Priya Sharma" style="flex:1"/><input class="input" id="inviteEmail" placeholder="Email" style="flex:1"/></div>
          <div style="display:flex;gap:8px;margin-bottom:12px;"><select class="input" id="inviteRole"><option value="manager">Site Manager</option><option value="cleaner">Cleaner</option><option value="staff">Staff</option></select><select class="input" id="inviteVenue">${venues.map(v=>`<option value="${v.id}">${v.name}</option>`).join('')}</select></div>
          <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="inviteMember()">Send Secure Invite • Role enforced →</button>
          <div class="err" id="teamError"></div><div class="ok" id="teamOk"></div>
          <div style="font-size:10px;color:var(--muted);margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;"><span class="pill">🔒 RLS isolated</span><span class="pill">📧 Invite link expires</span><span class="pill">💳 No per-user fees</span></div>
        </div>
        <div class="card"><div class="card-title">Members • ${members.length} active • Actionable</div><div class="list">${members.map(m=>`<div class="list-item"><div class="list-icon" style="background:rgba(77,159,255,.12);color:var(--blue)">${(m.name||'U').charAt(0)}</div><div class="list-main"><div class="list-title">${m.name} <span class="pill-green">${m.role}</span></div><div class="list-sub">${m.email} • 🏢 ${m.venue||m.venues?.join(', ')||'Unassigned'}</div></div><div class="list-action" style="color:var(--red)" onclick="removeMember('${m.uid||m.id}','${venues[0]?.id||''}')">Remove</div></div>`).join('') || '<div class="empty">No team yet – invite first manager</div>'}</div></div>
      </div>
    `;
    $('content').innerHTML = html;
  }

  window.inviteMember = async () => {
    const name = ($('inviteName')?.value||'').trim(); const email = ($('inviteEmail')?.value||'').trim().toLowerCase();
    const role = $('inviteRole')?.value||'staff'; const venueId = $('inviteVenue')?.value;
    if (!name||!email||!venueId){ alert('Enter name, email, venue'); return; }
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch('/api/team-invite',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token}` }, body: JSON.stringify({ name, email, role, venueId }) });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(body.error||'Invite failed');
      alert(body.existed? `${name} assigned to venue` : `${name} invited – secure link sent to set password`);
      renderTeam();
    } catch(e){ alert('Invite failed: '+e.message); }
  };

  window.removeMember = async (uid, venueId) => {
    if (!confirm('Remove member? They will see "Removed from venues" empty state until re-added.')) return;
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch('/api/team-remove',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token}` }, body: JSON.stringify({ targetUid: uid, venueId }) });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(body.error||'Remove failed');
      alert('Removed – member will see empty state');
      renderTeam();
    } catch(e){ alert('Remove failed: '+e.message); }
  };

  async function renderTasks(){
    const { data: tasks } = await supabase().from('tasks').select('*').limit(30);
    $('content').innerHTML = `<div class="card"><div class="card-title">Tasks OS • Auto-reset daily • Photo proof • Premium</div><div class="list">${(tasks||[]).map(t=>`<div class="list-item"><div class="list-icon" style="background:rgba(0,200,150,.1);color:var(--brand)">✓</div><div class="list-main"><div class="list-title">${t.title}</div><div class="list-sub">📍 ${t.zone} • ${t.frequency} • ${t.done?'Done':'Open'} • ${t.priority}</div></div></div>`).join('') || '<div class="empty"><div class="empty-icon">✓</div><div class="empty-title">No tasks</div><div class="empty-sub">Tasks auto-reset at midnight. Add in mobile app Tasks OS for full photo proof flow.</div></div>'}</div></div>`;
  }

  async function renderIssues(){
    const { data: issues } = await supabase().from('issues').select('*').order('createdAt',{ascending:false}).limit(30);
    $('content').innerHTML = `<div class="card"><div class="card-title">Issues OS • Photo proof • Priority triage • Premium clear structure</div><div class="list">${(issues||[]).map(i=>`<div class="list-item"><div class="list-icon" style="background:${i.priority==='high'?'rgba(242,78,110,.12)':'rgba(245,166,35,.12)'};color:${i.priority==='high'?'var(--red)':'var(--amber)'}">⚠</div><div class="list-main"><div class="list-title">${i.title} <span class="pill-${i.priority==='high'?'red':i.priority==='medium'?'amber':'green'}">${i.priority.toUpperCase()}</span> <span class="pill">${i.status}</span></div><div class="list-sub">📍 ${i.zone} • By ${i.by||'Unknown'} • ${i.photoUrls?.length||0}/5 photos • ${new Date(i.createdAt).toLocaleDateString('en-AU')}</div></div></div>`).join('') || '<div class="empty"><div class="empty-icon">⚠</div><div class="empty-title">No issues – all clear</div><div class="empty-sub">Issues raised with photo proof show here. Mobile app has 2-tap quick camera → library flow, 5 max hard cap.</div></div>'}</div></div>`;
  }

  async function renderZones(){
    const { data: zones } = await supabase.from('zones').select('*').limit(30);
    $('content').innerHTML = `<div class="card"><div class="card-title">Zones OS • Health scores • ${zones?.length||0} zones</div><div class="list">${(zones||[]).map(z=>`<div class="list-item"><div class="list-icon" style="background:rgba(0,200,150,.1);color:var(--brand)">${z.icon||'📍'}</div><div class="list-main"><div class="list-title">${z.name} • ${z.status}</div><div class="list-sub">Score ${z.score||100}% • Venue ${String(z.venueId||'').slice(0,6)}</div></div><div class="pill-green">${z.score||100}%</div></div>`).join('') || '<div class="empty">No zones – auto-created when you add venue (Front Bar, Beer Garden, etc)</div>'}</div></div>`;
  }

  async function renderChat(){
    $('content').innerHTML = `<div class="card"><div class="card-title">Chat OS • Group + DM • Real-time • Push</div><div class="empty"><div class="empty-icon">💬</div><div class="empty-title">Chat is full native in mobile app</div><div class="empty-sub">Group chat per venue + DM between roles (owner↔manager, manager↔staff/cleaner). Push notifications, unread badges, read receipts. Web chat shows venue groups soon.</div><button class="btn btn-primary" style="margin-top:12px;" onclick="window.open('venuesv://chat','_blank')">Open in App →</button></div></div>`;
  }

  async function renderBilling(){
    let summary = {};
    try{
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch('/api/subscription-summary',{ headers:{ Authorization:`Bearer ${session?.access_token}` } });
      summary = await res.json().catch(()=>({}));
    }catch{}
    const html = `
      <div class="grid2">
        <div class="card">
          <div class="card-title">Billing OS • Stripe Secure • Spend here only (not in app More)</div>
          <div style="background:#080a0e;border:1px solid var(--border);border-radius:12px;padding:16px;margin:12px 0;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:12px;color:var(--muted);">Email</span><span style="font-size:12px;font-weight:700;">${summary.email||currentUser?.email||''}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:12px;color:var(--muted);">Venues</span><span style="font-size:12px;font-weight:700;">${summary.venueCount||venues.length||1} • Trial max 2</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:12px;color:var(--muted);">Price</span><span style="font-size:12px;font-weight:700;">$19.95 AUD / week per venue</span></div>
            <div style="display:flex;justify-content:space-between;padding-top:12px;border-top:1px solid var(--border);"><span style="font-size:13px;font-weight:800;">Total</span><span style="font-size:22px;font-weight:900;color:var(--brand);">$${((summary.venueCount||venues.length||1)*19.95).toFixed(2)} <span style="font-size:11px;color:var(--muted);">AUD / week</span></span></div>
            <div style="font-size:11px;color:var(--muted);margin-top:8px;">Status: ${summary.subscriptionStatus||'trial'} • ${summary.stripeSubscriptionId?'Active Stripe sub':'No active sub'} • Trial: 2 venues free, 14 days</div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary" style="flex:1;justify-content:center;" onclick="checkout()">${summary.stripeSubscriptionId?'Manage in Stripe Portal →':'Subscribe $19.95/week →'}</button>
            <button class="btn btn-ghost" style="flex:1;justify-content:center;" onclick="openTab('venues')">Manage Venues →</button>
          </div>
          <div style="font-size:10px;color:var(--muted);margin-top:12px;text-align:center;display:flex;gap:6px;justify-content:center;flex-wrap:wrap;"><span class="pill">🔒 RLS isolated</span><span class="pill">⚡ Stripe PCI</span><span class="pill">📱 App More = status only</span></div>
        </div>
        <div class="card">
          <div class="card-title">Why web for billing? • Premium pattern</div>
          <div style="font-size:12px;color:var(--muted2);line-height:1.6;">
            Mobile <strong style="color:var(--text)">More screen shows status only</strong> (trial days, active/locked) – not spend. All spend, add/remove venues, team invites are managed here on web OS for security + Stripe compliance. App stays focused on ops (tasks, issues, chat).
            <br/><br/>Trial limit: 2 venues free to experience multi-venue OS. On 3rd venue, paywall → subscribe here. Keeps zones, tasks, team. No per-user fees.
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;"><div class="pill-green">✓ No per-user fees</div><div class="pill-green">✓ Cancel anytime</div><div class="pill-green">✓ Prorated billing</div></div>
        </div>
      </div>
    `;
    $('content').innerHTML = html;
  }

  window.checkout = async () => {
    try{
      const { data: { session } } = await supabase().auth.getSession();
      const sumRes = await fetch('/api/subscription-summary',{ headers:{ Authorization:`Bearer ${session?.access_token}` } });
      const sum = await sumRes.json().catch(()=>({}));
      const urlPath = sum.stripeSubscriptionId ? '/api/create-portal-session' : '/api/create-checkout-session';
      const res = await fetch(urlPath,{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token}` } });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(body.error||'Checkout failed');
      window.location.assign(body.url);
    }catch(e){ alert('Checkout failed: '+e.message); }
  };

  function renderReports(){
    $('content').innerHTML = `<div class="card"><div class="card-title">Reports OS • Weekly ops analytics • Premium</div><div class="empty"><div class="empty-icon">📊</div><div class="empty-title">Reports + AI insights</div><div class="empty-sub">Completion %, issue trends, zone health, team performance. Download PDF in mobile app Reports tab. Web reports with charts coming – AI Co-Pilot will summarize weekly ops.</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;"><div class="metric"><div class="metric-val">${venues.length}</div><div class="metric-label">Venues</div></div><div class="metric"><div class="metric-val">${members.length}</div><div class="metric-label">Team</div></div></div></div></div>`;
  }

  checkAuth();
  supabase().auth.onAuthStateChange((_, session)=>{ if (session?.user){ currentUser=session.user; loadProfile(); showDash(); } else { currentUser=null; showAuth(); } });
})();
