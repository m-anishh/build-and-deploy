import { useEffect, useState } from 'react';
import { api, token } from '../api.js';

// Split-screen Sign In / Sign Up gating the dashboard, with email verification.
export default function AuthView({ onAuthed }) {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [verifyUrl, setVerifyUrl] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('verified') === '1') setNotice('Email verified — please sign in.');
    if (q.get('verified') === '0') setErr('Verification link invalid or expired.');
    if (q.has('verified')) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setNotice(''); setVerifyUrl(''); setBusy(true);
    try {
      if (mode === 'signup') {
        const r = await api.signup({ email, password, name });
        setNotice(r.message || 'Account created. Verify your email, then sign in.');
        if (r.verifyUrl) setVerifyUrl(r.verifyUrl);
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
      {/* LEFT */}
      <div className="auth-left">
        <div className="auth-logo"><span className="logo">◆</span> manish<b>Ops</b></div>

        <form className="auth-card" onSubmit={submit}>
          <h1>{mode === 'signin' ? 'Sign In' : 'Sign Up'}</h1>
          <p className="auth-sub">{mode === 'signin' ? 'Welcome back! Please enter your details.' : 'Create your account to get started.'}</p>

          {mode === 'signup' && (
            <div className="auth-field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
          )}

          <div className="auth-field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email" required />
          </div>

          <div className="auth-field">
            <label>Password</label>
            <div className="auth-pass">
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
              <button type="button" className="auth-eye" onClick={() => setShow((s) => !s)} aria-label="toggle password">{show ? '🙈' : '👁'}</button>
            </div>
          </div>

          <div className="auth-row">
            <label className="auth-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember for 30 Days
            </label>
            <button type="button" className="auth-link">Forgot password</button>
          </div>

          {err && <div className="banner err">{err}</div>}
          {notice && <div className="banner ok-note">{notice}</div>}
          {verifyUrl && <div className="banner warn">Dev mode: <a href={verifyUrl}>verify your email →</a></div>}

          <button className="btn primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          <div className="auth-or"><span>OR</span></div>

          <div className="auth-oauth-row">
            <button type="button" className="auth-oauth" disabled title="OAuth coming soon"><b className="g">G</b> Sign in with Google</button>
            <button type="button" className="auth-oauth" disabled title="OAuth coming soon"><b className="gh">⌥</b> Sign in with GitHub</button>
          </div>

          <p className="auth-switch">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErr(''); setNotice(''); }}>
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>

      {/* RIGHT */}
      <div className="auth-right">
        <div className="auth-hero">
          <h2>Welcome back!<br />Please sign in to your <u>manishOps</u> account</h2>
          <p>Metrics, logs, alerts and AI anomaly detection — across services, infrastructure and delivery.</p>
          <Preview />
          <div className="auth-dots"><span className="on" /><span /><span /></div>
        </div>
      </div>
    </div>
  );
}

// Floating product-preview card (mock dashboard) like the reference design.
function Preview() {
  const bars = [40, 62, 48, 80, 55, 70, 45, 90, 60, 75];
  return (
    <div className="auth-preview">
      <div className="pv-card pv-main">
        <div className="pv-head"><span>Service Report</span><span className="pv-legend"><i className="d1" />Latency <i className="d2" />Errors</span></div>
        <div className="pv-bars">
          {bars.map((h, i) => (
            <div key={i} className="pv-bar"><span className="pv-bar-top" style={{ height: `${h * 0.5}px` }} /><span className="pv-bar-bot" style={{ height: `${h}px` }} /></div>
          ))}
        </div>
      </div>
      <div className="pv-card pv-donut">
        <div className="pv-donut-title">Health</div>
        <svg viewBox="0 0 36 36" className="pv-ring">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e6ecff" strokeWidth="3.5" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#3B82F6" strokeWidth="3.5" strokeDasharray="78 100" strokeLinecap="round" transform="rotate(-90 18 18)" />
        </svg>
        <div className="pv-donut-val">78%</div>
      </div>
    </div>
  );
}
