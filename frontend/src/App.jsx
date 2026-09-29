import React, { useCallback, useEffect, useState } from 'react';
import AppShell, { navigate, useRoute } from './components/AppShell.jsx';
import { Drawer, ErrorState, Skeleton, Toast } from './components/Primitives.jsx';
import InvestigationPage from './pages/InvestigationPage.jsx';
import { AlertsPage, CasesPage, MonitoringPage, NetworkLanding, ReportsPage, StandaloneCopilot, SystemPage } from './pages/OperationsPages.jsx';
import { api } from './api.js';
import { caseLabel, formatDate, riskTone, shortAddress } from './utils.js';
import LandingPage from './pages/LandingPage.jsx';

export default function App() {
  const route = useRoute();
  const [config,setConfig]=useState(null),[cases,setCases]=useState([]),[monitors,setMonitors]=useState([]),[alerts,setAlerts]=useState([]);
  const [current,setCurrent]=useState(null),[workspace,setWorkspace]=useState(null),[network,setNetwork]=useState(null),[networkLoading,setNetworkLoading]=useState(false),[networkError,setNetworkError]=useState('');
  const [loading,setLoading]=useState(false),[error,setError]=useState(null),[toast,setToast]=useState(null),[compare,setCompare]=useState(null),[compareLoading,setCompareLoading]=useState(false);
  const notify=(message,tone='success')=>setToast({message,tone});

  const refresh=useCallback(async()=>{
    const results=await Promise.allSettled([api.config(),api.history(),api.monitors(),api.alerts()]);
    if(results[0].status==='fulfilled')setConfig(results[0].value);
    if(results[1].status==='fulfilled')setCases(results[1].value);
    if(results[2].status==='fulfilled')setMonitors(results[2].value.wallets||[]);
    if(results[3].status==='fulfilled')setAlerts(results[3].value||[]);
  },[]);
  useEffect(()=>{refresh();},[refresh]);

  const loadNetwork=useCallback(async id=>{setNetworkLoading(true);setNetworkError('');try{setNetwork(await api.network(id));}catch(err){setNetworkError(err.message);setNetwork(null);}finally{setNetworkLoading(false);}},[]);
  const loadWorkspace=useCallback(async id=>{const value=await api.workspace(id);setWorkspace(value);return value;},[]);
  const loadCase=useCallback(async(id,tab)=>{setLoading(true);setError(null);try{const data=await api.case(id);setCurrent(data);await Promise.all([loadNetwork(id),loadWorkspace(id),api.monitors(data.start_wallet).then(setMonitorFromSingle),api.alerts(data.start_wallet).then(setAlerts)]);if(tab==='network')navigate(`/network/${id}`);else if(tab==='copilot')navigate('/copilot');else navigate(`/cases/${id}`);}catch(err){setError(err);}finally{setLoading(false);}},[loadNetwork,loadWorkspace]);
  const setMonitorFromSingle=item=>setMonitors(values=>{const rest=values.filter(value=>value.wallet_address?.toLowerCase()!==item.wallet_address?.toLowerCase());return item.status==='not_monitoring'?rest:[item,...rest];});

  useEffect(()=>{
    const match=route.match(/^\/(?:cases|network)\/([a-f0-9]{24})$/i);
    if(match&&current?.investigation_id!==match[1])loadCase(match[1],route.startsWith('/network/')?'network':undefined);
  },[route,current?.investigation_id,loadCase]);

  const investigate=async wallet=>{setLoading(true);setError(null);setCurrent(null);setWorkspace(null);setNetwork(null);try{const data=await api.trace(wallet);setCurrent(data);await refresh();await Promise.all([loadNetwork(data.investigation_id),loadWorkspace(data.investigation_id)]);notify(`${caseLabel(data.investigation_id)} created from live blockchain evidence.`);navigate(`/cases/${data.investigation_id}`);}catch(err){setError(err);}finally{setLoading(false);}};
  const monitor=current?monitors.find(item=>item.wallet_address?.toLowerCase()===current.start_wallet?.toLowerCase()):null;
  const toggleMonitor=async()=>{if(!current)return;try{const result=monitor?.status==='monitoring'?await api.stopMonitor(current.start_wallet):await api.startMonitor(current.start_wallet,current.investigation_id);setMonitorFromSingle(result);notify(result.status==='monitoring'?'Wallet monitoring started.':'Wallet monitoring stopped.');}catch(err){notify(err.message,'error');}};
  const stopMonitor=async wallet=>{try{const result=await api.stopMonitor(wallet);setMonitorFromSingle(result);notify('Wallet monitoring stopped.');}catch(err){notify(err.message,'error');}};
  const removeCase=async id=>{if(!window.confirm(`Delete ${caseLabel(id)} and its derived network index? This cannot be undone.`))return;try{await api.removeCase(id);if(current?.investigation_id===id){setCurrent(null);setNetwork(null);}await refresh();notify(`${caseLabel(id)} deleted.`);}catch(err){notify(err.message,'error');}};
  const updateAlert=async(id,action)=>{try{await api.updateAlert(id,action);setAlerts(await api.alerts());notify(`Alert ${action === 'resolve' ? 'resolved' : 'acknowledged'}.`);}catch(err){notify(err.message,'error');}};
  const compareCases=async otherId=>{if(!current)return;setCompareLoading(true);setCompare({loading:true});try{setCompare(await api.compare(current.investigation_id,otherId));}catch(err){setCompare({error:err.message});}finally{setCompareLoading(false);}};
  const updateCase=async payload=>{if(!current)return;const result=await api.updateCase(current.investigation_id,payload);setCurrent(value=>({...value,case:result.case}));await Promise.all([loadWorkspace(current.investigation_id),refresh()]);};
  const addEvidence=async payload=>{if(!current)return;const result=await api.addEvidence(current.investigation_id,payload);await loadWorkspace(current.investigation_id);await refresh();return result;};
  const verifyEvidence=async evidenceId=>{const result=await api.verifyEvidence(current.investigation_id,evidenceId);await loadWorkspace(current.investigation_id);return result;};
  const addNote=async payload=>{const result=await api.addNote(current.investigation_id,payload);await loadWorkspace(current.investigation_id);return result;};
  const addFinding=async payload=>{const result=await api.addFinding(current.investigation_id,payload);await loadWorkspace(current.investigation_id);return result;};

  if(route==='/')return <LandingPage/>;
  const content=renderRoute({route,config,cases,monitors,alerts,current,workspace,network,networkLoading,networkError,loading,error,monitor,investigate,loadCase,removeCase,toggleMonitor,stopMonitor,updateAlert,notify,compareCases,updateCase,addEvidence,verifyEvidence,addNote,addFinding});
  return <AppShell route={route} config={config} currentCase={current} alerts={alerts} cases={cases}>{content}<Toast message={toast?.message} tone={toast?.tone} onClose={()=>setToast(null)}/><CompareDrawer comparison={compare} loading={compareLoading} onClose={()=>setCompare(null)}/></AppShell>;
}

