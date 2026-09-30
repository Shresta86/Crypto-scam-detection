import React, { useCallback, useEffect, useState } from 'react';
import AppShell, { navigate, useRoute } from './components/AppShell.jsx';
import { Drawer, ErrorState, Skeleton, Toast } from './components/Primitives.jsx';
import HomePage from './pages/HomePage.jsx';
import InvestigationPage from './pages/InvestigationPage.jsx';
import {
  AlertsPage,
  CasesPage,
  InvestigatorsPage,
  MonitoringPage,
  NetworkLanding,
  ReportsPage,
  SettingsPage,
  StandaloneCopilot,
  SystemPage
} from './pages/OperationsPages.jsx';
import { api } from './api.js';
import DeveloperConsole from './components/DeveloperConsole.jsx';
import { caseLabel, formatDate, riskTone, shortAddress } from './utils.js';

export default function App() {
  const route = useRoute();
  const pathname = route.split('?')[0];

  const [config, setConfig] = useState(null);
  const [cases, setCases] = useState([]);
  const [monitors, setMonitors] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [investigators, setInvestigators] = useState([]);

  const [current, setCurrent] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [network, setNetwork] = useState(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkError, setNetworkError] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [compare, setCompare] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const notify = (message, tone = 'success') => setToast({ message, tone });

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      api.config(),
      api.history(),
      api.monitors(),
      api.alerts(),
      api.investigators()
    ]);
    if (results[0].status === 'fulfilled') setConfig(results[0].value);
    if (results[1].status === 'fulfilled') setCases(results[1].value);
    if (results[2].status === 'fulfilled') setMonitors(results[2].value.wallets || []);
    if (results[3].status === 'fulfilled') setAlerts(results[3].value || []);
    if (results[4].status === 'fulfilled') setInvestigators(results[4].value || []);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadNetwork = useCallback(async id => {
    setNetworkLoading(true);
    setNetworkError('');
    try {
      setNetwork(await api.network(id));
    } catch (err) {
      setNetworkError(err.message);
      setNetwork(null);
    } finally {
      setNetworkLoading(false);
    }
  }, []);

  const loadWorkspace = useCallback(async id => {
    const value = await api.workspace(id);
    setWorkspace(value);
    return value;
  }, []);

  const setMonitorFromSingle = item => {
    setMonitors(values => {
      const rest = values.filter(v => v.wallet_address?.toLowerCase() !== item.wallet_address?.toLowerCase());
      return item.status === 'not_monitoring' ? rest : [item, ...rest];
    });
  };

  const loadCase = useCallback(async (id, tab) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.case(id);
      setCurrent(data);
      const caseMongoId = data.investigation_id || data._id || id;
      await Promise.all([
        loadNetwork(caseMongoId),
        loadWorkspace(caseMongoId),
        api.monitors(data.start_wallet).then(setMonitorFromSingle),
        api.alerts(data.start_wallet).then(setAlerts)
      ]);

      if (tab === 'fund-flow') navigate(`/cases/${caseMongoId}/flow`);
      else if (tab === 'transactions') navigate(`/cases/${caseMongoId}/transactions`);
      else if (tab === 'topology') navigate(`/cases/${caseMongoId}/patterns`);
      else if (tab === 'time-machine') navigate(`/cases/${caseMongoId}/timeline`);
      else if (tab === 'evidence') navigate(`/cases/${caseMongoId}/evidence`);
      else if (tab === 'report') navigate(`/cases/${caseMongoId}/report`);
      else if (tab === 'network') navigate(`/network/${caseMongoId}`);
      else if (tab === 'copilot') navigate('/copilot');
      else navigate(`/cases/${caseMongoId}`);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [loadNetwork, loadWorkspace]);

  useEffect(() => {
    const match = pathname.match(/^\/(?:cases|network)\/([^/?#]+)/i);
    if (match && current?.investigation_id !== match[1] && current?.case?.case_reference !== match[1]) {
      loadCase(match[1], pathname.startsWith('/network/') ? 'network' : undefined);
    }
  }, [pathname, current?.investigation_id, current?.case?.case_reference, loadCase]);

  const investigate = async wallet => {
    setLoading(true);
    setError(null);
    setCurrent(null);
    setWorkspace(null);
    setNetwork(null);
    try {
      const data = await api.trace(wallet);
      setCurrent(data);
      await refresh();
      await Promise.all([
        loadNetwork(data.investigation_id),
        loadWorkspace(data.investigation_id)
      ]);
      notify(`Case ${caseLabel(data.investigation_id)} created from blockchain records.`);
      navigate(`/cases/${data.investigation_id}`);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const monitor = current
    ? monitors.find(item => item.wallet_address?.toLowerCase() === current.start_wallet?.toLowerCase())
    : null;

  const toggleMonitor = async () => {
    if (!current) return;
    try {
      const result = monitor?.status === 'monitoring'
        ? await api.stopMonitor(current.start_wallet)
        : await api.startMonitor(current.start_wallet, current.investigation_id);
      setMonitorFromSingle(result);
      notify(result.status === 'monitoring' ? 'Wallet monitoring started.' : 'Wallet monitoring stopped.');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const startMonitor = async (wallet, caseId) => {
    try {
      const result = await api.startMonitor(wallet, caseId);
      setMonitorFromSingle(result);
      await refresh();
      notify('Wallet monitoring started.');
      return result;
    } catch (err) {
      notify(err.message, 'error');
      throw err;
    }
  };

  const stopMonitor = async wallet => {
    try {
      const result = await api.stopMonitor(wallet);
      setMonitorFromSingle(result);
      await refresh();
      notify('Wallet monitoring stopped.');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const removeCase = async id => {
    if (!window.confirm(`Delete ${caseLabel(id)}? This cannot be undone.`)) return;
    try {
      await api.removeCase(id);
      if (current?.investigation_id === id) {
        setCurrent(null);
        setNetwork(null);
      }
      await refresh();
      notify(`${caseLabel(id)} deleted.`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const updateAlert = async (id, action) => {
    try {
      await api.updateAlert(id, action);
      setAlerts(await api.alerts());
      notify(`Alert ${action === 'resolve' ? 'resolved' : 'acknowledged'}.`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const compareCases = async otherId => {
    if (!current) return;
    setCompareLoading(true);
    setCompare({ loading: true });
    try {
      setCompare(await api.compare(current.investigation_id, otherId));
    } catch (err) {
      setCompare({ error: err.message });
    } finally {
      setCompareLoading(false);
    }
  };

  const updateCase = async payload => {
    if (!current) return;
    const result = await api.updateCase(current.investigation_id, payload);
    setCurrent(value => ({ ...value, case: result.case }));
    await Promise.all([loadWorkspace(current.investigation_id), refresh()]);
  };

  const addEvidence = async payload => {
    if (!current) return;
    const result = await api.addEvidence(current.investigation_id, payload);
    await loadWorkspace(current.investigation_id);
    await refresh();
    return result;
  };

  const verifyEvidence = async evidenceId => {
    const result = await api.verifyEvidence(current.investigation_id, evidenceId);
    await loadWorkspace(current.investigation_id);
    return result;
  };

  const addNote = async payload => {
    const result = await api.addNote(current.investigation_id, payload);
    await loadWorkspace(current.investigation_id);
    return result;
  };

  const removeNote = async noteId => {
    if (!current) return;
    const result = await api.removeNote(current.investigation_id, noteId);
    await loadWorkspace(current.investigation_id);
    return result;
  };

  const addFinding = async payload => {
    const result = await api.addFinding(current.investigation_id, payload);
    await loadWorkspace(current.investigation_id);
    return result;
  };

  const createInvestigator = async payload => {
    const result = await api.createInvestigator(payload);
    await refresh();
    return result;
  };

  const assignInvestigator = async investigatorId => {
    if (!current) return;
    await api.assignInvestigator(current.investigation_id, investigatorId);
    await Promise.all([loadWorkspace(current.investigation_id), refresh()]);
  };

  const routeContext = {
    route: pathname,
    config,
    cases,
    monitors,
    alerts,
    investigators,
    current,
    workspace,
    network,
    networkLoading,
    networkError,
    loading,
    error,
    monitor,
    investigate,
    loadCase,
    removeCase,
    toggleMonitor,
    startMonitor,
    stopMonitor,
    updateAlert,
    notify,
    compareCases,
    updateCase,
    assignInvestigator,
    addEvidence,
    verifyEvidence,
    addNote,
    removeNote,
    addFinding,
    createInvestigator
  };

  const content = renderRoute(routeContext);

  return (
    <AppShell
      route={pathname}
      config={config}
      currentCase={current}
      alerts={alerts}
      cases={cases}
      onOpenCase={loadCase}
      onInvestigate={investigate}
    >
      {content}
      <Toast message={toast?.message} tone={toast?.tone} onClose={() => setToast(null)} />
      <CompareDrawer comparison={compare} loading={compareLoading} onClose={() => setCompare(null)} />
    </AppShell>
  );
}

function renderRoute(context) {
  const {
    route,
    cases,
    monitors,
    alerts,
    current,
    network,
    networkLoading,
    networkError,
    loading,
    error,
    monitor
  } = context;

  const searchParams = new URLSearchParams(window.location.search);
  const queryTab = searchParams.get('tab');

  // HOME ROUTE
  if (route === '/' || route === '/home') {
    return (
      <HomePage
        cases={cases}
        monitors={monitors}
        alerts={alerts}
        onInvestigate={context.investigate}
        onOpenCase={context.loadCase}
        loading={loading}
        error={error}
      />
    );
  }

  // NEW TRACE ROUTE
  if (route === '/trace' || route === '/investigate') {
    return (
      <HomePage
        cases={cases}
        monitors={monitors}
        alerts={alerts}
        onInvestigate={context.investigate}
        onOpenCase={context.loadCase}
        loading={loading}
        error={error}
      />
    );
  }

  // ALL CASES ROUTE
  if (route === '/cases') {
    return (
      <CasesPage
        cases={cases}
        monitors={monitors}
        onOpenCase={context.loadCase}
        onDelete={context.removeCase}
      />
    );
  }

  // NESTED CASE ROUTES
  if (/^\/cases\/[^/]+/i.test(route)) {
    if (loading && !current) return <LoadingPage />;
    if (error && !current) return <ErrorState message={error.message} />;

    // Derive tab from nested route or query parameter
    let tab = queryTab || 'overview';
    if (route.endsWith('/flow')) tab = 'fund-flow';
    else if (route.endsWith('/transactions')) tab = 'transactions';
    else if (route.endsWith('/patterns')) tab = 'topology';
    else if (route.endsWith('/timeline')) tab = 'time-machine';
    else if (route.endsWith('/evidence')) tab = 'evidence';
    else if (route.endsWith('/report')) tab = 'report';

    return (
      <InvestigationPage
        investigation={current}
        workspace={context.workspace}
        network={network}
        networkLoading={networkLoading}
        networkError={networkError}
        monitor={monitor}
        alerts={alerts}
        investigators={context.investigators}
        onMonitor={context.toggleMonitor}
        recent={cases}
        onOpenCase={context.loadCase}
        onCompare={context.compareCases}
        onToast={context.notify}
        onUpdateCase={context.updateCase}
        onAssignInvestigator={context.assignInvestigator}
        onAddEvidence={context.addEvidence}
        onVerifyEvidence={context.verifyEvidence}
        onAddNote={context.addNote}
        onRemoveNote={context.removeNote}
        onAddFinding={context.addFinding}
        initialTab={tab}
      />
    );
  }

  // CROSS-CASE NETWORK ROUTES
  if (route === '/network') {
    return current ? (
      <InvestigationPage
        investigation={current}
        workspace={context.workspace}
        network={network}
        networkLoading={networkLoading}
        networkError={networkError}
        monitor={monitor}
        alerts={alerts}
        investigators={context.investigators}
        onMonitor={context.toggleMonitor}
        recent={cases}
        onOpenCase={context.loadCase}
        onCompare={context.compareCases}
        onToast={context.notify}
        onUpdateCase={context.updateCase}
        onAssignInvestigator={context.assignInvestigator}
        onAddEvidence={context.addEvidence}
        onVerifyEvidence={context.verifyEvidence}
        onAddNote={context.addNote}
        onRemoveNote={context.removeNote}
        onAddFinding={context.addFinding}
        initialTab="fraud-network"
      />
    ) : (
      <NetworkLanding cases={cases} onOpenCase={context.loadCase} />
    );
  }

  if (/^\/network\/[^/]+/i.test(route)) {
    if (loading && !current) return <LoadingPage />;
    return (
      <InvestigationPage
        investigation={current}
        workspace={context.workspace}
        network={network}
        networkLoading={networkLoading}
        networkError={networkError}
        monitor={monitor}
        alerts={alerts}
        investigators={context.investigators}
        onMonitor={context.toggleMonitor}
        recent={cases}
        onOpenCase={context.loadCase}
        onCompare={context.compareCases}
        onToast={context.notify}
        onUpdateCase={context.updateCase}
        onAssignInvestigator={context.assignInvestigator}
        onAddEvidence={context.addEvidence}
        onVerifyEvidence={context.verifyEvidence}
        onAddNote={context.addNote}
        onRemoveNote={context.removeNote}
        onAddFinding={context.addFinding}
        initialTab="fraud-network"
      />
    );
  }

  // OPERATIONS ROUTES
  if (route === '/monitoring') {
    return (
      <MonitoringPage
        monitors={monitors}
        cases={cases}
        onOpenCase={context.loadCase}
        onStop={context.stopMonitor}
        onStartMonitor={context.startMonitor}
      />
    );
  }

  if (route === '/alerts') {
    return (
      <AlertsPage
        alerts={alerts}
        onUpdate={context.updateAlert}
        onOpenCase={context.loadCase}
      />
    );
  }

  if (route === '/investigators') {
    return (
      <InvestigatorsPage
        investigators={context.investigators}
        onCreate={context.createInvestigator}
        onToast={context.notify}
      />
    );
  }

  if (route === '/reports') {
    return (
      <ReportsPage
        cases={cases}
        current={current}
        network={network}
        onOpenCase={context.loadCase}
        onToast={context.notify}
      />
    );
  }

  // INTELLIGENCE COPILOT ROUTE
  if (route === '/copilot') {
    return (
      <StandaloneCopilot
        current={current}
        cases={cases}
        onOpenCase={context.loadCase}
      />
    );
  }

  // DEVELOPER ROUTES
  if (route === '/developers/keys' || route === '/developers') {
    return (
      <DeveloperConsole
        investigation={current}
        onToast={context.notify}
        initialView="keys"
      />
    );
  }

  if (route === '/developers/console') {
    return (
      <DeveloperConsole
        investigation={current}
        onToast={context.notify}
        initialView="console"
      />
    );
  }

  // SETTINGS & METHODOLOGY ROUTES
  if (route === '/settings') {
    return <SettingsPage config={context.config} initialView="general" />;
  }

  if (route === '/settings/methodology') {
    return <SettingsPage config={context.config} initialView="methodology" />;
  }

  if (route === '/system') {
    return <SystemPage config={context.config} />;
  }

  return (
    <div style={{ maxWidth: '600px', margin: '60px auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#EDEDEB', margin: 0 }}>
        Workspace not found
      </h1>
      <p style={{ fontSize: '14px', color: '#A1A4A0', margin: 0 }}>
        The requested TraceX route does not exist.
      </p>
      <button
        className="btn btn-primary"
        onClick={() => navigate('/')}
        style={{ width: 'fit-content', margin: '0 auto' }}
      >
        Return to Home
      </button>
    </div>
  );
}

function LoadingPage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#EDEDEB', margin: 0 }}>
          Loading investigation
        </h1>
        <p style={{ fontSize: '14px', color: '#A1A4A0', margin: '4px 0 0' }}>
          Restoring complete case evidence from database storage.
        </p>
      </div>
      <div className="panel-card">
        <Skeleton lines={8} />
      </div>
    </div>
  );
}

function CompareDrawer({ comparison, loading, onClose }) {
  if (!comparison) return null;
  return (
    <Drawer title="Case Comparison" subtitle="Shared infrastructure and factual differences" onClose={onClose}>
      {loading ? (
        <Skeleton lines={8} />
      ) : comparison.error ? (
        <ErrorState message={comparison.error} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#171918', borderRadius: '6px' }}>
            <span style={{ fontSize: '13px', color: '#A1A4A0' }}>Similarity</span>
            <strong style={{ fontSize: '24px', color: '#EDEDEB', fontFeatureSettings: 'tnum' }}>
              {comparison.relationship?.similarity_score || 0}
              <small style={{ fontSize: '14px', color: '#6B6E6A' }}>/100</small>
            </strong>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center' }}>
            <CaseColumn data={comparison.case_a} />
            <span style={{ fontSize: '11px', color: '#6B6E6A', fontWeight: 600 }}>VS</span>
            <CaseColumn data={comparison.case_b} />
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#EDEDEB' }}>Shared Evidence Signals</h4>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(comparison.relationship?.reasons || []).map(reason => (
                <span
                  key={reason.type}
                  style={{ fontSize: '11px', background: '#171918', border: '1px solid #232624', padding: '3px 8px', borderRadius: '4px', color: '#A1A4A0' }}
                >
                  <b style={{ color: '#3FB68B', marginRight: '4px' }}>+{reason.points}</b>
                  {reason.type.replaceAll('_', ' ')}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#EDEDEB' }}>Observed Differences</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Object.entries(comparison.differences || {}).map(([key, value]) => (
                <div
                  key={key}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 0', borderBottom: '1px solid #232624' }}
                >
                  <span style={{ color: '#A1A4A0' }}>{key.replaceAll('_', ' ')}</span>
                  <span style={{ color: '#EDEDEB' }}>
                    {String(value.case_a)} <i style={{ color: '#6B6E6A', margin: '0 4px' }}>vs</i> {String(value.case_b)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '12px', color: '#6B6E6A', lineHeight: 1.5 }}>
            Shared infrastructure supports investigation prioritization and does not imply common ownership or criminal coordination.
          </p>
        </div>
      )}
    </Drawer>
  );
}

function CaseColumn({ data }) {
  return (
    <div style={{ padding: '12px', background: '#171918', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: '11px', color: '#6B6E6A' }}>{caseLabel(data?.case_id)}</span>
      <strong className="font-mono" style={{ fontSize: '12px', color: '#EDEDEB' }}>{shortAddress(data?.wallet)}</strong>
      <span style={{ fontSize: '11px', color: '#6B6E6A' }}>{formatDate(data?.investigated_at)}</span>
      <span className={`risk-tag ${riskTone(data?.risk_level)}`} style={{ marginTop: '4px', width: 'fit-content' }}>
        {data?.risk_level} · {data?.risk_score}
      </span>
    </div>
  );
}
