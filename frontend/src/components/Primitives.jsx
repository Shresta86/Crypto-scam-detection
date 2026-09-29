import React, { useState } from 'react';
import Icon from './Icon.jsx';
import { copyText, shortAddress } from '../utils.js';

export function Badge({ children, tone = 'neutral', dot = false }) { return <span className={`badge badge-${tone}`}>{dot && <span className="badge-dot"/>}{children}</span>; }
export function Button({ children, variant = 'primary', icon, className = '', ...props }) { return <button className={`button button-${variant} ${className}`} {...props}>{icon && <Icon name={icon}/>}<span>{children}</span></button>; }
export function Panel({ children, className = '', id }) { return <section id={id} className={`panel ${className}`}>{children}</section>; }
export function SectionHeader({ eyebrow, title, description, action }) { return <div className="section-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>{action && <div className="section-action">{action}</div>}</div>; }
export function MetricCard({ label, value, detail, tone = 'blue', icon }) { return <div className={`metric-card metric-${tone}`}><div className="metric-top">{icon && <Icon name={icon}/>}<span>{label}</span></div><strong>{value}</strong>{detail && <small>{detail}</small>}</div>; }
export function EmptyState({ title, description, icon = 'search', action }) { return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={22}/></span><h3>{title}</h3><p>{description}</p>{action}</div>; }
export function ErrorState({ title = 'Unable to load this view', message, onRetry }) { return <div className="error-state" role="alert"><div><strong>{title}</strong><p>{message}</p></div>{onRetry && <Button variant="secondary" onClick={onRetry}>Retry</Button>}</div>; }
export function Skeleton({ lines = 4 }) { return <div className="skeleton-stack" aria-label="Loading">{Array.from({ length: lines }, (_, index) => <span key={index} style={{ width: `${92 - index * 9}%` }}/>)}</div>; }

export function CopyValue({ value, label, compact = true }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await copyText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return <span className="copy-value" title={value}><code>{compact ? shortAddress(value) : value}</code><button onClick={copy} aria-label={`Copy ${label || 'value'}`} title={copied ? 'Copied' : 'Copy'}><Icon name={copied ? 'check' : 'copy'} size={14}/></button></span>;
}

export function Drawer({ title, subtitle, children, onClose }) {
  React.useEffect(()=>{const handler=event=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[onClose]);
  if (!children) return null;
  return <div className="drawer-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}><aside className="drawer" role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">Evidence inspector</span><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close inspector"><Icon name="close"/></button></header><div className="drawer-content">{children}</div></aside></div>;
}

export function Toast({ message, tone = 'success', onClose }) {
  if (!message) return null;
  return <div className={`toast toast-${tone}`} role="status"><Icon name={tone === 'success' ? 'check' : 'alerts'}/><span>{message}</span><button onClick={onClose} aria-label="Dismiss"><Icon name="close" size={14}/></button></div>;
}
