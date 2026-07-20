(() => {
  const client = window.venuesvSupabase;
  const form = document.getElementById('passwordForm');
  const submit = document.getElementById('submit');
  const errorBox = document.getElementById('error');
  const successBox = document.getElementById('success');
  let invitationSession = null;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
  }

  function clearError() {
    errorBox.style.display = 'none';
  }

  function activate(session) {
    invitationSession = session;
    submit.disabled = false;
    submit.textContent = 'Activate account →';
  }

  async function loadInvitation() {
    // Handle PKCE ?code= flow (Supabase invite links sometimes use code exchange)
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      try {
        const { data: exchanged, error: exchangeError } = await client.auth.exchangeCodeForSession(window.location.href);
        if (exchangeError) throw exchangeError;
        if (exchanged?.session) {
          activate(exchanged.session);
          // Clean URL to remove code
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }
      } catch (e) {
        console.warn('Code exchange failed', e);
      }
    }

    const { data } = await client.auth.getSession();
    if (data.session) {
      activate(data.session);
      return;
    }

    showError('This invitation link is invalid or has expired. Ask your manager to send a new invitation.');
    submit.textContent = 'Invitation unavailable';
  }

  client.auth.onAuthStateChange((_event, session) => {
    if (session) activate(session);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    if (!invitationSession) {
      showError('This invitation link is invalid or has expired. Ask your manager to send a new invitation.');
      return;
    }

    const password = document.getElementById('password').value;
    const confirmation = document.getElementById('confirmPassword').value;
    if (password.length < 8) return showError('Password must be at least 8 characters.');
    if (password !== confirmation) return showError('Passwords do not match.');

    submit.disabled = true;
    submit.textContent = 'Saving password…';
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      showError(error.message || 'Could not save your password. Please try again.');
      submit.disabled = false;
      submit.textContent = 'Activate account →';
      return;
    }

    successBox.textContent = 'Your account is ready. Open the Venues V app and sign in with your email and new password.';
    successBox.style.display = 'block';
    form.style.display = 'none';
  });

  loadInvitation().catch(() => {
    showError('Could not verify this invitation. Please open the link again or ask your manager to send a new invitation.');
    submit.textContent = 'Invitation unavailable';
  });
})();
