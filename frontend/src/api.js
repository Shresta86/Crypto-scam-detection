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
  ,investigators: () => request('/api/investigators')
  ,createInvestigator: payload => request('/api/investigators', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
  ,investigatorWorkspace: id => request(`/api/investigators/${encodeURIComponent(id)}/workspace`)
  ,assignInvestigator: (caseId, investigatorId) => request(`/api/cases/${encodeURIComponent(caseId)}/assignment`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ investigator_id: investigatorId }) })
  ,developerKeys: () => request('/api/developer/keys')
  ,createDeveloperKey: payload => request('/api/developer/keys', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
  ,revokeDeveloperKey: id => request(`/api/developer/keys/${encodeURIComponent(id)}/revoke`, { method: 'POST' })
  ,moneyFlow: (id, txHash) => request(`/api/cases/${encodeURIComponent(id)}/money-flow${txHash ? `?txHash=${encodeURIComponent(txHash)}` : ''}`)
  ,fingerprint: (id, wallet) => request(`/api/cases/${encodeURIComponent(id)}/fingerprint${wallet ? `?wallet=${encodeURIComponent(wallet)}` : ''}`)
  ,compareFingerprint: (id, walletA, walletB) => request(`/api/cases/${encodeURIComponent(id)}/fingerprint/compare`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ wallet_a: walletA, wallet_b: walletB }) })
  ,infrastructureReuse: id => request(`/api/cases/${encodeURIComponent(id)}/infrastructure-reuse`)
  ,hotspots: id => request(`/api/cases/${encodeURIComponent(id)}/hotspots`)
  ,motifs: id => request(`/api/cases/${encodeURIComponent(id)}/motifs`)
  ,dormancy: (id, thresholdDays) => request(`/api/cases/${encodeURIComponent(id)}/dormancy${thresholdDays ? `?thresholdDays=${thresholdDays}` : ''}`)
  ,investigationDiff: (id, previousSnapshot) => request(`/api/cases/${encodeURIComponent(id)}/diff`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ previous_snapshot: previousSnapshot }) })
  ,hypotheses: id => request(`/api/cases/${encodeURIComponent(id)}/hypotheses`)
  ,createHypothesis: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}/hypotheses`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
  ,deleteHypothesis: (id, hypId) => request(`/api/cases/${encodeURIComponent(id)}/hypotheses/${encodeURIComponent(hypId)}`, { method: 'DELETE' })
  ,knowledgeGraph: (id, version) => request(`/api/cases/${encodeURIComponent(id)}/graph${version ? `?version=${version}` : ''}`)
  ,buildKnowledgeGraph: id => request(`/api/cases/${encodeURIComponent(id)}/graph/build`, { method: 'POST' })
  ,knowledgeGraphStatus: id => request(`/api/cases/${encodeURIComponent(id)}/graph/status`)
  ,knowledgeGraphHistory: id => request(`/api/cases/${encodeURIComponent(id)}/graph/history`)
  ,queryKnowledgeGraph: (id, payload) => request(`/api/cases/${encodeURIComponent(id)}/graph/query`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
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
