import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Icon from './Icon.jsx';
import { caseLabel, shortAddress } from '../utils.js';

const ACCESS = [
  { id: 'cases:read', name: 'Case Intelligence', desc: 'Read stored case dossiers, transaction ledgers, and risk scoring' },
  { id: 'network:read', name: 'Fraud Network', desc: 'Multi-hop graph topology, syndicate clusters, and counterparty links' },
  { id: 'workspace:read', name: 'Evidence Vault', desc: 'SHA-256 integrity proofs, verified evidence items, notes, and findings' }
];

const EXPIRY = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days (Recommended)' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' }
];

const copy = value => navigator.clipboard?.writeText(value).then(() => true).catch(() => false);
const date = value => value ? new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Never expires';

export default function DeveloperConsole({ investigation, onToast, initialView = 'keys' }) {
  const [keys, setKeys] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState(90);
  const [scopes, setScopes] = useState(ACCESS.map(item => item.id));
  const [secret, setSecret] = useState('');
  const [testKey, setTestKey] = useState('');
  const [route, setRoute] = useState('case');
  const [snippetLang, setSnippetLang] = useState('curl');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  const refresh = async () => {
    try {
      setKeys(await api.developerKeys());
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { refresh(); }, []);

  const active = keys.filter(item => item.status === 'ACTIVE');
  const activeCaseId = investigation?.investigation_id || '6aba9bf3a9851671145c7986';

  const routes = useMemo(() => ({
    case: { name: 'Get Case Dossier', scope: 'cases:read', path: `/v1/cases/${activeCaseId}` },
    network: { name: 'Get Fraud Network', scope: 'network:read', path: `/v1/cases/${activeCaseId}/network` },
    workspace: { name: 'Get Evidence Ledger', scope: 'workspace:read', path: `/v1/cases/${activeCaseId}/workspace` }
  }), [activeCaseId]);

  const handleCreateKey = async event => {
    if (event) event.preventDefault();
    if (!name.trim()) {
      setError('Please provide a descriptive name for this API credential.');
      return;
    }
    if (!scopes.length) {
      setError('Please select at least one permission scope.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await api.createDeveloperKey({ name: name.trim(), scopes, expiry_days: expiry });
      setSecret(created.secret);
      setTestKey(created.secret);
      setName('');
      setShowCreateModal(false);
      await refresh();
      onToast?.('API key generated successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async item => {
    if (!window.confirm(`Revoke key "${item.name}"? Applications using this credential will immediately lose access.`)) return;
    try {
      await api.revokeDeveloperKey(item.key_id);
      await refresh();
      onToast?.('API key revoked.');
    } catch (err) {
      setError(err.message);
    }
  };

  const executeSandbox = async () => {
    const key = testKey.trim() || secret;
    if (!key) {
      setError('Please provide an API key in the authentication field.');
      return;
    }
    setBusy(true);
    setError('');
    const start = performance.now();
    try {
      const response = await fetch(routes[route].path, { headers: { 'X-TraceX-Key': key } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Request failed');
      setResult({ body, status: response.status, ms: Math.round(performance.now() - start) });
      await refresh();
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const getCodeSnippet = () => {
    const targetUrl = `${window.location.origin}${routes[route].path}`;
    const token = testKey || secret || 'trx_live_YOUR_KEY_HERE';
    if (snippetLang === 'curl') {
      return `curl -X GET "${targetUrl}" \\\n  -H "X-TraceX-Key: ${token}" \\\n  -H "Accept: application/json"`;
    }
    if (snippetLang === 'node') {
      return `const response = await fetch('${targetUrl}', {\n  headers: {\n    'X-TraceX-Key': '${token}',\n    'Accept': 'application/json'\n  }\n});\nconst data = await response.json();\nconsole.log(data);`;
    }
    return `import requests\n\nurl = "${targetUrl}"\nheaders = {\n    "X-TraceX-Key": "${token}",\n    "Accept": "application/json"\n}\nresponse = requests.get(url, headers=headers)\nprint(response.json())`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: '#EDEDEB' }}>
            {initialView === 'console' ? 'API Sandbox' : 'API Credentials & Integration'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#A1A4A0' }}>
            {initialView === 'console'
              ? 'Test live TraceX API endpoints with real-time JSON responses and generated code snippets.'
              : 'Provision secure API keys for programmatic access to TraceX intelligence.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={() => copy(`${window.location.origin}/api/docs/openapi.json`).then(ok => ok && onToast?.('OpenAPI spec URL copied.'))}
          >
            <span>OpenAPI Spec</span>
            <Icon name="external" size={13} />
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" size={14} />
            <span>Create API key</span>
          </button>
        </div>
      </header>

      {error && (
        <div style={{ padding: '12px 16px', background: 'rgba(229, 72, 77, 0.1)', border: '1px solid rgba(229, 72, 77, 0.3)', borderRadius: '6px', color: '#E5484D', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="warning" size={15} />
            <span>{error}</span>
          </div>
          <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setError('')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Secret One-Time Reveal Banner */}
      {secret && (
        <div style={{ padding: '16px 20px', background: 'rgba(63, 182, 139, 0.08)', border: '1px solid rgba(63, 182, 139, 0.4)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-flex', width: '8px', height: '8px', borderRadius: '50%', background: '#3FB68B' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#3FB68B', letterSpacing: '0.04em' }}>
                NEW SECRET KEY GENERATED · STORE NOW (VISIBLE ONLY ONCE)
              </span>
            </div>
            <code className="font-mono" style={{ fontSize: '13px', color: '#EDEDEB', background: '#0A0B0B', padding: '6px 12px', borderRadius: '4px', border: '1px solid #232624' }}>
              {secret}
            </code>
            <span style={{ fontSize: '11px', color: '#6B6E6A' }}>
              TraceX stores a cryptographic SHA-256 hash. If lost, this key cannot be retrieved and must be regenerated.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                copy(secret);
                setCopiedKey(true);
                setTimeout(() => setCopiedKey(false), 2000);
                onToast?.('Secret key copied to clipboard.');
              }}
            >
              <Icon name={copiedKey ? 'check' : 'copy'} size={13} />
              <span>{copiedKey ? 'Copied' : 'Copy secret'}</span>
            </button>
            <button className="btn btn-ghost" onClick={() => setSecret('')}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Inline Key Generation Card (Clean, modern, never broken) */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#EDEDEB' }}>
              Generate API Key
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#A1A4A0' }}>
              Create a secured credential with scoped permissions for services, scripts, and SIEM pipelines.
            </p>
          </div>
          <span style={{ fontSize: '11px', color: '#6B6E6A' }}>
            Standard Rate: 120 req / min
          </span>
        </div>

        <form onSubmit={handleCreateKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#A1A4A0', marginBottom: '4px' }}>
                Key Identifier / Application Name
              </label>
              <input
                className="input-control"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. Automated SIEM Collector"
                maxLength={80}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#A1A4A0', marginBottom: '4px' }}>
                Expiration Period
              </label>
              <select
                className="input-control"
                value={expiry}
                onChange={e => setExpiry(Number(e.target.value))}
              >
                {EXPIRY.map(item => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span style={{ display: 'block', fontSize: '12px', color: '#A1A4A0', marginBottom: '6px' }}>
              Granted Access Scopes
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px' }}>
              {ACCESS.map(item => {
                const isSelected = scopes.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => setScopes(curr => curr.includes(item.id) ? curr.filter(v => v !== item.id) : [...curr, item.id])}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: isSelected ? 'rgba(63, 182, 139, 0.08)' : '#171918',
                      border: `1px solid ${isSelected ? 'rgba(63, 182, 139, 0.35)' : '#232624'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'border-color 120ms ease'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: isSelected ? '#EDEDEB' : '#A1A4A0' }}>
                        {item.name}
                      </span>
                      <span style={{ fontSize: '11px', color: '#6B6E6A' }}>
                        {item.desc}
                      </span>
                    </div>
                    <span style={{ color: isSelected ? '#3FB68B' : '#6B6E6A', display: 'flex', alignItems: 'center' }}>
                      {isSelected ? <Icon name="check" size={14} /> : <Icon name="plus" size={12} />}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !name.trim()}
              style={{ height: '36px' }}
            >
              {busy ? 'Generating…' : 'Generate API Key'}
            </button>
          </div>
        </form>
      </section>

      {/* Main Keys Inventory Table */}
      <section className="panel-card" style={{ padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #232624', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#EDEDEB' }}>
            Active Credentials ({active.length})
          </h3>
          <span style={{ fontSize: '12px', color: '#6B6E6A' }}>
            Total keys registered: {keys.length}
          </span>
        </div>

        {keys.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Key Name</th>
                <th>Prefix</th>
                <th>Scopes</th>
                <th>Expires</th>
                <th>Requests</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(item => (
                <tr key={item.key_id} style={{ cursor: 'default' }}>
                  <td style={{ fontWeight: 500, color: '#EDEDEB' }}>{item.name}</td>
                  <td className="font-mono" style={{ color: '#A1A4A0' }}>{item.key_prefix || item.prefix}…</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {(item.scopes || []).map(s => (
                        <span key={s} style={{ fontSize: '11px', background: '#171918', border: '1px solid #232624', padding: '2px 6px', borderRadius: '4px', color: '#A1A4A0' }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ color: '#6B6E6A', fontSize: '12px' }}>{date(item.expires_at)}</td>
                  <td className="font-mono" style={{ color: '#6B6E6A' }}>{item.request_count || 0}</td>
                  <td style={{ textAlign: 'right' }}>
                    {item.status === 'ACTIVE' ? (
                      <button
                        className="btn btn-ghost"
                        style={{ height: '26px', fontSize: '12px', color: '#E5484D' }}
                        onClick={() => revoke(item)}
                      >
                        Revoke
                      </button>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#6B6E6A' }}>Revoked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '36px', textAlign: 'center', color: '#6B6E6A', fontSize: '13px' }}>
            No API keys created yet. Enter a name above to generate your first credential.
          </div>
        )}
      </section>

      {/* Interactive Sandbox Section */}
      <section className="panel-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#EDEDEB' }}>
              Interactive API Sandbox
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#A1A4A0' }}>
              Execute live authenticated queries against case data and copy integration snippets.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['curl', 'node', 'python'].map(l => (
              <button
                key={l}
                className={`btn ${snippetLang === l ? 'btn-secondary' : 'btn-ghost'}`}
                style={{ height: '26px', fontSize: '12px', padding: '0 8px', textTransform: 'capitalize' }}
                onClick={() => setSnippetLang(l)}
              >
                {l === 'curl' ? 'cURL' : l === 'node' ? 'Node.js' : 'Python'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '16px' }}>
          {/* Left Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontSize: '12px', color: '#A1A4A0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span>Target Endpoint</span>
              <select
                className="input-control"
                value={route}
                onChange={e => setRoute(e.target.value)}
              >
                {Object.entries(routes).map(([id, item]) => (
                  <option key={id} value={id}>GET {item.path} ({item.name})</option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: '12px', color: '#A1A4A0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span>Authentication (X-TraceX-Key)</span>
              <input
                className="input-control font-mono"
                value={testKey}
                onChange={e => setTestKey(e.target.value)}
                placeholder="trx_live_…"
                autoComplete="off"
              />
            </label>

            <div style={{ background: '#0A0B0B', border: '1px solid #232624', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#6B6E6A', fontWeight: 600 }}>INTEGRATION CODE</span>
                <button
                  className="btn btn-ghost"
                  style={{ height: '20px', padding: '0 4px', fontSize: '11px', color: '#A1A4A0' }}
                  onClick={() => copy(getCodeSnippet()).then(ok => ok && onToast?.('Code snippet copied.'))}
                >
                  <Icon name="copy" size={11} />
                  <span>Copy</span>
                </button>
              </div>
              <pre className="font-mono" style={{ margin: 0, fontSize: '11px', color: '#A1A4A0', lineHeight: 1.5, overflow: 'auto', maxHeight: '110px' }}>
                {getCodeSnippet()}
              </pre>
            </div>

            <button
              className="btn btn-primary"
              onClick={executeSandbox}
              disabled={busy}
              style={{ width: 'fit-content', marginTop: '2px' }}
            >
              {busy ? 'Executing…' : 'Send Live Request'}
            </button>
          </div>

          {/* Right Response Viewer */}
          <div style={{ background: '#0A0B0B', border: '1px solid #232624', borderRadius: '6px', padding: '14px', overflow: 'auto', maxHeight: '340px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#6B6E6A', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #171918' }}>
              <span>RESPONSE PAYLOAD</span>
              {result ? (
                <span style={{ color: '#3FB68B' }}>{result.status} OK · {result.ms}ms</span>
              ) : (
                <span>Awaiting execution</span>
              )}
            </div>
            <pre className="font-mono" style={{ margin: 0, fontSize: '11px', color: result ? '#3FB68B' : '#6B6E6A', lineHeight: 1.5, flex: 1 }}>
              {result ? JSON.stringify(result.body, null, 2) : '// Click "Send Live Request" to inspect authenticated API response.'}
            </pre>
          </div>
        </div>
      </section>

      {/* Modal Dialog for "+ Create API key" header button */}
      {showCreateModal && (
        <div
          className="cmd-backdrop"
          onClick={e => e.target === e.currentTarget && setShowCreateModal(false)}
        >
          <div
            className="cmd-dialog"
            style={{ width: '520px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#EDEDEB' }}>
                Create API Key
              </h2>
              <button
                className="btn btn-ghost"
                onClick={() => setShowCreateModal(false)}
                style={{ padding: '4px', height: 'auto' }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateKey} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#A1A4A0' }}>Key Name</span>
                <input
                  autoFocus
                  className="input-control"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Production AML Service"
                  maxLength={80}
                  required
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#A1A4A0' }}>Expiration</span>
                <select
                  className="input-control"
                  value={expiry}
                  onChange={e => setExpiry(Number(e.target.value))}
                >
                  {EXPIRY.map(item => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#A1A4A0' }}>Scopes</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {ACCESS.map(item => {
                    const isSelected = scopes.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => setScopes(curr => curr.includes(item.id) ? curr.filter(v => v !== item.id) : [...curr, item.id])}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: isSelected ? 'rgba(63, 182, 139, 0.08)' : '#171918',
                          border: `1px solid ${isSelected ? 'rgba(63, 182, 139, 0.35)' : '#232624'}`,
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <span style={{ fontSize: '12px', color: isSelected ? '#EDEDEB' : '#A1A4A0' }}>
                          {item.name}
                        </span>
                        <span style={{ color: isSelected ? '#3FB68B' : '#6B6E6A' }}>
                          {isSelected ? <Icon name="check" size={14} /> : <Icon name="plus" size={12} />}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !name.trim() || !scopes.length}
                >
                  {busy ? 'Creating…' : 'Generate Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
