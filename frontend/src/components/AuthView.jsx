import { useEffect, useState } from 'react';
import { api, token } from '../api.js';

// Split-screen Sign In / Sign Up gating the dashboard, with email verification.
export default function AuthView({ onAuthed }) {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [verifyUrl, setVerifyUrl] = useState('');

  // Handle ?verified=1 bounce-back from the verification link.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('verified') === '1') { setNotice('Email verified — please sign in.'); }
    if (q.get('verified') === '0') { setErr('Verification link invalid or expired.'); }
    if (q.has('verified')) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setNotice(''); setVerifyUrl(''); setBusy(true);
    try {
      if (mode === 'signup') {
        const r = await api.signup({ email, password, name });
        setNotice(r.message || 'Account created. Verify your email, then sign in.');
        if (r.verifyUrl) setVerifyUrl(r.verifyUrl); // dev convenience (no mailer)
        setMode('signin');
      } else {
        const r = await api.login({ email, password });
        token.set(r.token);
        onAuthed(r.user);
      }
    } catch (e2) {
      setErr(e2.message);
      if (e2.code === 'UNVERIFIED') setNotice('Check your email for the verification link.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-left">
        <div className="auth-brand"><span className="logo">◆</span> manishOps</div>

        <form className="auth-card" onSubmit={submit}>
          <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
          <p className="auth-sub">
            {mode === 'signin' ? 'Welcome back — enter your details.' : 'Start monitoring in minutes.'}
          </p>

          {mode === 'signup' && (
            <label className="auth-field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </label>
          )}

          <label className="auth-field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <div className="auth-pass">
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
              <button type="button" className="auth-eye" onClick={() => setShow((s) => !s)}>{show ? '🙈' : '👁'}</button>
            </div>
            {mode === 'signup' && <small className="auth-hint">At least 8 characters.</small>}
          </label>

          {err && <div className="banner err">{err}</div>}
          {notice && <div className="banner ok-note">{notice}</div>}
          {verifyUrl && (
            <div className="banner warn">
              Dev mode (no mailer): <a href={verifyUrl}>click to verify your email</a>
            </div>
          )}

          <button className="btn primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          <div className="auth-or"><span>OR</span></div>
          <button type="button" className="btn ghost auth-oauth" disabled title="OAuth coming soon">
            <span>G</span> Continue with Google
          </button>

          <p className="auth-switch">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(''); setNotice(''); }}>
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>

      <div className="auth-right">
        <div className="auth-hero">
          <h2>Welcome back!<br />Sign in to your <u>manishOps</u> account</h2>
          <p>Metrics, logs, alerts and AI anomaly detection — across services, infrastructure and delivery.</p>
          <div className="auth-badges">
            <span>SRE</span><span>DevOps</span><span>Kubernetes</span><span>AI Insights</span>
          </div>
        </div>
      </div>
    </div>
  );
}
