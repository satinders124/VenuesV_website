(() => {
  const client = window.venuesvSupabase;
  let currentSession = null;
  let summary = null;

  const byId = (id) => document.getElementById(id);

  function show(id) {
    byId(id).style.display = 'block';
  }

  function hide(id) {
    byId(id).style.display = 'none';
  }

  function setError(message) {
    const element = byId('errMsg');
    element.textContent = message;
    element.style.display = 'block';
  }

  function clearError() {
    hide('errMsg');
  }

  function setLoading(isLoading, message = 'Continue to Stripe →') {
    const button = byId('checkoutBtn');
    button.disabled = isLoading;
    button.innerHTML = isLoading
      ? '<span class="spin"></span> Redirecting to Stripe...'
      : message;
  }

  function accessToken() {
    return currentSession?.access_token;
  }

  async function api(path, options = {}) {
    const token = accessToken();
    if (!token) throw new Error('Please sign in to continue.');

    const response = await fetch(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      await client.auth.signOut();
      throw new Error('Your session has expired. Please sign in again.');
    }
    if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
    return body;
  }

  function showSignIn() {
    hide('authLoading');
    hide('subscribeForm');
    hide('successState');
    show('signInForm');
    byId('signinEmail').focus();
  }

  function renderSummary(data) {
    summary = data;
    const count = Math.max(1, Number(data.venueCount) || 1);
    const total = (count * 19.95).toFixed(2);
    const status = data.subscriptionStatus || 'trial';
    const canManage = Boolean(data.stripeSubscriptionId) && !['expired', 'cancelled'].includes(status);

    byId('accountEmail').textContent = data.email;
    byId('venueCount').textContent = count;
    byId('priceVenueCount').textContent = count;
    byId('priceTotal').textContent = `$${total}`;

    if (canManage) {
      byId('subscribeTitle').textContent = 'Manage your subscription';
      byId('subscribeIntro').textContent = 'Update your payment method, invoices or subscription in Stripe’s secure customer portal.';
      setLoading(false, 'Manage subscription →');
    } else {
      byId('subscribeTitle').textContent = 'Start your subscription';
      byId('subscribeIntro').textContent = 'Your 14-day free trial has ended. Subscribe to keep managing your venues.';
      setLoading(false, `Subscribe now — $${total}/week`);
    }

    hide('authLoading');
    hide('signInForm');
    hide('successState');
    show('subscribeForm');
  }

  async function loadSummary() {
    try {
      const data = await api('/api/subscription-summary');
      renderSummary(data);
    } catch (error) {
      clearError();
      showSignIn();
      const authError = byId('authError');
      authError.textContent = error.message;
      authError.style.display = 'block';
    }
  }

  async function initialise() {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get('cancelled') === 'true') show('cancelledMsg');

    const { data } = await client.auth.getSession();
    currentSession = data.session;

    if (parameters.get('success') === '1' && currentSession) {
      hide('authLoading');
      hide('signInForm');
      hide('subscribeForm');
      show('successState');
      return;
    }

    if (!currentSession) {
      showSignIn();
      return;
    }

    await loadSummary();
  }

  window.startCheckout = async () => {
    clearError();
    setLoading(true);
    try {
      const endpoint = summary?.stripeSubscriptionId && !['expired', 'cancelled'].includes(summary.subscriptionStatus)
        ? '/api/create-portal-session'
        : '/api/create-checkout-session';
      const data = await api(endpoint, { method: 'POST' });
      if (!data.url) throw new Error('Could not start the secure checkout. Please try again.');
      window.location.assign(data.url);
    } catch (error) {
      setError(error.message || 'Something went wrong. Please try again.');
      const total = Math.max(1, Number(summary?.venueCount) || 1) * 19.95;
      setLoading(false, `Subscribe now — $${total.toFixed(2)}/week`);
    }
  };

  window.signInForSubscription = async (event) => {
    event.preventDefault();
    const email = byId('signinEmail').value.trim().toLowerCase();
    const password = byId('signinPassword').value;
    const submit = byId('signinButton');
    const errorBox = byId('authError');

    errorBox.style.display = 'none';
    if (!email || !password) {
      errorBox.textContent = 'Enter your email address and password.';
      errorBox.style.display = 'block';
      return;
    }

    submit.disabled = true;
    submit.innerHTML = '<span class="spin"></span> Signing in...';
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentSession = data.session;
      await loadSummary();
    } catch (error) {
      errorBox.textContent = error.message || 'Could not sign in. Please check your details.';
      errorBox.style.display = 'block';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in and continue →';
    }
  };

  window.signOutOfSubscription = async () => {
    await client.auth.signOut();
    currentSession = null;
    summary = null;
    showSignIn();
  };

  client.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
  });

  initialise().catch((error) => {
    showSignIn();
    const errorBox = byId('authError');
    errorBox.textContent = error.message || 'Could not load your account.';
    errorBox.style.display = 'block';
  });
})();