function renderRoute(context){
  const {route,cases,monitors,alerts,current,network,networkLoading,networkError,loading,error,monitor}=context;
  const requestedTab=new URLSearchParams(window.location.search).get('tab')||'overview';
  if(route==='/investigate')return <InvestigationPage investigation={null} onInvestigate={context.investigate} loading={loading} error={error} recent={cases} onOpenCase={context.loadCase}/>;
  if(route==='/cases')return <CasesPage cases={cases} monitors={monitors} onOpenCase={context.loadCase} onDelete={context.removeCase}/>;
  if(/^\/cases\/[a-f0-9]{24}$/i.test(route))return loading&&!current?<LoadingPage/>:error&&!current?<ErrorState message={error.message}/>:<InvestigationPage investigation={current} workspace={context.workspace} network={network} networkLoading={networkLoading} networkError={networkError} monitor={monitor} alerts={alerts} onMonitor={context.toggleMonitor} recent={cases} onOpenCase={context.loadCase} onCompare={context.compareCases} onToast={context.notify} onUpdateCase={context.updateCase} onAddEvidence={context.addEvidence} onVerifyEvidence={context.verifyEvidence} onAddNote={context.addNote} onAddFinding={context.addFinding} initialTab={requestedTab}/>;
  if(route==='/network')return <NetworkLanding cases={cases} onOpenCase={context.loadCase}/>;
  if(/^\/network\/[a-f0-9]{24}$/i.test(route))return loading&&!current?<LoadingPage/>:<InvestigationPage investigation={current} workspace={context.workspace} network={network} networkLoading={networkLoading} networkError={networkError} monitor={monitor} alerts={alerts} onMonitor={context.toggleMonitor} recent={cases} onOpenCase={context.loadCase} onCompare={context.compareCases} onToast={context.notify} onUpdateCase={context.updateCase} onAddEvidence={context.addEvidence} onVerifyEvidence={context.verifyEvidence} onAddNote={context.addNote} onAddFinding={context.addFinding} initialTab="network"/>;
  if(route==='/monitoring')return <MonitoringPage monitors={monitors} cases={cases} onOpenCase={context.loadCase} onStop={context.stopMonitor} onStart={()=>navigate('/investigate')}/>;
  if(route==='/alerts')return <AlertsPage alerts={alerts} onUpdate={context.updateAlert} onOpenCase={context.loadCase}/>;
  if(route==='/reports')return <ReportsPage cases={cases} current={current} network={network} onOpenCase={context.loadCase} onToast={context.notify}/>;
  if(route==='/copilot')return <StandaloneCopilot current={current} cases={cases} onOpenCase={context.loadCase}/>;
  if(route==='/system')return <SystemPage config={context.config}/>;
  return <div className="not-found"><h1>Workspace not found</h1><p>The requested TraceX route does not exist.</p><button onClick={()=>navigate('/investigate')}>Return to investigation</button></div>;
}

