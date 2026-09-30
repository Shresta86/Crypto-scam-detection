import React from 'react';
import Icon from './Icon.jsx';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[TraceX ErrorBoundary] Caught render exception:', error, errorInfo);
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.assign('/');
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback(this.state.error, this.handleRetry)
          : this.props.fallback;
      }

      const isWidget = this.props.variant === 'widget';

      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: isWidget ? '220px' : 'calc(100vh - 120px)',
            padding: isWidget ? '20px' : '40px 24px',
            background: 'var(--bg, #0A0B0B)',
            color: 'var(--text, #EDEDEB)',
            textAlign: 'center',
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              maxWidth: '560px',
              width: '100%',
              background: '#111312',
              border: '1px solid #282C29',
              borderRadius: '8px',
              padding: isWidget ? '20px' : '32px 28px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '8px',
                background: '#2A181A',
                border: '1px solid #4D2124',
                color: '#E5484D',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 16px'
              }}
            >
              <Icon name="alerts" size={22} />
            </div>

            <span
              style={{
                fontSize: '11px',
                fontFamily: 'Roboto Mono, monospace',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#E5484D',
                fontWeight: 600,
                display: 'block',
                marginBottom: '6px'
              }}
            >
              INVESTIGATION WORKSPACE EXCEPTION
            </span>

            <h2 style={{ fontSize: isWidget ? '16px' : '20px', fontWeight: 600, margin: '0 0 8px', color: '#EDEDEB' }}>
              {this.props.title || 'Something went wrong rendering this view'}
            </h2>

            <p style={{ fontSize: '13px', color: '#A1A4A0', lineHeight: 1.5, margin: '0 0 16px' }}>
              {this.state.error?.message || 'An unexpected runtime error interrupted execution. Your stored case data remains preserved and intact.'}
            </p>

            {this.state.error && process.env.NODE_ENV !== 'production' && (
              <details style={{ textAlign: 'left', marginBottom: '20px', background: '#0A0B0B', border: '1px solid #232624', borderRadius: '4px', padding: '10px' }}>
                <summary style={{ fontSize: '11px', color: '#6B6E6A', cursor: 'pointer', fontFamily: 'Roboto Mono, monospace' }}>
                  Stack Trace & Diagnostics
                </summary>
                <pre style={{ fontSize: '11px', color: '#E5484D', margin: '8px 0 0', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                className="button button-primary"
                onClick={this.handleRetry}
                style={{ minWidth: '110px' }}
              >
                <span>Retry View</span>
              </button>
              <button
                className="button button-secondary"
                onClick={this.handleBack}
                style={{ minWidth: '100px' }}
              >
                <span>Go Back</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
