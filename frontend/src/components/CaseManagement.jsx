import React, { useMemo, useState } from 'react';
import { Badge, Button, CopyValue, EmptyState, Panel, SectionHeader } from './Primitives.jsx';
import { formatDate } from '../utils.js';

const evidenceTypes=['TRANSACTION','WALLET','TRACED_PATH','RISK_INDICATOR','VASP_ATTRIBUTION','EXTERNAL_INTELLIGENCE','RELATED_CASE_RELATIONSHIP','NETWORK_NODE','BRIDGE_INTERACTION','ALERT','TIMELINE_EVENT','REPORT_SNAPSHOT'];

export function CaseInspector({ workspace, onUpdate, onToast }) {
  const item=workspace?.case; const [editing,setEditing]=useState(false); const [form,setForm]=useState({});
  if(!item)return null;
  const open=()=>{setForm({case_title:item.case_title||'',case_summary:item.case_summary||'',assigned_investigator:item.assigned_investigator||'',priority:item.priority||'MEDIUM',tags:(item.tags||[]).join(', '),case_status:item.case_status||'NEW'});setEditing(true);};
  const save=async()=>{try{await onUpdate({...form,tags:form.tags.split(',').map(x=>x.trim()).filter(Boolean)});setEditing(false);onToast('Case details updated.');}catch(error){onToast(error.message,'error');}};
  return <Panel className="case-management"><SectionHeader eyebrow="Case management" title={item.case_title} description={`${item.case_reference} · Last updated ${formatDate(item.updated_at)}`} action={<Button variant="secondary" onClick={open}>Edit case</Button>}/><div className="case-management-grid"><div><span>Status</span><Badge tone={item.case_status==='CLOSED'?'neutral':'blue'}>{item.case_status.replaceAll('_',' ')}</Badge></div><div><span>Priority</span><Badge tone={item.priority==='CRITICAL'?'red':item.priority==='HIGH'?'amber':'neutral'}>{item.priority}</Badge></div><div><span>Assigned investigator</span><strong>{item.assigned_investigator||'Unassigned'}</strong></div><div><span>Tags</span><strong>{(item.tags||[]).join(', ')||'None'}</strong></div></div>{editing&&<div className="case-editor"><label>Case title<input value={form.case_title} onChange={e=>setForm({...form,case_title:e.target.value})}/></label><label>Summary<textarea value={form.case_summary} onChange={e=>setForm({...form,case_summary:e.target.value})}/></label><div className="form-grid"><label>Investigator<input value={form.assigned_investigator} onChange={e=>setForm({...form,assigned_investigator:e.target.value})}/></label><label>Tags (comma-separated)<input value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})}/></label><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}>{['LOW','MEDIUM','HIGH','CRITICAL'].map(x=><option key={x}>{x}</option>)}</select></label><label>Status<select value={form.case_status} onChange={e=>setForm({...form,case_status:e.target.value})}>{['NEW','ACTIVE','UNDER_REVIEW','ESCALATED','CLOSED'].map(x=><option key={x}>{x}</option>)}</select></label></div><div className="inline-actions"><Button onClick={save}>Save case</Button><Button variant="secondary" onClick={()=>setEditing(false)}>Cancel</Button></div></div>}</Panel>;
}

