import React, { useState } from 'react';
import Icon from './Icon.jsx';

export function ExplainView({ title, lookingAt, detected, howToUse, tryThis }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`explain-view ${open ? 'open' : ''}`}>
      <div className="explain-toggle-bar">
        <button className="explain-toggle-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="explain-badge">?</span>
          <strong>Explain this view</strong>
          <small>{title}</small>
          <span className="explain-chevron"><Icon name={open ? 'chevronUp' : 'chevron'} size={14}/></span>
        </button>
      </div>
      {open && (
        <div className="explain-drawer-body">
          <div className="explain-grid">
            <div className="explain-col">
              <span className="eyebrow">Visual scope</span>
              <h4>What you are looking at</h4>
              <p>{lookingAt}</p>
            </div>
            <div className="explain-col">
              <span className="eyebrow">Deterministic analysis</span>
              <h4>What TraceX detected</h4>
              <p>{detected}</p>
            </div>
            <div className="explain-col">
              <span className="eyebrow">Investigator guidance</span>
              <h4>How to use this view</h4>
              <p>{howToUse}</p>
            </div>
            {tryThis && (
              <div className="explain-col try-this-col">
                <span className="eyebrow highlight">Interactive test path</span>
                <h4>Try this now</h4>
                <ol>
                  {tryThis.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ExplainView;
