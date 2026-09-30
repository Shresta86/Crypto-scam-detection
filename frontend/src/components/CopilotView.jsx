import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { marked } from 'marked';
import Icon from './Icon.jsx';
import { Badge, Button, CopyValue } from './Primitives.jsx';
import { api } from '../api.js';
import { caseLabel, shortAddress } from '../utils.js';

// Configure marked for secure, clean parsing
marked.setOptions({
  gfm: true,
  breaks: true
});

// Cache conversations in memory keyed by caseId
const caseChatHistory = new Map();

export default function CopilotView({ investigation, standalone = false }) {
  const caseId = investigation?.investigation_id || investigation?._id || 'unassigned';
  const caseRef = investigation?.case?.case_reference || caseLabel(caseId);

  // Suggested prompt chips as mandated in Phase 4
  const promptChips = [
    'Summarise this case',
    'Trace funds to exchanges',
    'List high-risk wallets',
    'Draft report summary'
  ];

  const [messages, setMessages] = useState(() => {
    return caseChatHistory.get(caseId) || [];
  });

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState('');
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const scrollRef = useRef(null);
  const abortControllerRef = useRef(null);
  const streamTimerRef = useRef(null);

  // Sync messages when caseId changes
  useEffect(() => {
    setMessages(caseChatHistory.get(caseId) || []);
    setStreamingText('');
    setLoading(false);
    setError('');
  }, [caseId]);

  // Save to history map
  const saveMessages = (updater) => {
    setMessages((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      caseChatHistory.set(caseId, next);
      return next;
    });
  };

  // Scroll pinning
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setUserScrolledUp(!isAtBottom);
  };

  useLayoutEffect(() => {
    if (!userScrolledUp && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, userScrolledUp]);

  const stopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (streamTimerRef.current) {
      clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    if (streamingText) {
      saveMessages(prev => [...prev, {
        role: 'assistant',
        text: streamingText + ' [Generation stopped]',
        timestamp: new Date().toISOString()
      }]);
      setStreamingText('');
    }
    setLoading(false);
  };

  const ask = async (questionText) => {
    const query = (questionText || input).trim();
    if (!query || !investigation?.investigation_id || loading) return;

    // Add user message
    const userMsg = { role: 'user', text: query, timestamp: new Date().toISOString() };
    saveMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError('');
    setStreamingText('');
    setUserScrolledUp(false);

    abortControllerRef.current = new AbortController();

    try {
      const result = await api.copilot(
        investigation.investigation_id,
        query,
        abortControllerRef.current.signal
      );

      const fullAnswer = result.answer || 'No analysis available for this inquiry.';

      // Smooth typing stream effect
      let charIndex = 0;
      const chunkSize = Math.max(1, Math.floor(fullAnswer.length / 50));
      
      streamTimerRef.current = setInterval(() => {
        charIndex += chunkSize;
        if (charIndex >= fullAnswer.length) {
          clearInterval(streamTimerRef.current);
          streamTimerRef.current = null;
          saveMessages(prev => [...prev, {
            role: 'assistant',
            text: fullAnswer,
            model: result.model || 'TraceX Forensic Engine',
            guard: result.grounding_guard_applied,
            timestamp: new Date().toISOString()
          }]);
          setStreamingText('');
          setLoading(false);
        } else {
          setStreamingText(fullAnswer.slice(0, charIndex));
        }
      }, 20);

    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message || 'Investigation Copilot temporarily unavailable.');
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
  };

  return (
    <div style={{
      background: '#111312',
      border: '1px solid #232624',
      borderRadius: '10px',
      display: 'flex',
      flexDirection: 'column',
      height: standalone ? 'calc(100vh - 120px)' : '680px',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Copilot Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #232624',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        background: '#141615'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #1f2723, #151a17)',
            border: '1px solid #2e3833',
            color: '#3FB68B',
            display: 'grid',
            placeItems: 'center'
          }}>
            <Icon name="network" size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#EDEDEB' }}>
                TraceX Co-Pilot
              </h2>
              {/* Context: Case #ID chip */}
              <span style={{
                background: '#1E2320',
                border: '1px solid #2D3832',
                color: '#3FB68B',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '4px',
                fontFamily: 'monospace'
              }}>
                Context: {caseRef}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#A1A4A0' }}>
              Structured, evidence-grounded intelligence for case {caseLabel(caseId)}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {investigation.risk && (
            <span className={`risk-tag ${investigation.risk.level === 'HIGH' ? 'high' : 'medium'}`}>
              Risk: {investigation.risk.score}/100
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => saveMessages([])}
              className="btn btn-secondary"
              style={{ height: '26px', fontSize: '11px', padding: '0 8px' }}
              title="Clear current case chat"
            >
              Clear Chat
            </button>
          )}
        </div>
      </div>

      {/* Suggested Prompt Chips */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '10px 20px',
        background: '#0D0E0E',
        borderBottom: '1px solid #1C1E1D',
        overflowX: 'auto',
        whiteSpace: 'nowrap'
      }}>
        <span style={{ fontSize: '11px', color: '#6B6E6A', display: 'flex', alignItems: 'center' }}>
          Prompts:
        </span>
        {promptChips.map(chip => (
          <button
            key={chip}
            onClick={() => ask(chip)}
            disabled={loading}
            style={{
              background: '#171918',
              border: '1px solid #282B29',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '11px',
              color: '#EDEDEB',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onMouseEnter={e => !loading && (e.target.style.borderColor = '#3FB68B')}
            onMouseLeave={e => !loading && (e.target.style.borderColor = '#282B29')}
          >
            <span>{chip}</span>
          </button>
        ))}
      </div>

      {/* Message Thread */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}
      >
        {messages.length === 0 && !loading && !streamingText && (
          <div style={{
            margin: 'auto',
            textAlign: 'center',
            maxWidth: '460px',
            color: '#6B6E6A',
            padding: '40px 20px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#171918',
              border: '1px solid #232624',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
              color: '#3FB68B'
            }}>
              <Icon name="messageText" size={22} />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '15px', color: '#EDEDEB', fontWeight: 600 }}>
              TraceX Case Co-Pilot
            </h3>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
              Ask structured investigative questions about multi-hop transfers, identified VASPs, risk indicators, or related cases.
            </p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: msg.role === 'user' ? '80%' : '94%'
            }}
          >
            <div style={{
              fontSize: '11px',
              color: '#6B6E6A',
              marginBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
            }}>
              <span>{msg.role === 'user' ? 'INVESTIGATOR' : 'TRACEX FORENSIC CO-PILOT'}</span>
              {msg.model && <span style={{ color: '#3FB68B' }}>· {msg.model}</span>}
            </div>

            <div
              style={{
                background: msg.role === 'user' ? '#1F2A24' : '#141615',
                border: `1px solid ${msg.role === 'user' ? '#2E4437' : '#232624'}`,
                borderRadius: '8px',
                padding: '14px 18px',
                color: '#EDEDEB',
                fontSize: '13px',
                lineHeight: 1.6,
                overflowWrap: 'break-word'
              }}
            >
              {msg.role === 'user' ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              ) : (
                <div
                  className="copilot-markdown-content"
                  dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) }}
                />
              )}
            </div>
          </div>
        ))}

        {/* Live Streaming Message */}
        {streamingText && (
          <div style={{ display: 'flex', flexDirection: 'column', alignSelf: 'flex-start', maxWidth: '94%' }}>
            <div style={{ fontSize: '11px', color: '#3FB68B', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>TRACEX CO-PILOT</span>
              <span>· Streaming analysis…</span>
            </div>
            <div style={{
              background: '#141615',
              border: '1px solid #2E4437',
              borderRadius: '8px',
              padding: '14px 18px',
              color: '#EDEDEB',
              fontSize: '13px',
              lineHeight: 1.6
            }}>
              <div
                className="copilot-markdown-content"
                dangerouslySetInnerHTML={{ __html: marked.parse(streamingText) }}
              />
            </div>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && !streamingText && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#A1A4A0', fontSize: '12px' }}>
            <span className="spinner" style={{
              width: '14px',
              height: '14px',
              border: '2px solid rgba(63, 182, 139, 0.2)',
              borderTopColor: '#3FB68B',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite'
            }} />
            <span>Consulting case knowledge base & evidence records…</span>
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            padding: '10px 14px',
            color: '#F87171',
            fontSize: '12px'
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Input Console & Controls */}
      <div style={{
        padding: '14px 20px',
        borderTop: '1px solid #232624',
        background: '#141615'
      }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button
              onClick={stopGenerating}
              className="btn btn-secondary"
              style={{
                height: '26px',
                fontSize: '11px',
                padding: '0 10px',
                borderColor: '#EF4444',
                color: '#EF4444'
              }}
            >
              <Icon name="close" size={12} />
              <span>Stop generating</span>
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); ask(); }}
          style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask question about wallet paths, VASPs, or indicators…"
            disabled={loading}
            style={{
              flex: 1,
              height: '42px',
              background: '#0A0B0B',
              border: '1px solid #232624',
              borderRadius: '6px',
              padding: '0 14px',
              color: '#EDEDEB',
              fontSize: '13px',
              outline: 'none',
              fontFamily: 'inherit'
            }}
            onFocus={(e) => e.target.style.borderColor = '#3FB68B'}
            onBlur={(e) => e.target.style.borderColor = '#232624'}
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            style={{
              height: '42px',
              padding: '0 18px',
              background: loading || !input.trim() ? '#1D2521' : '#3FB68B',
              color: loading || !input.trim() ? '#6B6E6A' : '#0A0B0B',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background 0.15s ease'
            }}
          >
            <span>Analyze</span>
            <Icon name="arrow" size={14} />
          </button>
        </form>
      </div>

      {/* Markdown Styling */}
      <style>{`
        .copilot-markdown-content h3 {
          margin: 12px 0 6px 0;
          font-size: 14px;
          color: #3FB68B;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .copilot-markdown-content p {
          margin: 6px 0;
        }
        .copilot-markdown-content ul, .copilot-markdown-content ol {
          margin: 6px 0;
          padding-left: 20px;
        }
        .copilot-markdown-content li {
          margin: 4px 0;
        }
        .copilot-markdown-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
          font-size: 12px;
          background: #0A0B0B;
          border-radius: 4px;
          overflow: hidden;
        }
        .copilot-markdown-content th, .copilot-markdown-content td {
          border: 1px solid #232624;
          padding: 6px 10px;
          text-align: left;
        }
        .copilot-markdown-content th {
          background: #171918;
          color: #A1A4A0;
          font-weight: 600;
        }
        .copilot-markdown-content code {
          background: #1B1E1C;
          border: 1px solid #282C29;
          padding: 1px 4px;
          border-radius: 3px;
          font-family: 'Roboto Mono', monospace;
          font-size: 11px;
          color: #3FB68B;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
