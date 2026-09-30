import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { caseLabel, riskTone, shortAddress } from '../utils.js';

export function navigate(path) {
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute() {
  const currentRoute = () => `${window.location.pathname}${window.location.search}`;
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const update = () => setRoute(currentRoute());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return route;
}

export default function AppShell({
  children,
  route,
  config,
  currentCase,
  alerts = [],
  cases = [],
  onOpenCase,
  onInvestigate
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('tracex_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [cmdIndex, setCmdIndex] = useState(0);
  const cmdInputRef = useRef(null);
  const [caseLookupInput, setCaseLookupInput] = useState('');

  // Toggle collapsed state and persist
  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('tracex_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut listener: "[" to toggle sidebar, ⌘K for command palette
  useEffect(() => {
    const onKeyDown = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCmdOpen(prev => !prev);
      } else if (event.key === '[' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        toggleCollapse();
      } else if (event.key === 'Escape' && cmdOpen) {
        setCmdOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cmdOpen]);

  useEffect(() => {
    if (cmdOpen) {
      setTimeout(() => cmdInputRef.current?.focus(), 30);
      setCmdQuery('');
      setCmdIndex(0);
    }
  }, [cmdOpen]);

  const pathname = route.split('?')[0];
  const searchParams = new URLSearchParams(window.location.search);
  const activeTab = searchParams.get('tab') || 'overview';

  // Compute Breadcrumb
  const getBreadcrumbs = () => {
    if (pathname === '/' || pathname === '/home') {
      return [{ label: 'Home', path: '/' }];
    }
    if (pathname === '/trace' || pathname === '/investigate') {
      return [{ label: 'Trace', path: '/trace' }];
    }
    if (pathname === '/cases') {
      return [{ label: 'Cases', path: '/cases' }];
    }
    if (pathname.startsWith('/cases/')) {
      const caseId = currentCase?.investigation_id || pathname.split('/')[2];
      const crumbs = [
        { label: 'Cases', path: '/cases' },
        { label: caseLabel(caseId), path: `/cases/${caseId}` }
      ];
      if (pathname.endsWith('/graph') || activeTab === 'knowledge-graph') {
        crumbs.push({ label: 'Knowledge graph' });
      } else if (pathname.endsWith('/flow') || activeTab === 'fund-flow') {
        crumbs.push({ label: 'Fund flow' });
      } else if (pathname.endsWith('/transactions') || activeTab === 'transactions') {
        crumbs.push({ label: 'Transactions' });
      } else if (pathname.endsWith('/patterns') || activeTab === 'topology') {
        crumbs.push({ label: 'Patterns' });
      } else if (pathname.endsWith('/timeline') || activeTab === 'time-machine') {
        crumbs.push({ label: 'Timeline' });
      } else if (pathname.endsWith('/evidence') || activeTab === 'evidence') {
        crumbs.push({ label: 'Evidence' });
      } else if (pathname.endsWith('/report') || activeTab === 'report') {
        crumbs.push({ label: 'Report' });
      } else {
        crumbs.push({ label: 'Overview' });
      }
      return crumbs;
    }
    if (pathname.startsWith('/network')) {
      return [{ label: 'Intelligence', path: '/network' }, { label: 'Network' }];
    }
    if (pathname === '/copilot') {
      return [{ label: 'Intelligence', path: '/network' }, { label: 'Ask' }];
    }
    if (pathname === '/monitoring') {
      return [{ label: 'Operations', path: '/monitoring' }, { label: 'Monitoring' }];
    }
    if (pathname === '/alerts') {
      return [{ label: 'Operations', path: '/alerts' }, { label: 'Alerts' }];
    }
    if (pathname.startsWith('/developers')) {
      const sub = pathname.includes('console') ? 'Console' : 'API keys';
      return [{ label: 'Developers', path: '/developers/keys' }, { label: sub }];
    }
    if (pathname.startsWith('/settings')) {
      const sub = pathname.includes('methodology') ? 'Methodology' : 'Settings';
      return [{ label: 'Settings', path: '/settings' }, { label: sub }];
    }
    return [{ label: 'TraceX' }];
  };

  const breadcrumbs = getBreadcrumbs();
  const unreadAlerts = alerts.filter(a => a.status === 'NEW').length;

  // Command palette commands
  const allCmds = [
    { label: 'Go to Home', group: 'Navigation', icon: 'home', action: () => navigate('/') },
    { label: 'Start new trace', group: 'Navigation', icon: 'trace', action: () => navigate('/trace') },
    { label: 'View all cases', group: 'Navigation', icon: 'cases', action: () => navigate('/cases') },
    { label: 'Open sample case TX-2026-5C7986', group: 'Actions', icon: 'cases', action: () => onOpenCase?.('6aba9bf3a9851671145c7986') },
    { label: 'Network Intelligence', group: 'Intelligence', icon: 'network', action: () => navigate('/network') },
    { label: 'Case Assistant', group: 'Intelligence', icon: 'messageText', action: () => navigate('/copilot') },
    { label: 'Wallet Monitoring', group: 'Operations', icon: 'monitoring', action: () => navigate('/monitoring') },
    { label: 'Security Alerts', group: 'Operations', icon: 'alerts', action: () => navigate('/alerts') },
    { label: 'Developer API Keys', group: 'Developers', icon: 'keys', action: () => navigate('/developers/keys') },
    { label: 'Developer API Sandbox', group: 'Developers', icon: 'console', action: () => navigate('/developers/console') },
    { label: 'System Settings', group: 'Settings', icon: 'settings', action: () => navigate('/settings') },
    { label: 'Investigation Methodology', group: 'Settings', icon: 'info', action: () => navigate('/settings/methodology') },
    ...(currentCase ? [
      { label: `Knowledge graph (${caseLabel(currentCase.investigation_id)})`, group: 'Active case', icon: 'waypoints', action: () => navigate(`/cases/${currentCase.investigation_id}/graph`) },
      { label: `Build knowledge graph (${caseLabel(currentCase.investigation_id)})`, group: 'Actions', icon: 'network', action: () => navigate(`/cases/${currentCase.investigation_id}/graph`) }
    ] : []),
    // Filterable Cases
    ...cases.map(c => ({
      label: `Open Case ${caseLabel(c.id)} (${c.risk_score}/100 - ${shortAddress(c.wallet_address)})`,
      group: 'Cases',
      icon: 'cases',
      action: () => onOpenCase?.(c.id)
    })),
    ...cases.map(c => ({
      label: `Knowledge graph for Case ${caseLabel(c.id)}`,
      group: 'Knowledge Graph',
      icon: 'waypoints',
      action: () => {
        onOpenCase?.(c.id);
        navigate(`/cases/${c.id}/graph`);
      }
    }))
  ];

  const filteredCmds = allCmds.filter(cmd =>
    cmd.label.toLowerCase().includes(cmdQuery.toLowerCase()) ||
    cmd.group.toLowerCase().includes(cmdQuery.toLowerCase())
  );

  const runCommand = cmd => {
    setCmdOpen(false);
    cmd.action();
  };

  return (
    <div className="app-root">
      {/* 248px / 60px Persistent Sidebar */}
      <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
          <button className="sidebar-brand" onClick={() => navigate('/')} title="TraceX Home">
            <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', background: '#3FB68B' }} />
            {!collapsed && <span className="sidebar-wordmark">TraceX</span>}
          </button>
          <button
            className="sidebar-collapse-btn"
            onClick={toggleCollapse}
            title={collapsed ? 'Expand sidebar ([)' : 'Collapse sidebar ([)'}
            aria-label="Toggle sidebar"
          >
            <Icon name={collapsed ? 'chevron' : 'chevronLeft'} size={14} />
          </button>
        </div>

        {/* Search / Jump To Trigger */}
        {!collapsed ? (
          <button className="sidebar-search-trigger" onClick={() => setCmdOpen(true)}>
            <span className="search-hint">
              <Icon name="search" size={13} />
              <span>Search or jump to…</span>
            </span>
            <span className="kbd-shortcut">⌘K</span>
          </button>
        ) : (
          <button
            style={{ margin: '8px auto', background: 'none', border: 'none', color: '#6B6E6A', cursor: 'pointer', padding: '6px' }}
            onClick={() => setCmdOpen(true)}
            title="Search or jump to… (⌘K)"
          >
            <Icon name="search" size={16} />
          </button>
        )}

        {/* Navigation Sections */}
        <nav className="sidebar-nav">
          <div className="nav-section">
            <button
              className={`nav-item ${pathname === '/' || pathname === '/home' ? 'active' : ''}`}
              onClick={() => navigate('/')}
              title="Home"
            >
              <span className="nav-item-icon"><Icon name="home" size={16} /></span>
              {!collapsed && <span className="nav-item-label">Home</span>}
            </button>
            <button
              className={`nav-item ${pathname === '/trace' || pathname === '/investigate' ? 'active' : ''}`}
              onClick={() => navigate('/trace')}
              title="New trace"
            >
              <span className="nav-item-icon"><Icon name="plus" size={16} /></span>
              {!collapsed && <span className="nav-item-label">New trace</span>}
            </button>
          </div>

          {/* CASES SECTION */}
          <div className="nav-section">
            {!collapsed && <div className="nav-section-label">Cases</div>}
            <button
              className={`nav-item ${pathname === '/cases' ? 'active' : ''}`}
              onClick={() => navigate('/cases')}
              title="All cases"
            >
              <span className="nav-item-icon"><Icon name="cases" size={16} /></span>
              {!collapsed && (
                <>
                  <span className="nav-item-label">All cases</span>
                  <span className="nav-item-count">{cases.length}</span>
                </>
              )}
            </button>

            {/* Pinned Active Case Continuity Block */}
            {currentCase && !collapsed && (
              <div className="active-case-block">
                <div className="active-case-header">
                  <div className="active-case-label-row">
                    <span className="active-case-id">{caseLabel(currentCase.investigation_id)}</span>
                    <span className={`active-case-risk ${(currentCase.risk_level || 'high').toLowerCase()}`}>
                      {currentCase.risk_level || 'High'} · {currentCase.risk_score || 90}
                    </span>
                  </div>
                </div>
                <div className="active-case-subnav">
                  <button
                    className={`active-case-subitem ${activeTab === 'overview' && pathname.startsWith('/cases/') && !pathname.endsWith('/graph') ? 'active' : ''}`}
                    onClick={() => navigate(`/cases/${currentCase.investigation_id}?tab=overview`)}
                  >
                    Overview
                  </button>
                  <button
                    className={`active-case-subitem ${activeTab === 'knowledge-graph' || pathname.endsWith('/graph') ? 'active' : ''}`}
                    onClick={() => navigate(`/cases/${currentCase.investigation_id}/graph`)}
                    title="Case Knowledge Graph"
                  >
                    Knowledge graph
                  </button>
                  <button
                    className={`active-case-subitem ${activeTab === 'fund-flow' ? 'active' : ''}`}
                    onClick={() => navigate(`/cases/${currentCase.investigation_id}?tab=fund-flow`)}
                  >
                    Fund flow
                  </button>
                  <button
                    className={`active-case-subitem ${activeTab === 'transactions' ? 'active' : ''}`}
                    onClick={() => navigate(`/cases/${currentCase.investigation_id}?tab=transactions`)}
                  >
                    Transactions
                  </button>
                  <button
                    className={`active-case-subitem ${activeTab === 'topology' ? 'active' : ''}`}
                    onClick={() => navigate(`/cases/${currentCase.investigation_id}?tab=topology`)}
                  >
                    Patterns
                  </button>
                  <button
                    className={`active-case-subitem ${activeTab === 'time-machine' ? 'active' : ''}`}
                    onClick={() => navigate(`/cases/${currentCase.investigation_id}?tab=time-machine`)}
                  >
                    Timeline
                  </button>
                  <button
                    className={`active-case-subitem ${activeTab === 'evidence' ? 'active' : ''}`}
                    onClick={() => navigate(`/cases/${currentCase.investigation_id}?tab=evidence`)}
                  >
                    Evidence
                  </button>
                  <button
                    className={`active-case-subitem ${activeTab === 'report' ? 'active' : ''}`}
                    onClick={() => navigate(`/cases/${currentCase.investigation_id}?tab=report`)}
                  >
                    Report
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* INTELLIGENCE SECTION */}
          <div className="nav-section">
            {!collapsed && <div className="nav-section-label">Intelligence</div>}
            <button
              className={`nav-item ${pathname.includes('/graph') ? 'active' : ''}`}
              onClick={() => {
                if (currentCase) {
                  navigate(`/cases/${currentCase.investigation_id}/graph`);
                } else if (cases && cases.length > 0) {
                  navigate(`/cases/${cases[0].id || cases[0]._id}/graph`);
                } else {
                  navigate('/cases');
                }
              }}
              title="Case Knowledge Graph"
            >
              <span className="nav-item-icon"><Icon name="waypoints" size={16} /></span>
              {!collapsed && <span className="nav-item-label">Knowledge graph</span>}
            </button>
            <button
              className={`nav-item ${pathname.startsWith('/network') ? 'active' : ''}`}
              onClick={() => navigate('/network')}
              title="Network"
            >
              <span className="nav-item-icon"><Icon name="network" size={16} /></span>
              {!collapsed && <span className="nav-item-label">Network</span>}
            </button>
            <button
              className={`nav-item ${pathname === '/copilot' ? 'active' : ''}`}
              onClick={() => navigate('/copilot')}
              title="Case assistant"
            >
              <span className="nav-item-icon"><Icon name="messageText" size={16} /></span>
              {!collapsed && <span className="nav-item-label">Ask</span>}
            </button>
            {!collapsed && (
              <form
                className="sidebar-case-lookup"
                onSubmit={e => {
                  e.preventDefault();
                  const trimmed = caseLookupInput.trim();
                  if (!trimmed) return;
                  const matched = cases.find(c =>
                    c.id?.toLowerCase() === trimmed.toLowerCase() ||
                    c.case_reference?.toLowerCase() === trimmed.toLowerCase() ||
                    caseLabel(c.id).toLowerCase() === trimmed.toLowerCase()
                  );
                  const targetId = matched ? matched.id : trimmed;
                  onOpenCase?.(targetId);
                  navigate(`/cases/${targetId}/graph`);
                  setCaseLookupInput('');
                }}
              >
                <div className="sidebar-lookup-wrap">
                  <input
                    type="text"
                    placeholder="Graph by Case #…"
                    value={caseLookupInput}
                    onChange={e => setCaseLookupInput(e.target.value)}
                    className="sidebar-lookup-input"
                    title="Enter Case # (e.g. TX-2026-5C7986) to open Knowledge Graph"
                  />
                  <button type="submit" className="sidebar-lookup-btn" title="Open Case Graph">
                    <Icon name="arrow" size={12} />
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* OPERATIONS SECTION */}
          <div className="nav-section">
            {!collapsed && <div className="nav-section-label">Operations</div>}
            <button
              className={`nav-item ${pathname === '/monitoring' ? 'active' : ''}`}
              onClick={() => navigate('/monitoring')}
              title="Monitoring"
            >
              <span className="nav-item-icon"><Icon name="monitoring" size={16} /></span>
              {!collapsed && <span className="nav-item-label">Monitoring</span>}
            </button>
            <button
              className={`nav-item ${pathname === '/alerts' ? 'active' : ''}`}
              onClick={() => navigate('/alerts')}
              title="Alerts"
            >
              <span className="nav-item-icon"><Icon name="alerts" size={16} /></span>
              {!collapsed && (
                <>
                  <span className="nav-item-label">Alerts</span>
                  {unreadAlerts > 0 && <span className="nav-item-count highlight">{unreadAlerts}</span>}
                </>
              )}
            </button>
          </div>

          {/* DEVELOPERS SECTION */}
          <div className="nav-section">
            {!collapsed && <div className="nav-section-label">Developers</div>}
            <button
              className={`nav-item ${pathname === '/developers/keys' || pathname === '/developers' ? 'active' : ''}`}
              onClick={() => navigate('/developers/keys')}
              title="API keys"
            >
              <span className="nav-item-icon"><Icon name="keys" size={16} /></span>
              {!collapsed && <span className="nav-item-label">API keys</span>}
            </button>
            <button
              className={`nav-item ${pathname === '/developers/console' ? 'active' : ''}`}
              onClick={() => navigate('/developers/console')}
              title="Console"
            >
              <span className="nav-item-icon"><Icon name="console" size={16} /></span>
              {!collapsed && <span className="nav-item-label">Console</span>}
            </button>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          {!collapsed && (
            <div className="providers-status-row" title="Primary: healthy · Secondary: healthy">
              <span>Data sources</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span className="provider-dot" /> Healthy
              </span>
            </div>
          )}

          <button
            className={`nav-item ${pathname.startsWith('/settings') ? 'active' : ''}`}
            onClick={() => navigate('/settings')}
            title="Settings"
          >
            <span className="nav-item-icon"><Icon name="settings" size={16} /></span>
            {!collapsed && <span className="nav-item-label">Settings</span>}
          </button>

          {!collapsed && (
            <div className="user-profile-row" onClick={() => navigate('/settings')}>
              <div className="user-avatar">JP</div>
              <span className="user-name">Dr. J. PremaSagar</span>
            </div>
          )}
        </div>
      </aside>

      {/* Content Column */}
      <div className="content-column">
        {/* 48px Top Context Bar */}
        <header className="top-context-bar">
          <nav className="breadcrumb-list" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.label}>
                {idx > 0 && <span className="breadcrumb-separator">/</span>}
                {crumb.path ? (
                  <button
                    className="breadcrumb-item"
                    onClick={() => navigate(crumb.path)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="breadcrumb-item active">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>

          <div className="top-context-actions">
            {currentCase && (
              <span className="context-telemetry">
                Data as of block #26059512
              </span>
            )}
            {pathname === '/' && (
              <button
                className="btn btn-secondary"
                style={{ height: '28px', fontSize: '12px' }}
                onClick={() => onOpenCase?.('6aba9bf3a9851671145c7986')}
              >
                Sample case TX-2026-5C7986
              </button>
            )}
          </div>
        </header>

        {/* Content Outlet with 120ms Opacity Transition */}
        <main className="outlet-container">
          {children}
        </main>
      </div>

      {/* Global Command Palette Modal (⌘K) */}
      {cmdOpen && (
        <div className="cmd-backdrop" onClick={e => e.target === e.currentTarget && setCmdOpen(false)}>
          <div className="cmd-dialog">
            <div className="cmd-search-header">
              <Icon name="search" size={16} className="text-3" />
              <input
                ref={cmdInputRef}
                className="cmd-search-input"
                value={cmdQuery}
                onChange={e => {
                  setCmdQuery(e.target.value);
                  setCmdIndex(0);
                }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCmdIndex(curr => Math.min(curr + 1, filteredCmds.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCmdIndex(curr => Math.max(curr - 1, 0));
                  } else if (e.key === 'Enter' && filteredCmds[cmdIndex]) {
                    e.preventDefault();
                    runCommand(filteredCmds[cmdIndex]);
                  }
                }}
                placeholder="Search commands, cases, or routes…"
              />
              <span className="kbd-shortcut">ESC</span>
            </div>

            <div className="cmd-list">
              {filteredCmds.length > 0 ? (
                filteredCmds.map((cmd, idx) => (
                  <button
                    key={`${cmd.group}-${cmd.label}`}
                    className={`cmd-item ${idx === cmdIndex ? 'selected' : ''}`}
                    onClick={() => runCommand(cmd)}
                  >
                    <span className="cmd-item-left">
                      <Icon name={cmd.icon || 'cases'} size={14} />
                      <span>{cmd.label}</span>
                    </span>
                    <span className="cmd-item-right">{cmd.group}</span>
                  </button>
                ))
              ) : (
                <div style={{ padding: '24px', textAlign: 'center', color: '#6B6E6A', fontSize: '13px' }}>
                  No matching commands or cases found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
