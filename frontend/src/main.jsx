import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  // The complete investigation dashboard remains isolated during the UI migration
  // so its established keyboard controls, report downloads, and graph workflow stay intact.
  return <iframe title="TraceX wallet investigation dashboard" src="/dashboard" />;
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
