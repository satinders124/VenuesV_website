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

  function signupEmailOptions() {
    return { emailRedirectTo: `${window.location.origin}/subscribe` };
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
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          ...signupEmailOptions(),
          data: { name, phone, marketing_opt_in: false },
        },
      });

      if (error) throw error;
      if (!data.user || data.user.identities?.length === 0) {
        throw new Error('An account already exists for this email. Please sign in through the Venues V app.');
      }

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
      const { error } = await client.auth.verifyOtp({
        email: signup.email,
        token,
        type: 'signup',
      });
      if (error) throw error;
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

    const { error } = await client.auth.resend({
      type: 'signup',
      email: signup.email,
      options: signupEmailOptions(),
    });

    if (error) {
      showError('error2', error.message || 'Could not resend the code. Please try again.');
      return;
    }

    const notice = document.getElementById('otpResendMsg');
    if (notice) notice.textContent = 'Code resent — check your inbox.';
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
