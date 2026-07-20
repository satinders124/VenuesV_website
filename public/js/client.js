(() => {
  const supabase = () => window.venuesvSupabase;
  let currentUser = null;
  let currentTab = 'overview';
  let venues = [];
  let members = [];

  const $ = (id) => document.getElementById(id);
  const setError = (msg) => { const el = $('authError'); if (!el) return; el.textContent = msg; el.style.display = 'block'; };
  const clearError = () => { const el = $('authError'); if (el) el.style.display = 'none'; };

  // Auth
  async function checkAuth() {
    const { data } = await supabase().auth.getSession();
    if (data.session?.user) {
      currentUser = data.session.user;
      await loadProfile();
      showDashboard();
    } else {
      showAuth();
    }
  }

  async function loadProfile() {
    try {
      const { data } = await supabase().from('users').select('*').eq('uid', currentUser.id).maybeSingle();
      const profile = data || { name: currentUser.email?.split('@')[0] || 'Owner', email: currentUser.email, role: 'owner' };
      $('userName').textContent = profile.name || profile.email;
      $('userEmail').textContent = profile.email || currentUser.email;
      $('userAvatar').textContent = (profile.name || profile.email || 'O').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      $('roleBadge').textContent = profile.role || 'Owner';
      if (profile.trialEndsAt) {
        const days = Math.ceil((new Date(profile.trialEndsAt).getTime() - Date.now())/86400000);
        $('trialBadge').textContent = profile.subscriptionStatus === 'active' ? 'Active • Stripe' : `Trial ${days>0?days:0}d left • 2 venues`;
      }
    } catch(e){ console.log(e); }
  }

  window.signIn = async () => {
    clearError();
    const email = ($('email').value||'').trim().toLowerCase();
    const password = $('password').value||'';
    if (!email||!password){ setError('Enter email and password'); return; }
    const btn = $('signInBtn');
    btn.disabled = true; btn.textContent = 'Signing in...';
    const { data, error } = await supabase().auth.signInWithPassword({ email, password });
    if (error){ setError(error.message); btn.disabled=false; btn.textContent='Sign in to OS →'; return; }
    currentUser = data.user || data.session?.user;
    await loadProfile();
    showDashboard();
    btn.disabled=false;
  };

  window.signOut = async () => {
    try { await supabase().auth.signOut(); } catch{}
    currentUser = null;
    showAuth();
  };

  function showAuth(){ $('authScreen').style.display='block'; $('sidebar').style.display='none'; $('main').style.display='none'; }
  function showDashboard(){
    $('authScreen').style.display='none';
    $('sidebar').style.display='flex';
    $('main').style.display='block';
    loadVenues();
    setupNav();
    openTab('overview');
  }

  function setupNav(){
    document.querySelectorAll('.nav-item').forEach(el=>{
      el.addEventListener('click', ()=> openTab(el.dataset.tab));
    });
  }

  window.openTab = (tab) => {
    currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(el=> el.classList.toggle('active', el.dataset.tab===tab));
    $('topTitle').textContent = tab.charAt(0).toUpperCase()+tab.slice(1) + ' • Command Center';
    if (tab==='overview') renderOverview();
    if (tab==='venues') renderVenues();
    if (tab==='team') renderTeam();
    if (tab==='tasks') renderTasks();
    if (tab==='issues') renderIssues();
    if (tab==='zones') renderZones();
    if (tab==='chat') renderChat();
    if (tab==='billing') renderBilling();
    if (tab==='reports') renderReports();
  };

  async function fetchVenues(){
    try {
      const { data } = await supabase().from('venues').select('*');
      venues = data||[];
      return venues;
    } catch(e){ console.log(e); return []; }
  }

  async function loadVenues(){ venues = await fetchVenues(); }

  // --- RENDERERS ---
  function renderOverview(){
    const openIssues = 3; // placeholder, could fetch real
    const html = `
      <div class="grid4">
        <div class="metric"><div class="metric-val">${venues.length}</div><div class="metric-label">Venues • Trial max 2</div></div>
        <div class="metric"><div class="metric-val" style="color:var(--brand)">${venues.length?87:0}%</div><div class="metric-label">Health</div></div>
        <div class="metric"><div class="metric-val">${members.length||0}</div><div class="metric-label">Team members</div></div>
        <div class="metric"><div class="metric-val" style="color:var(--amber)">$19.95</div><div class="metric-label">Per venue / week</div></div>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="card-title">AI Co-Pilot • Actionable Intelligence</div>
        <div class="ai-card"><div class="ai-icon">✦</div><div><div class="ai-title">${venues.length===0?'Welcome to VenuesV OS – Add first venue':'Ops health good – 2 high priority in Gaming Room'}</div><div class="ai-msg">${venues.length===0?'Add venue to activate command center. Auto-creates zones + daily tasks. Trial includes 2 venues free.':'Gaming Room has 3x more high issues on Fridays – schedule deep clean Thursday. Tasks 12/16 done.'}</div></div></div>
      </div>
      <div class="grid2" style="margin-top:14px;">
        <div class="card"><div class="card-title">Venues • RLS Secured</div><div class="list" id="venueListOverview"></div><button class="btn btn-primary" style="margin-top:12px;width:100%;justify-content:center;" onclick="openTab('venues')">Manage Venues →</button></div>
        <div class="card"><div class="card-title">Quick Actions • Web OS manages billing</div>
          <div class="list">
            <div class="list-item" onclick="openTab('team')"><div class="list-icon" style="background:rgba(77,159,255,.12);color:var(--blue)">👥</div><div class="list-main"><div class="list-title">Invite Team – RLS isolated</div><div class="list-sub">Managers, cleaners, staff – role enforced server-side</div></div><div class="list-action">→</div></div>
            <div class="list-item" onclick="openTab('billing')"><div class="list-icon" style="background:rgba(0,200,150,.12);color:var(--brand)">💳</div><div class="list-main"><div class="list-title">Billing • $19.95/week per venue</div><div class="list-sub">Stripe portal • Cancel anytime • No per-user fees • Spend shown here only</div></div><div class="list-action">→</div></div>
            <div class="list-item" onclick="openTab('tasks')"><div class="list-icon" style="background:rgba(245,166,35,.12);color:var(--amber)">✓</div><div class="list-main"><div class="list-title">Tasks OS • Auto-reset daily</div><div class="list-sub">Photo proof required • Zones • Real-time sync</div></div><div class="list-action">→</div></div>
          </div>
        </div>
      </div>
    `;
    $('content').innerHTML = html;
    renderVenueListOverview();
  }

  async function renderVenueListOverview(){
    await fetchVenues();
    const el = document.getElementById('venueListOverview');
    if (!el) return;
    if (venues.length===0){ el.innerHTML = `<div class="empty"><div class="empty-icon">🏢</div>No venues yet<br/>Trial includes 2 venues free<br/><button class="btn btn-primary" style="margin-top:12px;" onclick="openTab('venues')">Add First Venue →</button></div>`; return; }
    el.innerHTML = venues.slice(0,6).map(v=>`
      <div class="list-item"><div class="list-icon" style="background:rgba(0,200,150,.1);color:var(--brand)">🏢</div><div class="list-main"><div class="list-title">${v.name}</div><div class="list-sub">📍 ${v.suburb||'AU'} • ${v.score||100}% health • ${v.assignedUids?.length||0} team</div></div></div>
    `).join('');
  }

  async function renderVenues(){
    await fetchVenues();
    const html = `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div><div class="card-title" style="margin-bottom:4px;">Venues • ${venues.length} active • Trial max 2</div><div style="font-size:11px;color:var(--muted);">Add/remove venues – quantity auto-syncs to Stripe via /api/sync-venue-count • RLS isolated</div></div>
          <button class="btn btn-primary" onclick="addVenuePrompt()">+ Add Venue</button>
        </div>
        <div class="err" id="venueError"></div><div class="ok" id="venueOk"></div>
        <div class="list">${venues.map(v=>`
          <div class="list-item"><div class="list-icon" style="background:rgba(0,200,150,.12);color:var(--brand)">🏢</div><div class="list-main"><div class="list-title">${v.name}</div><div class="list-sub">📍 ${v.suburb} • Owner ${String(v.ownerId).slice(0,6)} • ${v.assignedUids?.length||0} team • Score ${v.score||100}%</div></div><div class="list-action" style="color:var(--red)" onclick="deleteVenue('${v.id}','${v.name.replace(/'/g,"\\'")}')">Delete</div></div>
        `).join('') || '<div class="empty">No venues – trial includes 2 free. Add first to activate OS.</div>'}</div>
      </div>
    `;
    $('content').innerHTML = html;
  }

  window.addVenuePrompt = async () => {
    const name = prompt('Venue name (e.g. Eagle Heights Tavern):'); if (!name) return;
    const suburb = prompt('Suburb / Location (e.g. Toowoomba QLD):'); if (!suburb) return;
    if (!currentUser) return;
    const type = 'pub';
    try {
      const { data, error } = await supabase().from('venues').insert([{ name: name.trim(), suburb: suburb.trim(), type, score:100, ownerId: currentUser.id, assignedUids: [] }]).select().single();
      if (error) throw error;
      // Auto create zones
      const zones = ['Front Bar','Beer Garden','Gaming Room','Restrooms','Carpark'];
      await supabase.from('zones').insert(zones.map(z=>({ name:z, icon:'📍', status:'clean', score:100, venueId: data.id })));
      // Sync Stripe count
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch('/api/sync-venue-count',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` } });
      }
      alert('Venue added with 5 default zones – Web OS + App sync');
      renderVenues();
    } catch(e){ alert('Error: '+e.message); }
  };

  window.deleteVenue = async (id, name) => {
    if (!confirm(`Delete ${name}? This removes zones, tasks, issues, chat history. Cannot be undone.`)) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not signed in');
      const res = await fetch('/api/venue-delete',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` }, body: JSON.stringify({ venueId: id }) });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(body.error||'Delete failed');
      alert('Venue deleted');
      renderVenues();
    } catch(e){ alert('Could not delete: '+e.message); }
  };

  async function renderTeam(){
    // Fetch venues first for member listing
    await fetchVenues();
    let allMembers = [];
    try {
      const results = await Promise.all(venues.map(v=> fetch('/api/team-members',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${(await supabase().auth.getSession()).data.session?.access_token}` }, body: JSON.stringify({ venueId: v.id }) }).then(r=>r.json()).then(j=>j.members||[]).catch(()=>[])));
      const flat = results.flat();
      allMembers = Array.from(new Map(flat.map(m=>[m.id,m])).values());
      members = allMembers;
    } catch(e){ console.log(e); }
    const html = `
      <div class="grid2">
        <div class="card"><div class="card-title">Team OS • ${allMembers.length} active across ${venues.length} venues</div>
          <div style="display:flex;gap:8px;margin:12px 0;"><input class="input" id="inviteName" placeholder="Full name e.g. Priya Sharma" style="flex:1"/><input class="input" id="inviteEmail" placeholder="Email e.g. priya@cleanpro.com.au" style="flex:1"/></div>
          <div style="display:flex;gap:8px;margin-bottom:12px;"><select class="input" id="inviteRole"><option value="manager">Site Manager</option><option value="cleaner">Cleaner</option><option value="staff">Staff</option></select><select class="input" id="inviteVenue">${venues.map(v=>`<option value="${v.id}">${v.name}</option>`).join('')}</select></div>
          <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="inviteMember()">Send Secure Invite • RLS enforced →</button>
          <div class="err" id="teamError"></div><div class="ok" id="teamOk"></div>
          <div style="font-size:10px;color:var(--muted);margin-top:10px;">RLS isolated • Invite link expires • Role enforced server-side • $19.95 per venue, no per-user fees</div>
        </div>
        <div class="card"><div class="card-title">Members • Actionable Intelligence</div><div class="list">${allMembers.map(m=>`
          <div class="list-item"><div class="list-icon" style="background:rgba(77,159,255,.12);color:var(--blue)">${(m.name||'U').charAt(0)}</div><div class="list-main"><div class="list-title">${m.name} <span style="font-size:10px;background:rgba(0,200,150,.12);border:1px solid rgba(0,200,150,.2);color:var(--brand);padding:2px 6px;border-radius:99px;margin-left:6px;">${m.role}</span></div><div class="list-sub">${m.email} • 🏢 ${m.venue||m.venues?.join(', ')||'Unassigned'}</div></div><div class="list-action" style="color:var(--red)" onclick="removeMember('${m.uid||m.id}','${venues[0]?.id||''}')">Remove</div></div>
        `).join('') || '<div class="empty">No team yet – invite first manager</div>'}</div></div>
      </div>
    `;
    $('content').innerHTML = html;
  }

  window.inviteMember = async () => {
    const nameEl = document.getElementById('inviteName'); const emailEl = document.getElementById('inviteEmail');
    const role = document.getElementById('inviteRole')?.value||'staff';
    const venueId = document.getElementById('inviteVenue')?.value;
    const name = nameEl?.value?.trim(); const email = emailEl?.value?.trim().toLowerCase();
    if (!name||!email||!venueId){ alert('Enter name, email, venue'); return; }
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch('/api/team-invite',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token}` }, body: JSON.stringify({ name, email, role, venueId }) });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(body.error||'Invite failed');
      alert(body.existed? `${name} assigned to venue` : `${name} invited – email sent with secure link to set password`);
      renderTeam();
    } catch(e){ alert('Invite failed: '+e.message); }
  };

  window.removeMember = async (uid, venueId) => {
    if (!confirm('Remove member from venue? They will lose access and see empty state until re-added.')) return;
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch('/api/team-remove',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token}` }, body: JSON.stringify({ targetUid: uid, venueId }) });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(body.error||'Remove failed');
      alert('Removed');
      renderTeam();
    } catch(e){ alert('Remove failed: '+e.message); }
  };

  async function renderTasks(){
    const { data: tasks } = await supabase().from('tasks').select('*').limit(20);
    const html = `<div class="card"><div class="card-title">Tasks OS • Auto-reset daily • Photo proof</div><div class="list">${(tasks||[]).map(t=>`<div class="list-item"><div class="list-icon" style="background:rgba(0,200,150,.1);color:var(--brand)">✓</div><div class="list-main"><div class="list-title">${t.title}</div><div class="list-sub">📍 ${t.zone} • ${t.frequency} • ${t.done?'Done':'Open'}</div></div></div>`).join('') || '<div class="empty">No tasks yet – add in App or here soon</div>'}</div></div>`;
    $('content').innerHTML = html;
  }

  async function renderIssues(){
    const { data: issues } = await supabase().from('issues').select('*').order('createdAt',{ascending:false}).limit(20);
    const html = `<div class="card"><div class="card-title">Issues OS • Photo proof • Priority triage</div><div class="list">${(issues||[]).map(i=>`<div class="list-item"><div class="list-icon" style="background:rgba(242,78,110,.12);color:var(--red)">⚠</div><div class="list-main"><div class="list-title">${i.title} <span style="font-size:10px;padding:2px 6px;border-radius:99px;background:${i.priority==='high'?'rgba(242,78,110,.15)':'rgba(245,166,35,.15)'};color:${i.priority==='high'?'var(--red)':'var(--amber)'}">${i.priority}</span></div><div class="list-sub">📍 ${i.zone} • ${i.status} • By ${i.by||'Unknown'}</div></div></div>`).join('') || '<div class="empty">No issues – all clear</div>'}</div></div>`;
    $('content').innerHTML = html;
  }

  async function renderZones(){
    const { data: zones } = await supabase.from('zones').select('*').limit(20);
    const html = `<div class="card"><div class="card-title">Zones OS • Health scores</div><div class="list">${(zones||[]).map(z=>`<div class="list-item"><div class="list-icon" style="background:rgba(0,200,150,.1);color:var(--brand)">${z.icon||'📍'}</div><div class="list-main"><div class="list-title">${z.name} • ${z.status}</div><div class="list-sub">Score ${z.score||100}% • Venue ${String(z.venueId||'').slice(0,6)}</div></div></div>`).join('') || '<div class="empty">No zones – auto-created when you add venue</div>'}</div></div>`;
    $('content').innerHTML = html;
  }

  async function renderChat(){
    const html = `<div class="card"><div class="card-title">Chat OS • Group + DM • Real-time</div><div class="empty"><div class="empty-icon">💬</div>Chat is full native in mobile app with push notifications. Web chat shows venue group chats + DMs soon. Use app for now.</div></div>`;
    $('content').innerHTML = html;
  }

  async function renderBilling(){
    let summary = {};
    try {
      const { data: { session } } = await supabase().auth.getSession();
      const res = await fetch('/api/subscription-summary',{ headers:{ Authorization:`Bearer ${session?.access_token}` } });
      summary = await res.json().catch(()=>({}));
    } catch {}
    const html = `
      <div class="card">
        <div class="card-title">Billing OS • Stripe Secure • Spend shown here only</div>
        <div style="background:#080a0e;border:1px solid var(--border);border-radius:12px;padding:16px;margin:12px 0;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:12px;color:var(--muted);">Email</span><span style="font-size:12px;font-weight:700;">${summary.email||currentUser?.email||''}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:12px;color:var(--muted);">Venues</span><span style="font-size:12px;font-weight:700;">${summary.venueCount||venues.length||1}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;"><span style="font-size:12px;color:var(--muted);">Price per venue</span><span style="font-size:12px;font-weight:700;">$19.95 AUD / week</span></div>
          <div style="display:flex;justify-content:space-between;padding-top:12px;border-top:1px solid var(--border);"><span style="font-size:13px;font-weight:800;">Total</span><span style="font-size:22px;font-weight:900;color:var(--brand);">$${((summary.venueCount||venues.length||1)*19.95).toFixed(2)} <span style="font-size:11px;color:var(--muted);">AUD / week</span></span></div>
          <div style="font-size:11px;color:var(--muted);margin-top:8px;">Status: ${summary.subscriptionStatus||'trial'} • ${summary.stripeSubscriptionId?'Active stripe sub':'No active sub'}</div>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-primary" style="flex:1;justify-content:center;" onclick="checkout()">${summary.stripeSubscriptionId?'Manage in Stripe Portal →':'Subscribe $19.95/week →'}</button>
          <button class="btn btn-ghost" style="flex:1;justify-content:center;" onclick="openTab('venues')">Manage Venues →</button>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:12px;text-align:center;">Secure via Stripe • Cancel anytime • Invoices in portal • Mobile More shows status only, not spend – spend shown here on web dashboard OS</div>
      </div>
    `;
    $('content').innerHTML = html;
  }

  window.checkout = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const endpoint = '/api/create-checkout-session';
      // If already has sub, open portal
      const sumRes = await fetch('/api/subscription-summary',{ headers:{ Authorization:`Bearer ${session?.access_token}` } });
      const sum = await sumRes.json().catch(()=>({}));
      const urlPath = sum.stripeSubscriptionId ? '/api/create-portal-session' : '/api/create-checkout-session';
      const res = await fetch(urlPath,{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token}` } });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(body.error||'Checkout failed');
      window.location.assign(body.url);
    } catch(e){ alert('Checkout failed: '+e.message); }
  };

  function renderReports(){
    $('content').innerHTML = `<div class="card"><div class="card-title">Reports OS • Weekly ops analytics</div><div class="empty"><div class="empty-icon">📊</div>Reports download as PDF in mobile app. Web reports with AI insights coming soon – completion %, issue trends, zone health.</div></div>`;
  }

  // Init
  checkAuth();
  supabase().auth.onAuthStateChange((_, session)=>{
    if (session?.user){ currentUser = session.user; loadProfile(); showDashboard(); } else { currentUser=null; showAuth(); }
  });
})();
