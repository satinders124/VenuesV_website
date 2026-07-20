(() => {
  const client = window.venuesvSupabase;
  let signup = {};

  const button = (id) => document.getElementById(id);
  const value = (id) => document.getElementById(id).value.trim();

  function showError(id, message) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.style.display = 'block';
  }

  function hideError(id) {
    const element = document.getElementById(id);
    if (element) element.style.display = 'none';
  }

  function resetButton(id, label) {
    const element = button(id);
    element.disabled = false;
    element.textContent = label;
  }

  function authMessage(error) {
    const message = error?.message || 'Something went wrong. Please try again.';
    if (/already registered|already exists/i.test(message)) {
      return 'An account already exists for this email. Please sign in through the Venues V app.';
    }
    if (/password/i.test(message)) return 'Please use a stronger password and try again.';
    return message;
  }

  window.goStep2 = async () => {
    const name = value('s1Name');
    const email = value('s1Email').toLowerCase();
    const phoneNumber = value('s1Phone').replace(/\s/g, '');
    const phone = `${document.getElementById('s1PhoneCode').value}${phoneNumber}`;
    const password = document.getElementById('s1Password').value;
    const continueButton = button('btn1');

    hideError('error1');
    if (!name) return showError('error1', 'Please enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return showError('error1', 'Please enter a valid email address.');
    if (!phoneNumber) return showError('error1', 'Please enter your phone number.');
    if (password.length < 8) return showError('error1', 'Password must be at least 8 characters.');

    signup = { name, email, phone, password };
    continueButton.disabled = true;
    continueButton.innerHTML = '<span class="spin"></span> Sending code...';

    try {
      // Match the ProfitPnL registration model: check for an existing account,
      // then create a passwordless Email OTP signup. Password creation happens
      // only after the owner proves control of the email by entering the code.
      const existingResponse = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const existingResult = await existingResponse.json().catch(() => ({}));
      if (!existingResponse.ok) {
        throw new Error(existingResult.error || 'Could not validate this email. Please try again.');
      }
      if (existingResult.exists) {
        throw new Error('This email is already registered. Please sign in through the Venues V app.');
      }

      const { error } = await client.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: { name, phone, marketing_opt_in: false },
        },
      });
      if (error) throw error;

      document.getElementById('otpEmail').textContent = email;
      showStep(2);
      document.getElementById('otp0').focus();
    } catch (error) {
      showError('error1', authMessage(error));
    } finally {
      resetButton('btn1', 'Continue →');
    }
  };

  window.verifyOTPStep = async () => {
    const token = [0, 1, 2, 3, 4, 5].map((index) => value(`otp${index}`)).join('');
    const verifyButton = button('btn2');

    hideError('error2');
    if (token.length !== 6) return showError('error2', 'Please enter all 6 digits.');

    verifyButton.disabled = true;
    verifyButton.innerHTML = '<span class="spin"></span> Verifying...';
    try {
      const { data, error } = await client.auth.verifyOtp({
        email: signup.email,
        token,
        type: 'email',
      });
      if (error) throw error;

      const { error: passwordError } = await client.auth.updateUser({
        password: signup.password,
      });
      if (passwordError) throw passwordError;
      if (!data.user) throw new Error('Your email was verified, but no user session was created. Please try again.');

      showStep(3);
    } catch (error) {
      showError('error2', error?.message || 'Incorrect or expired code. Please try again.');
    } finally {
      resetButton('btn2', 'Verify →');
    }
  };

  window.resendOTP = async () => {
    hideError('error2');
    if (!signup.email) return showError('error2', 'Enter your details first, then request another code.');

    const btn = document.getElementById('btn2');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> Resending...';

    // Cooldown to prevent Supabase rate limit (default email service is rate-limited)
    const now = Date.now();
    if (window._lastResend && now - window._lastResend < 60000) {
      const wait = Math.ceil((60000 - (now - window._lastResend))/1000);
      showError('error2', `Please wait ${wait}s before requesting another code. Check spam folder – Supabase default email is rate-limited. For production, configure SMTP in Supabase Dashboard > Auth > Email Templates.`);
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }
    window._lastResend = now;

    const { error } = await client.auth.signInWithOtp({
      email: signup.email,
      options: { shouldCreateUser: false },
    });

    if (error) {
      const msg = error.message || 'Could not resend the code.';
      // Provide actionable help for common Supabase email issues
      if (/rate limit|too many|429/i.test(msg)) {
        showError('error2', 'Rate limit: Supabase default email is limited. Wait 60s, check spam, or configure production SMTP (Supabase > Auth > SMTP) with your own provider.');
      } else {
        showError('error2', msg + ' – Check spam folder, ensure email is correct, and that Supabase Email Templates contain {{ .Token }} for OTP.');
      }
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }

    const notice = document.getElementById('otpResendMsg');
    if (notice) notice.textContent = 'Code resent — check inbox + spam. Valid for 10 min. If not received, your email provider may block Supabase default sender – configure custom SMTP in Supabase.';
    btn.disabled = false;
    btn.textContent = originalText;
  };

  window.goStep4 = async () => {
    hideError('error3');
    if (!document.getElementById('chkTerms').checked) {
      return showError('error3', 'Please agree to the Terms of Service and Privacy Policy.');
    }
    if (!document.getElementById('chkTrial').checked) {
      return showError('error3', 'Please confirm you understand the trial terms.');
    }

    const marketingOptIn = document.getElementById('chkMarketing').checked;
    const startButton = button('btn3');
    startButton.disabled = true;
    startButton.innerHTML = '<span class="spin spin-dark"></span> Starting your trial...';

    try {
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData.session) throw new Error('Your verification session expired. Please start again.');

      const { error } = await client.rpc('complete_owner_trial_signup', {
        p_marketing_opt_in: marketingOptIn,
      });
      if (error) throw error;

      showStep('success');
    } catch (error) {
      showError('error3', error?.message || 'Could not start your trial. Please try again.');
    } finally {
      resetButton('btn3', 'Start Free Trial →');
    }
  };

  window.openSignup = () => {
    document.getElementById('signupModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeSignup = () => {
    document.getElementById('signupModal').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.showStep = (step) => {
    ['step1', 'step2', 'step3', 'stepSuccess'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.style.display = 'none';
    });
    const target = step === 'success' ? 'stepSuccess' : `step${step}`;
    const element = document.getElementById(target);
    if (element) element.style.display = 'block';
  };

  document.querySelectorAll('.otp-box').forEach((element, index) => {
    element.addEventListener('input', () => {
      element.value = element.value.replace(/[^0-9]/g, '');
      if (element.value && index < 5) document.getElementById(`otp${index + 1}`).focus();
    });
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !element.value && index > 0) {
        document.getElementById(`otp${index - 1}`).focus();
      }
    });
  });

  document.getElementById('signupModal').addEventListener('click', (event) => {
    if (event.target === document.getElementById('signupModal')) window.closeSignup();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') window.closeSignup();
  });
})();
