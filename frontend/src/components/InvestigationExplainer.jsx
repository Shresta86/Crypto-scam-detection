import React, { useState, useEffect, useMemo, useRef } from "react";
import Icon from "./Icon.jsx";
import GraphCanvas from "./GraphCanvas.jsx";
import { CopyValue, Panel } from "./Primitives.jsx";
import { formatAmount, formatDate } from "../utils.js";

function generateReplayEvents(transactions, startWallet, network) {
  const txs = [...transactions].filter(t => t.timestamp).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (txs.length === 0) return { chapters: [], events: [] };

  const events = [];
  const chapters = [];

  let currentChapter = null;
  const newChapter = (title, description, txsSubset) => {
    const chapter = { id: chapters.length + 1, title, description, events: [] };
    chapters.push(chapter);
    return chapter;
  };

  // State trackers
  const processedHashes = new Set();
  
  // Simple grouping heuristics based on TraceX risk rules
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    if (processedHashes.has(tx.hash)) continue;

    let eventType = "NORMAL_TRANSFER";
    let groupTitle = "OBSERVED TRANSFER";
    let groupDesc = "Funds were transferred between wallets.";
    let groupedTxs = [tx];
    
    // Check for fund splitting (1 sender -> multiple receivers close in time)
    if (tx.direction === "OUT") {
      const splits = txs.slice(i, i + 5).filter(t => 
        t.direction === "OUT" && 
        t.from?.toLowerCase() === tx.from?.toLowerCase() &&
        Math.abs(new Date(t.timestamp) - new Date(tx.timestamp)) < 10 * 60 * 1000 // 10 minutes
      );
      if (splits.length >= 3) {
        eventType = "FUND_SPLITTING";
        groupTitle = "FUND SPLITTING";
        groupDesc = "Funds were distributed across multiple counterparties.";
        groupedTxs = splits;
      }
    }

    // Check for exchange interaction
    if (groupedTxs.length === 1 && tx.exchange) {
      eventType = "EXCHANGE_INTERACTION";
      groupTitle = "VASP INTERACTION";
      groupDesc = `A downstream wallet interacted with a known exchange endpoint (${tx.exchange}).`;
    }

    // Initial Transfer
    if (i === 0 && tx.to?.toLowerCase() === startWallet?.toLowerCase()) {
      eventType = "INITIAL_TRANSFER";
      groupTitle = "FUNDS ENTERED";
      groupDesc = `${formatAmount(tx.amount)} ${tx.asset} entered the investigated wallet.`;
    }

    // Check related cases
    if (groupedTxs.length === 1 && network?.related_cases) {
      const related = network.related_cases.find(c => 
        c.shared_wallets?.includes(tx.from?.toLowerCase()) || 
        c.shared_wallets?.includes(tx.to?.toLowerCase())
      );
      if (related) {
        eventType = "RELATED_INVESTIGATION";
        groupTitle = "RELATED INVESTIGATION DETECTED";
        groupDesc = `Potential shared infrastructure was found across stored cases (${related.case_label || related.case_id}).`;
      }
    }

    // If chapter doesn't exist or we found a major event, create new chapter
    if (!currentChapter || eventType !== "NORMAL_TRANSFER" || currentChapter.events.length >= 5) {
      currentChapter = newChapter(
        groupTitle, 
        groupDesc,
        groupedTxs
      );
    }

    const event = {
      id: `evt-${i}`,
      type: eventType,
      transactions: groupedTxs,
      timestamp: groupedTxs[0].timestamp,
      chapterId: currentChapter.id
    };
    
    currentChapter.events.push(event);
    events.push(event);

    groupedTxs.forEach(t => processedHashes.add(t.hash));
  }

  return { chapters, events };
}

