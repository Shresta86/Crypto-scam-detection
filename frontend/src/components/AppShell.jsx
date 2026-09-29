import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { Badge } from './Primitives.jsx';
import { caseLabel, shortAddress } from '../utils.js';

const navigation = [
  ['INVESTIGATION',[['/investigate','investigate','New Investigation'],['/cases','cases','Cases']]],
  ['INTELLIGENCE',[['/network','network','Network Intelligence'],['/monitoring','monitoring','Monitoring'],['/alerts','alerts','Alerts']]],
  ['ANALYSIS',[['/copilot','copilot','Copilot'],['/reports','reports','Reports']]],
  ['SYSTEM',[['/system','system','Data Sources']]]
];

export function navigate(path) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute() {
  const [route, setRoute] = useState(window.location.pathname);
  useEffect(() => { const update = () => setRoute(window.location.pathname); window.addEventListener('popstate', update); return () => window.removeEventListener('popstate', update); }, []);
  return route;
}

export default function AppShell({ children, route, config, currentCase, alerts = [], cases = [] }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);
  useEffect(()=>{const handler=event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();searchRef.current?.focus();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  const active = href => route === href || (href !== '/investigate' && route.startsWith(`${href}/`));
  const search = event => {
    event.preventDefault();
    const normalized = query.trim().toLowerCase();
    const match = cases.find(item => item.id.toLowerCase().includes(normalized) || item.wallet_address?.toLowerCase().includes(normalized));
    if (match) { navigate(`/cases/${match.id}`); setQuery(''); }
  };
  return <div className={`app-shell ${collapsed ? 'shell-collapsed' : ''}`}>
    <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Icon name="menu"/></button>
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand" onClick={() => navigate('/investigate')} role="link" tabIndex="0">
        <span className="brand-mark"><span/><span/><span/></span>
        <div><strong>Trace<span>X</span></strong><small>Financial Intelligence</small></div>
      </div>
      <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><Icon name="close"/></button>
      <nav aria-label="Primary navigation">
        {navigation.map(([group,items])=><React.Fragment key={group}><span className="nav-label">{group}</span>{items.map(([href,icon,label])=><button key={href} title={collapsed ? label : undefined} className={active(href)?'active':''} onClick={()=>{navigate(href);setOpen(false);}}><Icon name={icon}/><span>{label}</span>{label==='Alerts'&&alerts.filter(item=>item.status==='NEW').length>0&&<b>{alerts.filter(item=>item.status==='NEW').length}</b>}</button>)}</React.Fragment>)}
      </nav>
      <div className="sidebar-status">
        <div><span className={`status-orb ${config?.apiConfigured ? 'online' : 'offline'}`}/><div><strong>{config?.apiConfigured ? 'Systems ready' : 'Setup required'}</strong><small>Ethereum · Mainnet</small></div></div>
        <button onClick={() => navigate('/system')}>View status <Icon name="chevron" size={14}/></button>
      </div>
      <button className="sidebar-collapse" onClick={()=>setCollapsed(value=>!value)} aria-label={collapsed?'Expand navigation':'Collapse navigation'}><Icon name="chevron" size={15}/><span>{collapsed?'Expand':'Collapse'}</span></button>
    </aside>
    {open && <button className="sidebar-overlay" onClick={() => setOpen(false)} aria-label="Close navigation"/>}
    <div className="workspace">
      <header className="topbar">
        <form className="global-search" onSubmit={search}>
          <Icon name="search"/><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search wallet, transaction or case" aria-label="Search cases"/>
          <kbd>Ctrl K</kbd>
        </form>
        <div className="topbar-context">
          {currentCase ? <button className="case-context" onClick={() => navigate(`/cases/${currentCase.investigation_id}`)}><span>Active investigation</span><strong>{caseLabel(currentCase.investigation_id)}</strong><small>{shortAddress(currentCase.start_wallet)}</small></button> : <span className="no-context">No active case</span>}
          <button className="notification-button" onClick={() => navigate('/alerts')} aria-label="Open alerts"><Icon name="alerts"/>{alerts.filter(item => item.status === 'NEW').length > 0 && <span/>}</button>
          <Badge tone={config?.apiConfigured ? 'success' : 'warning'} dot>{config?.apiConfigured ? 'Live data' : 'Configuration'}</Badge>
        </div>
      </header>
      <main>{children}</main>
    </div>
  </div>;
}