export function EvidenceWorkspace({ workspace, onVerify, onAddNote, onRemoveNote, onAddFinding, onCapture, onToast }) {
  const [filter,setFilter]=useState(''),[type,setType]=useState('ALL'),[note,setNote]=useState(''),[finding,setFinding]=useState({title:'',description:'',evidence_ids:''});
  const evidence=useMemo(()=> (workspace?.evidence||[]).filter(item=>(type==='ALL'||item.evidence_type===type)&&`${item.evidence_id} ${item.title} ${item.transaction_hash||''} ${item.wallet_address||''}`.toLowerCase().includes(filter.toLowerCase())),[workspace,filter,type]);
  const verify=async id=>{try{const result=await onVerify(id);onToast(result.verified?'Evidence integrity verified. SHA-256 matches immutable snapshot.':'Evidence integrity mismatch detected. Snapshot was altered.',result.verified?'success':'error');}catch(error){onToast(error.message,'error');}};
  const saveNote=async()=>{if(!note.trim())return;try{await onAddNote({note_type:'GENERAL_CASE_NOTE',content:note});setNote('');onToast('Investigator note saved.');}catch(error){onToast(error.message,'error');}};
  const deleteNote=async noteId=>{if(!onRemoveNote)return;try{await onRemoveNote(noteId);onToast('Investigator note removed.');}catch(error){onToast(error.message,'error');}};
  const saveFinding=async()=>{if(!finding.title.trim()||!finding.description.trim())return;try{await onAddFinding({...finding,evidence_ids:finding.evidence_ids.split(',').map(x=>x.trim()).filter(Boolean)});setFinding({title:'',description:'',evidence_ids:''});onToast('Finding recorded as investigator-authored material.');}catch(error){onToast(error.message,'error');}};
  return <div className="stack">
    <Panel className="evidence-integrity-card">
      <div className="integrity-banner">
        <span className="integrity-orb"><Icon name="check" size={20}/></span>
        <div>
          <span className="eyebrow">Tamper-evident chain of custody</span>
          <h3>Evidence Integrity & SHA-256 Hashing</h3>
          <p>TraceX serializes evidence snapshots into canonical JSON with sorted keys and computes a cryptographic SHA-256 digest upon capture. Verification checks that stored snapshots match their original integrity hash.</p>
        </div>
      </div>
      <div className="integrity-pipeline">
        <div className="pipeline-step"><span>1</span><strong>Snapshot Captured</strong><small>Raw transaction / wallet / path frozen in time</small></div>
        <div className="pipeline-arrow"><Icon name="arrow"/></div>
        <div className="pipeline-step"><span>2</span><strong>Canonical JSON</strong><small>Deterministic key sorting</small></div>
        <div className="pipeline-arrow"><Icon name="arrow"/></div>
        <div className="pipeline-step"><span>3</span><strong>SHA-256 Hash</strong><small>Cryptographic fingerprint</small></div>
        <div className="pipeline-arrow"><Icon name="arrow"/></div>
        <div className="pipeline-step"><span>4</span><strong>Tamper Detection</strong><small>Instant mismatch if snapshot mutated</small></div>
      </div>
    </Panel>
    <Panel><SectionHeader eyebrow="Evidence center" title="Retained evidence ledger" description="Captured snapshots are immutable; SHA-256 verification proves the stored snapshot has not changed." action={<Button onClick={()=>onCapture({evidence_type:'REPORT_SNAPSHOT',title:'Investigation report snapshot',source_type:'investigator_workspace'})}>Capture new evidence</Button>}/><div className="evidence-filters"><input placeholder="Search evidence ID, title, wallet, hash" value={filter} onChange={e=>setFilter(e.target.value)}/><select value={type} onChange={e=>setType(e.target.value)}><option>ALL</option>{evidenceTypes.map(x=><option key={x}>{x}</option>)}</select></div>{evidence.length?<div className="evidence-list">{evidence.map(item=><article key={item.evidence_id} className="evidence-ledger-item"><div className="evidence-meta-col"><div className="evidence-head-row"><Badge tone="purple">{item.evidence_type.replaceAll('_',' ')}</Badge><span className="evidence-code">{item.evidence_id}</span><span className="evidence-source">Provider: {item.source_provider||'TraceX'}</span></div><strong>{item.title}</strong><small>Captured: {formatDate(item.captured_at)}</small>{item.transaction_hash&&<div className="evidence-ref"><span>Hash:</span><CopyValue value={item.transaction_hash}/></div>}{item.wallet_address&&<div className="evidence-ref"><span>Wallet:</span><CopyValue value={item.wallet_address}/></div>}{item.integrity_hash&&<div className="evidence-hash"><span>SHA-256:</span><code>{item.integrity_hash.slice(0, 16)}…{item.integrity_hash.slice(-8)}</code></div>}</div><div className="evidence-actions-col"><Badge tone={item.integrity_status==='tampered'?'danger':'success'} dot>{item.integrity_status==='tampered'?'TAMPER DETECTED':'SHA-256 VERIFIED'}</Badge><Button variant="secondary" onClick={()=>verify(item.evidence_id)}>Verify integrity</Button></div></article>)}</div>:<EmptyState title="No retained evidence yet" description="Capture a transaction, wallet, path, alert, or report snapshot from the investigation."/>}</Panel>
    <Panel><SectionHeader eyebrow="Investigator workspace" title="Notes and findings" description="Notes are working leads. Formal findings cite retained evidence IDs."/><div className="form-grid"><label>New note<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Record an investigative observation…"/></label><div className="align-end"><Button onClick={saveNote}>Save note</Button></div></div><div className="finding-form"><label>Finding title<input value={finding.title} onChange={e=>setFinding({...finding,title:e.target.value})}/></label><label>Evidence IDs<input value={finding.evidence_ids} onChange={e=>setFinding({...finding,evidence_ids:e.target.value})} placeholder="EV-0001, EV-0002"/></label><label>Finding description<textarea value={finding.description} onChange={e=>setFinding({...finding,description:e.target.value})}/></label><Button onClick={saveFinding}>Create finding</Button></div><div className="workspace-records">{(workspace?.findings||[]).map(item=><article key={item.finding_id}><Badge tone="amber">{item.classification||'FINDING'}</Badge><strong>{item.finding_id} · {item.title}</strong><p>{item.description}</p><small>Evidence: {(item.evidence_ids||[]).join(', ')||'none cited'}</small></article>)}{(workspace?.notes||[]).slice(0,8).map(item=><article key={item.note_id}><div className="note-head"><Badge>{item.note_type}</Badge><strong>{item.note_id}</strong>{onRemoveNote&&<button className="icon-button text-muted" onClick={()=>deleteNote(item.note_id)} aria-label="Delete note" title="Delete note"><Icon name="close" size={14}/></button>}</div><p>{item.content}</p></article>)}</div></Panel>
  </div>;
}

