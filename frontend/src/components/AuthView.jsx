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
  const [providers, setProviders] = useState({ google: false, github: false });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('verified') === '1') setNotice('Email verified — please sign in.');
    if (q.get('verified') === '0') setErr('Verification link invalid or expired.');
    if (q.get('oauth') === 'error') setErr('Social sign-in failed. Try again or use email.');
    if (q.has('verified') || q.has('oauth')) window.history.replaceState({}, '', window.location.pathname);
    api.authConfig().then(setProviders).catch(() => {});
  }, []);

  const oauth = (p) => { window.location.href = `/api/auth/${p}`; };

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
            <button type="button" className="auth-oauth" onClick={() => oauth('google')} disabled={!providers.google} title={providers.google ? 'Sign in with Google' : 'Google OAuth not configured'}>
              <b className="g">G</b> Google
            </button>
            <button type="button" className="auth-oauth" onClick={() => oauth('github')} disabled={!providers.github} title={providers.github ? 'Sign in with GitHub' : 'GitHub OAuth not configured'}>
              <b className="gh">⌥</b> GitHub
            </button>
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

// Floating product-preview card (mock dashboard) matching the reference design.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const FILL = [55, 40, 62, 35, 48, 58, 30, 66, 44, 60];

function Preview() {
  return (
    <div className="auth-preview">
      <div className="pv-card pv-main">
        <div className="pv-head">
          <span className="pv-title">Service Report</span>
          <span className="pv-legend"><i className="d1" />Requests <i className="d2" />Errors</span>
        </div>
        <div className="pv-bars">
          {FILL.map((h, i) => (
            <div key={i} className="pv-bar">
              <span className="pv-bar-fill" style={{ height: `${h}%` }} />
              {i === 6 && <span className="pv-badge">p95 182ms<br /><b>err 0.4%</b></span>}
            </div>
          ))}
        </div>
        <div className="pv-x">{MONTHS.map((m) => <span key={m}>{m}</span>)}</div>
      </div>

      <div className="pv-card pv-donut">
        <div className="pv-donut-head">Signal mix</div>
        <svg viewBox="0 0 36 36" className="pv-ring">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#eef2fb" strokeWidth="4" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#3B82F6" strokeWidth="4" strokeDasharray="46 100" strokeLinecap="round" transform="rotate(-90 18 18)" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#22C55E" strokeWidth="4" strokeDasharray="30 100" strokeDashoffset="-46" strokeLinecap="round" transform="rotate(-90 18 18)" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F59E0B" strokeWidth="4" strokeDasharray="18 100" strokeDashoffset="-76" strokeLinecap="round" transform="rotate(-90 18 18)" />
        </svg>
        <div className="pv-donut-center"><b>2.4k</b><span>signals</span></div>
        <div className="pv-donut-legend"><i style={{ background: '#3B82F6' }} />API <i style={{ background: '#22C55E' }} />Infra <i style={{ background: '#F59E0B' }} />K8s</div>
      </div>
    </div>
  );
}
