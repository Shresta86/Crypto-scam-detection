const jsonHeaders = { 'content-type': 'application/json' };

export class ApiError extends Error {
  constructor(message, code = 'request_failed', status = 500) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// Auth state management
const TOKEN_KEY = 'tracex_auth_token';
const USER_KEY = 'tracex_user';
const authListeners = new Set();

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession(token, user, rememberMe = true) {
  try {
    if (rememberMe) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  } catch {}
  notifyAuthChange(user);
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {}
  notifyAuthChange(null);
}

export function onAuthChange(listener) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function notifyAuthChange(user) {
  for (const listener of authListeners) {
    try { listener(user); } catch {}
  }
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  const token = getToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch (err) {
    if (err.name === 'AbortError') {
      const abortErr = new ApiError('Request aborted', 'aborted', 0);
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    throw new ApiError('TraceX could not reach the investigation service. Check that the backend is running and try again.', 'network_error', 0);
  }

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (response.status === 401 && !path.includes('/api/auth/login')) {
    clearSession();
    throw new ApiError('Session expired. Please log in again.', 'unauthorized', 401);
  }

  if (!response.ok) {
    throw new ApiError(body?.error || 'The request could not be completed.', body?.code, response.status);
  }
  return body;
}

export const api = {
  // Authentication
  login: async (email, password, rememberMe = true) => {
    const data = await request('/api/auth/login', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ email, password })
    });
    setSession(data.token, data.user, rememberMe);
    return data;
  },
  me: () => request('/api/auth/me'),
  logout: async () => {
    try { await request('/api/auth/logout', { method: 'POST' }); } catch {}
    clearSession();
  },
  isAuthenticated: () => Boolean(getToken()),
  getUser,

  // Core API
  config: (signal) => request('/api/config', { signal }),
  trace: (wallet, signal) => request('/api/trace', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ wallet_address: wallet, blockchain: 'ethereum' }),
    signal
  }),
  history: (signal) => request('/api/history', { signal }),
  case: (id, signal) => request(`/api/history/${encodeURIComponent(id)}`, { signal }),
  removeCase: id => request(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  similar: (id, signal) => request(`/api/cases/${encodeURIComponent(id)}/similar`, { signal }),
  network: (id, signal) => request(`/api/fraud-network/${encodeURIComponent(id)}`, { signal }),
  compare: (left, right, signal) => request(`/api/cases/${encodeURIComponent(left)}/compare/${encodeURIComponent(right)}`, { signal }),
  audit: (id, signal) => request(`/api/cases/${encodeURIComponent(id)}/audit`, { signal }),
  workspace: (id, signal) => request(`/api/cases/${encodeURIComponent(id)}/workspace`, { signal }),
  updateCase: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(payload) }),
  addEvidence: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}/evidence`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  verifyEvidence: (id, evidenceId) => request(`/api/cases/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}/verify`, { method: 'POST' }),
  addNote: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}/notes`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  updateNote: (id, noteId, payload) => request(`/api/cases/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(payload) }),
  removeNote: (id, noteId) => request(`/api/cases/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' }),
  addFinding: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}/findings`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  copilot: (caseId, question, signal) => request('/api/copilot', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ case_id: caseId, question }),
    signal
  }),
  monitors: (wallet, signal) => request(`/api/monitor/status${wallet ? `?wallet=${encodeURIComponent(wallet)}&blockchain=ethereum` : ''}`, { signal }),
  startMonitor: (wallet, caseId) => request('/api/monitor/start', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ wallet_address: wallet, blockchain: 'ethereum', investigation_id: caseId }) }),
  stopMonitor: wallet => request('/api/monitor/stop', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ wallet_address: wallet, blockchain: 'ethereum' }) }),
  alerts: (wallet, signal) => request(`/api/alerts${wallet ? `?wallet=${encodeURIComponent(wallet)}&blockchain=ethereum` : ''}`, { signal }),
  updateAlert: (id, action) => request(`/api/alerts/${encodeURIComponent(id)}/${action}`, { method: 'POST' }),
  investigators: (signal) => request('/api/investigators', { signal }),
  createInvestigator: payload => request('/api/investigators', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  investigatorWorkspace: (id, signal) => request(`/api/investigators/${encodeURIComponent(id)}/workspace`, { signal }),
  assignInvestigator: (caseId, investigatorId) => request(`/api/cases/${encodeURIComponent(caseId)}/assignment`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ investigator_id: investigatorId }) }),
  developerKeys: (signal) => request('/api/developer/keys', { signal }),
  createDeveloperKey: payload => request('/api/developer/keys', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  revokeDeveloperKey: id => request(`/api/developer/keys/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
  moneyFlow: (id, txHash, signal) => request(`/api/cases/${encodeURIComponent(id)}/money-flow${txHash ? `?txHash=${encodeURIComponent(txHash)}` : ''}`, { signal }),
  fingerprint: (id, wallet, signal) => request(`/api/cases/${encodeURIComponent(id)}/fingerprint${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''}`, { signal }),
  compareFingerprint: (id, walletA, walletB) => request(`/api/cases/${encodeURIComponent(id)}/fingerprint/compare`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ wallet_a: walletA, wallet_b: walletB }) }),
  infrastructureReuse: (id, signal) => request(`/api/cases/${encodeURIComponent(id)}/infrastructure-reuse`, { signal }),
  hotspots: (id, signal) => request(`/api/cases/${encodeURIComponent(id)}/hotspots`, { signal }),
  motifs: (id, signal) => request(`/api/cases/${encodeURIComponent(id)}/motifs`, { signal }),
  dormancy: (id, thresholdDays, signal) => request(`/api/cases/${encodeURIComponent(id)}/dormancy${thresholdDays ? `?thresholdDays=${thresholdDays}` : ''}`, { signal }),
  investigationDiff: (id, previousSnapshot) => request(`/api/cases/${encodeURIComponent(id)}/diff`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ previous_snapshot: previousSnapshot }) }),
  hypotheses: (id, signal) => request(`/api/cases/${encodeURIComponent(id)}/hypotheses`, { signal }),
  createHypothesis: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}/hypotheses`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  deleteHypothesis: (id, hypId) => request(`/api/cases/${encodeURIComponent(id)}/hypotheses/${encodeURIComponent(hypId)}`, { method: 'DELETE' }),
  knowledgeGraph: (id, version, signal) => request(`/api/cases/${encodeURIComponent(id)}/graph${version ? `?version=${version}` : ''}`, { signal }),
  buildKnowledgeGraph: id => request(`/api/cases/${encodeURIComponent(id)}/graph/build`, { method: 'POST' }),
  knowledgeGraphStatus: (id, signal) => request(`/api/cases/${encodeURIComponent(id)}/graph/status`, { signal }),
  knowledgeGraphHistory: (id, signal) => request(`/api/cases/${encodeURIComponent(id)}/graph/history`, { signal }),
  queryKnowledgeGraph: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}/graph/query`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
};

export async function downloadReport(investigation) {
  const headers = { ...jsonHeaders };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch('/api/report', { method: 'POST', headers, body: JSON.stringify(investigation) });
  if (!response.ok) throw new ApiError('The PDF report could not be generated.', 'report_failed', response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `TraceX_${investigation.investigation_id || 'Investigation'}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadExport(caseId, format) {
  window.location.assign(`/api/export/${encodeURIComponent(caseId)}.${format}`);
}
