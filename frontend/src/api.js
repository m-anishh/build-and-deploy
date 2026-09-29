// Thin fetch wrapper around the backend API. Paths are relative, so the same
// build works behind any host/path and through the Vite dev proxy.

const TOKEN_KEY = 'mo_token';
export const token = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

function authHeaders() {
  const t = token.get();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function req(method, url, body) {
  const opts = { method, headers: { ...authHeaders() } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data && data.code;
    err.details = data && data.details;
    throw err;
  }
  return data;
}

async function text(url) {
  const res = await fetch(url, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export const api = {
  // auth
  signup: (body) => req('POST', '/api/auth/signup', body),
  login: (body) => req('POST', '/api/auth/login', body),
  me: () => req('GET', '/api/auth/me'),
  authConfig: () => req('GET', '/api/auth/config'),
  info: () => req('GET', '/api/info'),
  ready: () => req('GET', '/ready'),
  metrics: () => text('/metrics'),
  health: () => req('GET', '/health'),
  ready: () => req('GET', '/ready'),
  mlPredict: (sample) => req('POST', '/api/ml/predict', sample),
  mlTrain: (samples) => req('POST', '/api/ml/train', { samples }),
  mlInfo: () => req('GET', '/api/ml/model/info'),
  logs: (limit = 150, level) => req('GET', `/api/logs?limit=${limit}${level ? `&level=${level}` : ''}`),
  analyzeLogs: (logs) => req('POST', '/api/logs/analyze', { logs }),
  promRange: (query, minutes = 15, step = 30) => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - minutes * 60;
    return req('GET', `/api/prom/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`);
  },
  listTasks: (status) => req('GET', `/api/tasks${status ? `?status=${status}` : ''}`),
  createTask: (task) => req('POST', '/api/tasks', task),
  updateTask: (id, patch) => req('PUT', `/api/tasks/${id}`, patch),
  deleteTask: (id) => req('DELETE', `/api/tasks/${id}`),
};
