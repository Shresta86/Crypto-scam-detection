import React, { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { api } from '../api.js';
import { navigate } from '../components/AppShell.jsx';

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('jakkulaayushpreetham@gmail.com');
  const [password, setPassword] = useState('ayush2006');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchParams = new URLSearchParams(window.location.search);
  const redirectUrl = searchParams.get('redirect') || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please provide both authorized email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.login(email.trim(), password, rememberMe);
      if (onLoginSuccess) {
        onLoginSuccess(res.user);
      }
      navigate(redirectUrl);
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-viewport" style={{
      minHeight: '100vh',
      width: '100vw',
      background: 'radial-gradient(circle at 50% 20%, #161a18 0%, #0A0B0B 70%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: '#111312',
        border: '1px solid #232624',
        borderRadius: '12px',
        padding: '24px 26px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
        boxSizing: 'border-box'
      }}>
        {/* Header / Institutional Branding */}
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px',
            borderRadius: '9px',
            background: 'linear-gradient(135deg, #1f2723, #131715)',
            border: '1px solid #2e3833',
            color: '#3FB68B',
            marginBottom: '10px',
            boxShadow: '0 4px 12px rgba(63, 182, 139, 0.15)'
          }}>
            <Icon name="network" size={22} />
          </div>
          
          <h1 style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#EDEDEB',
            letterSpacing: '0.04em',
            margin: '0 0 10px 0',
            textTransform: 'uppercase'
          }}>
            TraceX
          </h1>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(217, 119, 6, 0.12)',
            border: '1px solid rgba(217, 119, 6, 0.3)',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '10.5px',
            fontWeight: 600,
            color: '#F59E0B',
            letterSpacing: '0.04em'
          }}>
            <span>RESTRICTED ACCESS · AUTHORIZED PERSONNEL ONLY</span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            padding: '12px 14px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: '#F87171',
            fontSize: '13px'
          }}>
            <Icon name="close" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '11.5px',
              fontWeight: 500,
              color: '#A1A4A0',
              marginBottom: '5px'
            }}>
              Investigator / Official Email
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="investigator@agency.gov"
                style={{
                  width: '100%',
                  height: '38px',
                  background: '#0A0B0B',
                  border: '1px solid #232624',
                  borderRadius: '6px',
                  padding: '0 12px',
                  color: '#EDEDEB',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3FB68B'}
                onBlur={(e) => e.target.style.borderColor = '#232624'}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <label style={{
                fontSize: '11.5px',
                fontWeight: 500,
                color: '#A1A4A0'
              }}>
                Security Credentials / Password
              </label>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                style={{
                  width: '100%',
                  height: '38px',
                  background: '#0A0B0B',
                  border: '1px solid #232624',
                  borderRadius: '6px',
                  padding: '0 38px 0 12px',
                  color: '#EDEDEB',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = '#3FB68B'}
                onBlur={(e) => e.target.style.borderColor = '#232624'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#6B6E6A',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'visibilityOff' : 'visibility'} size={15} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '11.5px',
              color: '#A1A4A0',
              cursor: 'pointer',
              userSelect: 'none'
            }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  accentColor: '#3FB68B',
                  cursor: 'pointer'
                }}
              />
              Remember workstation
            </label>
            <span style={{ fontSize: '10.5px', color: '#6B6E6A' }}>Secured by JWT/SHA-256</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: '40px',
              background: loading ? '#284639' : '#3FB68B',
              color: '#0A0B0B',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13.5px',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '4px',
              transition: 'background-color 0.15s ease',
              boxShadow: '0 2px 8px rgba(63, 182, 139, 0.25)'
            }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{
                  width: '15px',
                  height: '15px',
                  border: '2px solid rgba(10,11,11,0.2)',
                  borderTopColor: '#0A0B0B',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                  display: 'inline-block'
                }} />
                <span>Verifying credentials…</span>
              </>
            ) : (
              <>
                <Icon name="check" size={15} />
                <span>Authenticate & Access Workspace</span>
              </>
            )}
          </button>
        </form>

        {/* Footer Note */}
        <div style={{
          marginTop: '18px',
          paddingTop: '14px',
          borderTop: '1px solid #1E201F',
          textAlign: 'center',
          fontSize: '10.5px',
          color: '#6B6E6A',
          lineHeight: '1.4'
        }}>
          All actions are timestamped and recorded in the audit trail.
        </div>
      </div>
    </div>
  );
}