export function EvidenceCapture({ draft, onSave, onClose }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    evidence_type: draft?.evidence_type || 'TRANSACTION',
    title: draft?.title || '',
    wallet_address: draft?.wallet_address || '',
    transaction_hash: draft?.transaction_hash || '',
    source_type: draft?.source_type || 'investigator_workspace',
    source_provider: draft?.source_provider || 'TraceX',
    investigator_label: '',
    investigator_note: '',
    snapshot: draft?.snapshot || null
  });

  React.useEffect(() => {
    if (draft) {
      setStep(1);
      setForm({
        evidence_type: draft.evidence_type || 'TRANSACTION',
        title: draft.title || '',
        wallet_address: draft.wallet_address || '',
        transaction_hash: draft.transaction_hash || '',
        source_type: draft.source_type || 'investigator_workspace',
        source_provider: draft.source_provider || 'TraceX',
        investigator_label: '',
        investigator_note: '',
        snapshot: draft.snapshot || null
      });
    }
  }, [draft]);

  if (!draft) return null;

  const handleCapture = () => {
    onSave(form);
  };

  return (
    <div className="drawer-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <aside className="drawer evidence-wizard-drawer" role="dialog" aria-modal="true" aria-label="Capture investigation evidence">
        <header>
          <div>
            <span className="eyebrow">Evidence preservation wizard</span>
            <h2>Capture Investigation Evidence</h2>
            <p>Court-ready evidence snapshotting with cryptographic SHA-256 integrity verification.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog"><Icon name="close"/></button>
        </header>
        <div className="wizard-stepper">
          <button className={`step-tab ${step===1?'active':step>1?'done':''}`} onClick={()=>setStep(1)}><span>1</span> What</button>
          <button className={`step-tab ${step===2?'active':step>2?'done':''}`} onClick={()=>setStep(2)}><span>2</span> Source</button>
          <button className={`step-tab ${step===3?'active':step>3?'done':''}`} onClick={()=>setStep(3)}><span>3</span> Snapshot</button>
          <button className={`step-tab ${step===4?'active':''}`} onClick={()=>setStep(4)}><span>4</span> Integrity</button>
        </div>
        <div className="drawer-content wizard-body">
          {step === 1 && (
            <div className="wizard-step-pane">
              <span className="eyebrow">Step 1 of 4</span>
              <h3>What are you saving?</h3>
              <p>Select the evidence classification and give it a clear investigative title.</p>
              <label>Evidence Classification
                <select value={form.evidence_type} onChange={e => setForm({ ...form, evidence_type: e.target.value })}>
                  {evidenceTypes.map(x => <option key={x} value={x}>{x.replaceAll('_', ' ')}</option>)}
                </select>
              </label>
              <label>Evidence Title
                <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Rapid movement transfer to intermediary"/>
              </label>
              <label>Investigator Label (Optional)
                <input value={form.investigator_label} onChange={e => setForm({ ...form, investigator_label: e.target.value })} placeholder="e.g. Critical lead, Intermediary wallet"/>
              </label>
            </div>
          )}
          {step === 2 && (
            <div className="wizard-step-pane">
              <span className="eyebrow">Step 2 of 4</span>
              <h3>Source & Provenance</h3>
              <p>Record the origin of this evidence to maintain authentic chain of custody.</p>
              <label>Source Provider
                <input value={form.source_provider} onChange={e => setForm({ ...form, source_provider: e.target.value })} placeholder="e.g. Alchemy, Etherscan, TraceX Tracing"/>
              </label>
              <label>Wallet Address
                <input value={form.wallet_address} onChange={e => setForm({ ...form, wallet_address: e.target.value })} placeholder="0x..."/>
              </label>
              <label>Transaction Hash (if applicable)
                <input value={form.transaction_hash} onChange={e => setForm({ ...form, transaction_hash: e.target.value })} placeholder="0x..."/>
              </label>
            </div>
          )}
          {step === 3 && (
            <div className="wizard-step-pane">
              <span className="eyebrow">Step 3 of 4</span>
              <h3>Immutable Snapshot Preview</h3>
              <p>This payload is frozen in time. Only the bounded attributes below are saved into MongoDB.</p>
              <div className="snapshot-preview-box">
                <pre>{JSON.stringify(form.snapshot || { wallet: form.wallet_address, hash: form.transaction_hash, type: form.evidence_type }, null, 2)}</pre>
              </div>
              <label>Investigator Notes
                <textarea value={form.investigator_note} onChange={e => setForm({ ...form, investigator_note: e.target.value })} placeholder="Add any relevant context about why this was preserved…"/>
              </label>
            </div>
          )}
          {step === 4 && (
            <div className="wizard-step-pane">
              <span className="eyebrow">Step 4 of 4</span>
              <h3>Tamper-Evident SHA-256 Integrity</h3>
              <div className="integrity-explanation-box">
                <div className="explanation-head">
                  <Icon name="check" size={24}/>
                  <div>
                    <strong>SHA-256 Cryptographic Digest</strong>
                    <p>Calculated upon capture using canonical JSON key serialization.</p>
                  </div>
                </div>
                <div className="integrity-detail-list">
                  <div><span>Digest Algorithm:</span><strong>SHA-256</strong></div>
                  <div><span>Key Ordering:</span><strong>Canonical Deterministic</strong></div>
                  <div><span>Tamper Evidence:</span><strong>Any post-capture edit causes verification failure</strong></div>
                  <div><span>Storage:</span><strong>Encapsulated in MongoDB investigation workspace</strong></div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="wizard-footer">
          {step > 1 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button>}
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)}>Next Step <Icon name="arrow"/></Button>
          ) : (
            <Button onClick={handleCapture} icon="check">Capture & Calculate SHA-256</Button>
          )}
        </div>
      </aside>
    </div>
  );
}