function LoadingPage(){return <div className="page-enter"><div className="page-header"><div><span className="eyebrow">Stored evidence</span><h1>Loading investigation</h1><p>Restoring complete case context from MongoDB.</p></div></div><div className="panel"><Skeleton lines={9}/></div></div>;}

function CompareDrawer({comparison,onClose}){
  if(!comparison)return null;
  return <Drawer title="Case evidence comparison" subtitle="Deterministic overlap and factual differences" onClose={onClose}>{comparison.loading?<Skeleton lines={8}/>:comparison.error?<ErrorState message={comparison.error}/>:<div className="comparison"><div className="comparison-score"><span>Similarity</span><strong>{comparison.relationship?.similarity_score||0}<small>/100</small></strong></div><div className="comparison-cases"><CaseColumn data={comparison.case_a}/><span className="compare-vs">VS</span><CaseColumn data={comparison.case_b}/></div><h3>Shared evidence signals</h3><div className="reason-chips">{(comparison.relationship?.reasons||[]).map(reason=><span key={reason.type}><b>+{reason.points}</b>{reason.type.replaceAll('_',' ')}</span>)}</div><h3>Observed differences</h3><div className="comparison-differences">{Object.entries(comparison.differences||{}).map(([key,value])=><div key={key}><span>{key.replaceAll('_',' ')}</span><strong>{String(value.case_a)}</strong><i>vs</i><strong>{String(value.case_b)}</strong></div>)}</div><p className="disclaimer">Shared infrastructure supports investigation prioritization and does not prove common ownership or criminal coordination.</p></div>}</Drawer>;
}
function CaseColumn({data}){return <div><span className="eyebrow">{caseLabel(data?.case_id)}</span><strong>{shortAddress(data?.wallet)}</strong><small>{formatDate(data?.investigated_at)}</small><b className={`text-${riskTone(data?.risk_level)}`}>{data?.risk_level} · {data?.risk_score}</b></div>;}
