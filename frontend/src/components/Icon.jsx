import React from 'react';

const paths = {
  investigate: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/></>,
  network: <><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="m7 7 4 9m6-9-4 9M7 6h10"/></>,
  cases: <><path d="M4 5h5l2 2h9v12H4z"/><path d="M8 11h8m-8 4h5"/></>,
  monitoring: <><path d="M3 12h3l2-5 4 10 2-5h7"/><circle cx="12" cy="12" r="10"/></>,
  alerts: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  reports: <><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 12h6m-6 4h6"/></>,
  copilot: <><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M9 10h.01M15 10h.01M9 15h6M12 2v3"/></>,
  system: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>, arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
  close: <path d="M6 6l12 12M18 6 6 18"/>, check: <path d="m5 12 4 4L19 6"/>,
  external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></>, menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  command: <><path d="M8 8h8M8 12h8M8 16h5"/><path d="M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-5 3v-3H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></>,
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8z"/>, play: <path d="m8 5 11 7-11 7z"/>, pause: <><path d="M9 5v14M15 5v14"/></>,
  zoomIn: <><circle cx="10" cy="10" r="6"/><path d="M10 7v6M7 10h6m2.5 5.5L21 21"/></>,
  zoomOut: <><circle cx="10" cy="10" r="6"/><path d="M7 10h6m2.5 5.5L21 21"/></>,
  target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>
};

export default function Icon({ name, size = 18, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.investigate}</svg>;
}
