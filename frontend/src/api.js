const jsonHeaders = { 'content-type': 'application/json' };

export class ApiError extends Error {
  constructor(message, code = 'request_failed', status = 500) {
    super(message); this.code = code; this.status = status;
  }
}

async function request(path, options = {}) {
  let response;
  try { response = await fetch(path, options); }
  catch { throw new ApiError('TraceX could not reach the investigation service. Check that the backend is running and try again.', 'network_error', 0); }
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new ApiError(body?.error || 'The request could not be completed.', body?.code, response.status);
  return body;
}

export const api = {
  config: () => request('/api/config'),
  trace: wallet => request('/api/trace', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ wallet_address: wallet, blockchain: 'ethereum' }) }),
  history: () => request('/api/history'),
  case: id => request(`/api/history/${encodeURIComponent(id)}`),
  removeCase: id => request(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  similar: id => request(`/api/cases/${encodeURIComponent(id)}/similar`),
  network: id => request(`/api/fraud-network/${encodeURIComponent(id)}`),
  compare: (left, right) => request(`/api/cases/${encodeURIComponent(left)}/compare/${encodeURIComponent(right)}`),
  audit: id => request(`/api/cases/${encodeURIComponent(id)}/audit`),
  workspace: id => request(`/api/cases/${encodeURIComponent(id)}/workspace`),
  updateCase: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(payload) }),
  addEvidence: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}/evidence`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  verifyEvidence: (id, evidenceId) => request(`/api/cases/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}/verify`, { method: 'POST' }),
  addNote: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}/notes`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  updateNote: (id, noteId, payload) => request(`/api/cases/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(payload) }),
  removeNote: (id, noteId) => request(`/api/cases/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' }),
  addFinding: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}/findings`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) }),
  copilot: (caseId, question) => request('/api/copilot', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ case_id: caseId, question }) }),
  monitors: wallet => request(`/api/monitor/status${wallet ? `?wallet=${encodeURIComponent(wallet)}&blockchain=ethereum` : ''}`),
  startMonitor: (wallet, caseId) => request('/api/monitor/start', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ wallet_address: wallet, blockchain: 'ethereum', investigation_id: caseId }) }),
  stopMonitor: wallet => request('/api/monitor/stop', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ wallet_address: wallet, blockchain: 'ethereum' }) }),
  alerts: wallet => request(`/api/alerts${wallet ? `?wallet=${encodeURIComponent(wallet)}&blockchain=ethereum` : ''}`),
  updateAlert: (id, action) => request(`/api/alerts/${encodeURIComponent(id)}/${action}`, { method: 'POST' })
};

export async function downloadReport(investigation) {
  const response = await fetch('/api/report', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(investigation) });
  if (!response.ok) throw new ApiError('The PDF report could not be generated.', 'report_failed', response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `TraceX_${investigation.investigation_id || 'Investigation'}.pdf`; anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadExport(caseId, format) { window.location.assign(`/api/export/${encodeURIComponent(caseId)}.${format}`); }