export default function InvestigationExplainer({ investigation, network, onClose }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const replayRef = useRef(null);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else replayRef.current?.requestFullscreen?.();
  };

  const { chapters, events } = useMemo(() => 
    generateReplayEvents(investigation.transactions || [], investigation.start_wallet, network),
  [investigation, network]);

  useEffect(() => {
    if (!playing || events.length === 0) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => {
        if (prev >= events.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 2000 / speed);
    return () => clearInterval(timer);
  }, [playing, speed, events.length]);

  const currentEvent = events[currentIndex];
  const activeChapter = currentEvent ? chapters.find(c => c.id === currentEvent.chapterId) : null;
  
  // Reconstruct graph up to current index
  const visibleTxs = useMemo(() => {
    if (!events.length) return [];
    const visibleEvents = events.slice(0, currentIndex + 1);
    return visibleEvents.flatMap(e => e.transactions);
  }, [events, currentIndex]);

  const graph = investigation.graph || { nodes: [], edges: [] };
  const visibleHashes = new Set(visibleTxs.map(t => t.hash));
  const activeHashes = new Set((currentEvent?.transactions || []).map(t => t.hash));
  
  // Nodes that are part of visible transactions
  const visibleAddresses = new Set(visibleTxs.flatMap(t => [t.from?.toLowerCase(), t.to?.toLowerCase(), t.counterparty?.toLowerCase()]));
  // Always keep start_wallet visible
  if (investigation.start_wallet) visibleAddresses.add(investigation.start_wallet.toLowerCase());

  const replayGraph = useMemo(() => {
    return {
      nodes: graph.nodes.map(n => ({
        ...n, 
        // fade nodes that haven't appeared yet
        opacity: visibleAddresses.has(n.address?.toLowerCase() || n.id?.toLowerCase()) ? 1 : 0.2
      })),
      edges: graph.edges.map(e => ({
        ...e,
        // fade edges that haven't happened yet
        opacity: visibleHashes.has(e.hash) ? 1 : 0.1,
        isActive: activeHashes.has(e.hash)
      }))
    };
  }, [graph, visibleAddresses, visibleHashes, activeHashes]);

  return (
    <div className="explainer-mode" ref={replayRef}>
      <div className="explainer-header">
        <div>
          <span className="eyebrow">Interactive Reconstruction</span>
          <h2>Investigation Replay</h2>
        </div>
        <div className="explainer-actions">
          <button className="button button-ghost" onClick={toggleFullscreen}><Icon name="external" /> Fullscreen replay</button>
          <button className="button button-ghost" onClick={onClose}>Exit Explanation <Icon name="close" /></button>
        </div>
      </div>

      <div className="explainer-layout">
        <Panel className="explainer-sidebar">
          {chapters.length === 0 ? (
            <p>No timestamped events available for replay.</p>
          ) : (
            <div className="explainer-chapters">
              {chapters.map(chap => (
                <div key={chap.id} className={`explainer-chapter ${activeChapter?.id === chap.id ? 'active' : ''}`}>
                  <span className="chapter-num">CHAPTER {chap.id}</span>
                  <h3>{chap.title}</h3>
                  <p>{chap.description}</p>
                  
                  {activeChapter?.id === chap.id && currentEvent && (
                    <div className="explainer-current-event">
                      {currentEvent.transactions.map((tx, idx) => (
                        <div key={idx} className="event-tx-item">
                          <div><CopyValue value={tx.from} /> → <CopyValue value={tx.to} /></div>
                          <strong>{formatAmount(tx.amount)} {tx.asset}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
        
        <div className="explainer-main">
          <Panel className="graph-panel">
             {/* We will pass replayGraph to GraphCanvas */}
             <GraphCanvas 
               graph={replayGraph} 
               title="Fund-flow Reconstruction" 
               transactions={investigation.transactions} 
               network={network}
               replayState={{ isReplaying: true, activeHashes, currentEvent }}
             />
          </Panel>

          <Panel className="explainer-timeline-bar">
             <div className="timeline-controls">
                <button onClick={() => { setCurrentIndex(0); setPlaying(false); }} title="Restart"><Icon name="refresh" /></button>
                <button onClick={() => { setCurrentIndex(index => Math.max(0, index - 5)); setPlaying(false); }} title="Back 5 events" aria-label="Back 5 events"><Icon name="rewind" /></button>
                <button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))} title="Previous event" aria-label="Previous event">‹</button>
                <button className="timeline-play-btn button-primary" onClick={() => setPlaying(!playing)}>
                  <Icon name={playing ? 'pause' : 'play'} /> {playing ? 'Pause' : 'Play All'}
                </button>
                <button onClick={() => setCurrentIndex(Math.min(events.length - 1, currentIndex + 1))} title="Next event" aria-label="Next event">›</button>
                <button onClick={() => { setCurrentIndex(index => Math.min(events.length - 1, index + 5)); setPlaying(false); }} title="Forward 5 events" aria-label="Forward 5 events"><Icon name="fastForward" /></button>
                
                <div className="speed-toggles">
                  {[1, 2, 4, 8, 16].map(s => (
                    <button key={s} className={speed === s ? 'active' : ''} onClick={() => setSpeed(s)}>{s}x</button>
                  ))}
                </div>
             </div>

             <div className="timeline-scrubber">
               <input 
                 type="range" 
                 min="0" 
                 max={Math.max(0, events.length - 1)} 
                 value={currentIndex} 
                 onChange={e => { setCurrentIndex(Number(e.target.value)); setPlaying(false); }}
               />
               <div className="timeline-labels">
                 <span>{formatDate(events[0]?.timestamp)}</span>
                 <span>{formatDate(currentEvent?.timestamp)}</span>
                 <span>{formatDate(events[events.length - 1]?.timestamp)}</span>
               </div>
             </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
