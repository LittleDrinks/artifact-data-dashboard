import ReactMarkdown from 'react-markdown';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Input,
  Button,
  Empty,
  message,
  Drawer,
  Popconfirm,
} from 'antd';
import {
  SendOutlined,
  PlusOutlined,
  HistoryOutlined,
  RightOutlined,
  SearchOutlined,
  RobotOutlined,
  LoadingOutlined,
  MenuFoldOutlined,
  CheckCircleFilled,
  DeleteOutlined,
} from '@ant-design/icons';
import {
  getChatSessions,
  getChatMessages,
  sendChatMessage,
  deleteChatSessions,
  type ChatSessionInfo,
  type ChatMessageInfo,
  type SSEEventData,
  type SearchResultItem,
  type SourceItem,
} from '../api/chat';

/* ── Types ── */

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking: string;
  thinkingDone: boolean;
  toolCall: {
    tool: string;
    query: string;
    results: SearchResultItem[];
    count: number;
    elapsed: number;
    done: boolean;
  } | null;
  sources: SourceItem[];
  streaming: boolean;
}

/* ── Helpers ── */

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/* ── Component ── */

export default function Chat() {
  const navigate = useNavigate();

  // Sessions
  const [sessions, setSessions] = useState<ChatSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Messages
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  // Inline tool call expansion
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());

  // RAG panel
  const [ragVisible, setRagVisible] = useState(true);
  const [ragThinking, setRagThinking] = useState('');
  const [ragToolResults, setRagToolResults] = useState<SearchResultItem[]>([]);
  const [ragToolQuery, setRagToolQuery] = useState('');
  const [ragToolElapsed, setRagToolElapsed] = useState(0);
  const [ragSources, setRagSources] = useState<SourceItem[]>([]);

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const isAtBottomRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight SSE request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ── Sync RAG panel with last assistant message (for historical / after streaming) ──
  useEffect(() => {
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant || lastAssistant.streaming) return;
    setRagThinking(lastAssistant.thinking);
    setRagToolResults(lastAssistant.toolCall?.results || []);
    setRagToolQuery(lastAssistant.toolCall?.query || '');
    setRagToolElapsed(lastAssistant.toolCall?.elapsed || 0);
    setRagSources(lastAssistant.sources);
  }, [messages]);

  // ── Load sessions ──
  const loadSessions = useCallback(async () => {
    try {
      const data = await getChatSessions(1, 50);
      setSessions(data.items);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ── Auto-scroll ──
  // Use ref (not state) for at-bottom tracking to avoid stale closure issues
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const isNewMessage = messages.length !== prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    // Always scroll when new messages arrive; during streaming only if at bottom
    if (isNewMessage || isAtBottomRef.current) {
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [messages]);

  // ── Load session messages ──
  const loadSessionMessages = useCallback(async (sessionId: number) => {
    try {
      const msgs: ChatMessageInfo[] = await getChatMessages(sessionId);
      const displayMsgs: DisplayMessage[] = msgs.map((m) => {
        // Parse tool_calls JSON if available
        // Backend stores: [{tool, args, result}, ...] array
        let toolCall: DisplayMessage['toolCall'] = null;
        if (m.tool_calls) {
          try {
            const tcData = JSON.parse(m.tool_calls);
            if (Array.isArray(tcData)) {
              // Find the first search_artifacts tool call with results
              for (const tc of tcData) {
                if (tc.result?.results) {
                  toolCall = {
                    tool: tc.tool || 'search_artifacts',
                    query: tc.args?.keyword || '',
                    results: tc.result.results as SearchResultItem[],
                    count: tc.result.count || tc.result.results.length || 0,
                    elapsed: 0,
                    done: true,
                  };
                  break;
                }
              }
            }
          } catch {
            // Invalid JSON, ignore
          }
        }
        return {
          id: generateId(),
          role: m.role as 'user' | 'assistant',
          content: m.content || '',
          thinking: '', // Thinking text is not stored in DB
          thinkingDone: true,
          toolCall,
          sources: toolCall?.results?.map((r) => ({ name: r.name, source: '文物数据库' })) || [],
          streaming: false,
        };
      });
      setMessages(displayMsgs);
    } catch {
      setMessages([]);
    }
  }, []);

  // ── Select session ──
  const handleSelectSession = useCallback(
    (session: ChatSessionInfo) => {
      // Abort any in-flight SSE before switching
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setLoading(false);

      setActiveSessionId(session.id);
      setSelectedIds(new Set());
      setHistoryVisible(false);

      // Clear state before loading new session
      setRagThinking('');
      setRagToolResults([]);
      setRagToolQuery('');
      setRagToolElapsed(0);
      setRagSources([]);

      loadSessionMessages(session.id);
    },
    [loadSessionMessages],
  );

  // ── Delete selected sessions ──
  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      const ids = Array.from(selectedIds);
      await deleteChatSessions(ids);
      message.success(`已删除 ${ids.length} 条会话`);
      if (ids.includes(activeSessionId!)) {
        setActiveSessionId(null);
        setMessages([]);
      }
      setSelectedIds(new Set());
      loadSessions();
    } catch {
      message.error('删除失败');
    }
  }, [selectedIds, activeSessionId, loadSessions]);

  // ── New session ──
  const handleNewSession = useCallback(() => {
    // Abort any in-flight SSE
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);

    setActiveSessionId(null);
    setMessages([]);
    setRagThinking('');
    setRagToolResults([]);
    setRagToolQuery('');
    setRagToolElapsed(0);
    setRagSources([]);
    inputRef.current?.focus();
  }, []);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const query = inputValue.trim();
    if (!query || loading) return;

    setInputValue('');
    setLoading(true);

    // Add user message
    const userMsg: DisplayMessage = {
      id: generateId(),
      role: 'user',
      content: query,
      thinking: '',
      thinkingDone: true,
      toolCall: null,
      sources: [],
      streaming: false,
    };

    // Add placeholder assistant message
    const assistantMsg: DisplayMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      thinking: '',
      thinkingDone: false,
      toolCall: null,
      sources: [],
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    const assistantId = assistantMsg.id;

    // Reset RAG panel
    setRagThinking('');
    setRagToolResults([]);
    setRagToolQuery('');
    setRagToolElapsed(0);
    setRagSources([]);

    try {
      // Create AbortController for this request
      const controller = new AbortController();
      abortControllerRef.current = controller;

      await sendChatMessage(query, activeSessionId, (event: SSEEventData) => {
        // If this request was aborted, ignore late events
        if (controller.signal.aborted) return;

        switch (event.type) {
          case 'thinking_start':
            // Nothing extra
            break;

          case 'thinking_delta':
            setRagThinking((prev) => prev + (event.content || ''));
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, thinking: m.thinking + (event.content || '') }
                  : m,
              ),
            );
            break;

          case 'thinking_end':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, thinkingDone: true } : m,
              ),
            );
            break;

          case 'tool_call_start':
            setRagToolQuery(event.query || query);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCall: {
                        tool: event.tool || 'search_artifacts',
                        query: event.query || query,
                        results: [],
                        count: 0,
                        elapsed: 0,
                        done: false,
                      },
                    }
                  : m,
              ),
            );
            break;

          case 'tool_call_result':
            setRagToolResults(event.results || []);
            setRagToolElapsed(event.elapsed || 0);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId && m.toolCall
                  ? {
                      ...m,
                      toolCall: {
                        ...m.toolCall,
                        results: event.results || [],
                        count: event.count || 0,
                        elapsed: event.elapsed || 0,
                        done: true,
                      },
                    }
                  : m,
              ),
            );
            break;

          case 'answer_delta':
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + (event.content || '') }
                  : m,
              ),
            );
            break;

          case 'answer_end':
            break;

          case 'done':
            setRagSources(event.sources || []);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, streaming: false, sources: event.sources || [] }
                  : m,
              ),
            );
            // Reload sessions to pick up any new session
            loadSessions();
            setLoading(false);
            break;

          default:
            break;
        }
      }, controller.signal);
    } catch (err: unknown) {
      // Don't show error if request was aborted (user action)
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Remove the empty assistant message on abort
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setLoading(false);
        return;
      }
      const msg = err instanceof Error ? err.message : '发送失败';
      message.error(msg);
      // Remove the empty assistant message
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setLoading(false);
    } finally {
      // Clear ref if this is still the active controller
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [inputValue, loading, activeSessionId, loadSessions]);

  // ── Keyboard shortcut ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render thinking block ──
  const renderThinkingBlock = (msg: DisplayMessage) => {
    if (!msg.thinking) return null;
    return (
      <ThinkingBlock content={msg.thinking} done={msg.thinkingDone} />
    );
  };

  // ── Render tool call bar (expandable inline) ──
  const renderToolCallBar = (msg: DisplayMessage) => {
    if (!msg.toolCall) return null;
    const tc = msg.toolCall;
    const isExpanded = expandedToolCalls.has(msg.id);

    return (
      <div
        style={{
          marginBottom: 12,
          border: '1px solid #e5edf5',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {/* Header bar */}
        <div
          className="tool-call-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: '#f6f9fc',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'all 0.12s',
            userSelect: 'none',
          }}
          onClick={() => {
            setExpandedToolCalls((prev) => {
              const next = new Set(prev);
              if (next.has(msg.id)) next.delete(msg.id);
              else next.add(msg.id);
              return next;
            });
          }}
        >
          <RightOutlined
            style={{
              fontSize: 10,
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
          />
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              background: '#533afd',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            <SearchOutlined style={{ fontSize: 9 }} />
          </div>
          <span style={{ fontWeight: 400, color: '#061b31' }}>知识检索</span>
          <span
            style={{
              color: '#94a3b8',
              fontSize: 11,
              maxWidth: 260,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            "{tc.query}"
          </span>
          <div style={{ marginLeft: 'auto', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            {tc.done ? (
              <>
                <CheckCircleFilled style={{ color: '#15be53', fontSize: 8 }} />
                <span style={{ color: '#108c3d' }}>
                  {tc.count} 条结果 · {tc.elapsed}s
                </span>
              </>
            ) : (
              <>
                <LoadingOutlined style={{ color: '#533afd' }} />
                <span style={{ color: '#533afd' }}>检索中</span>
              </>
            )}
          </div>
        </div>

        {/* Expandable results */}
        {isExpanded && tc.done && tc.results.length > 0 && (
          <div
            style={{
              borderTop: '1px solid #e5edf5',
              padding: '8px 12px',
              background: '#fff',
              maxHeight: 240,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {tc.results.map((r) => (
              <div
                key={r.id}
                style={{
                  padding: '6px 8px',
                  background: '#f6f9fc',
                  border: '1px solid #e5edf5',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'border-color 0.12s',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/artifacts/${r.id}`);
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#b9b9f9';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#e5edf5';
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 400, color: '#061b31', marginBottom: 2 }}>
                  {r.name}
                </div>
                <div style={{ fontSize: 11, color: '#64748d', lineHeight: 1.5 }}>
                  {r.snippet}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  {[r.category, r.era, r.location].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Render sources ──
  const renderSources = (msg: DisplayMessage) => {
    if (!msg.sources || msg.sources.length === 0) return null;
    return (
      <div
        style={{
          marginTop: 12,
          padding: '10px 12px',
          background: '#f6f9fc',
          border: '1px solid #e5edf5',
          borderRadius: 4,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: '#94a3b8',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          参考来源
        </div>
        {msg.sources.map((s, i) => {
          const clickable = !!s.artifact_id;
          return (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: clickable ? '#533afd' : '#64748d',
                padding: '2px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: clickable ? 'pointer' : 'default',
                textDecoration: clickable ? 'none' : 'none',
              }}
              onClick={() => {
                if (s.artifact_id) {
                  navigate(`/artifacts/${s.artifact_id}`);
                }
              }}
            >
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: clickable ? '#533afd' : '#94a3b8',
                  flexShrink: 0,
                }}
              />
              [{i + 1}] {s.name} — {s.source}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flex: '1 1 0%', maxHeight: 'calc(100vh - 56px - 64px)', minHeight: 0, overflow: 'hidden' }}>
      {/* ── Chat Area ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            height: 48,
            borderBottom: '1px solid #e5edf5',
            background: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="text"
              icon={<PlusOutlined />}
              size="small"
              onClick={handleNewSession}
            >
              新对话
            </Button>
            <Button
              type="text"
              icon={<HistoryOutlined />}
              size="small"
              onClick={() => setHistoryVisible(true)}
            >
              历史记录
            </Button>
          </div>
          <Button
            type="text"
            icon={<MenuFoldOutlined />}
            size="small"
            onClick={() => setRagVisible(!ragVisible)}
          >
            {ragVisible ? '隐藏面板' : '知识面板'}
          </Button>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
              }}
            >
              <RobotOutlined style={{ fontSize: 48, color: '#94a3b8' }} />
              <div style={{ fontSize: 16, color: '#061b31', fontWeight: 400 }}>
                AI 智能问答
              </div>
              <div style={{ fontSize: 13, color: '#64748d', textAlign: 'center' }}>
                输入关于文物的问题，AI 将从数据库中检索相关信息并回答。
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                {['青铜器有哪些种类？', '唐代的文物有哪些？', '介绍一下后母戊鼎'].map(
                  (q) => (
                    <div
                      key={q}
                      onClick={() => {
                        setInputValue(q);
                        inputRef.current?.focus();
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 4,
                        fontSize: 12,
                        border: '1px solid #e5edf5',
                        color: '#64748d',
                        cursor: 'pointer',
                        background: '#fff',
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.borderColor = '#b9b9f9';
                        (e.target as HTMLElement).style.color = '#533afd';
                        (e.target as HTMLElement).style.background =
                          'rgba(83,58,253,0.05)';
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.borderColor = '#e5edf5';
                        (e.target as HTMLElement).style.color = '#64748d';
                        (e.target as HTMLElement).style.background = '#fff';
                      }}
                    >
                      {q}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: 12,
                maxWidth: 720,
                ...(msg.role === 'user'
                  ? { flexDirection: 'row-reverse', marginLeft: 'auto' }
                  : {}),
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 400,
                  ...(msg.role === 'assistant'
                    ? { background: '#533afd', color: '#fff' }
                    : { background: '#f0f4f8', color: '#64748d' }),
                }}
              >
                {msg.role === 'assistant' ? 'AI' : '你'}
              </div>

              {/* Bubble */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  fontSize: 14,
                  lineHeight: 1.7,
                  ...(msg.role === 'assistant'
                    ? {
                        background: '#fff',
                        border: '1px solid #e5edf5',
                        color: '#061b31',
                        borderTopLeftRadius: 4,
                        boxShadow: 'rgba(23,23,23,0.06) 0px 3px 6px',
                      }
                    : {
                        background: '#533afd',
                        color: '#fff',
                        borderTopRightRadius: 4,
                      }),
                }}
              >
                {msg.role === 'assistant' && (
                  <>
                    {renderThinkingBlock(msg)}
                    {renderToolCallBar(msg)}
                  </>
                )}

                {/* Content */}
                <div>
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      components={{
                        // Style for markdown elements
                        p: ({ children }) => <p style={{ margin: 0, lineHeight: 1.7 }}>{children}</p>,
                        strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                        em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                        ul: ({ children }) => <ul style={{ margin: '8px 0', paddingLeft: 20 }}>{children}</ul>,
                        ol: ({ children }) => <ol style={{ margin: '8px 0', paddingLeft: 20 }}>{children}</ol>,
                        li: ({ children }) => <li style={{ margin: '4px 0' }}>{children}</li>,
                        code: ({ children }) => (
                          <code style={{ background: '#f0f4f8', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>
                            {children}
                          </code>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  )}
                  {msg.streaming && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 2,
                        height: 14,
                        background: '#533afd',
                        marginLeft: 2,
                        verticalAlign: 'text-bottom',
                        animation: 'blink 1s infinite',
                      }}
                    />
                  )}
                </div>

                {msg.role === 'assistant' && renderSources(msg)}
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #e5edf5',
            background: '#f6f9fc',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 12,
              background: '#fff',
              border: '1px solid #e5edf5',
              borderRadius: 8,
              padding: '12px 16px',
              maxWidth: 720,
              margin: '0 auto',
            }}
          >
            <Input.TextArea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入关于文物的问题..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                resize: 'none',
                boxShadow: 'none',
                fontSize: 15,
                padding: 0,
              }}
              disabled={loading}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={loading}
              style={{
                background: '#533afd',
                borderColor: '#533afd',
                flexShrink: 0,
              }}
            >
              发送
            </Button>
          </div>
        </div>
      </div>

      {/* ── RAG Knowledge Panel ── */}
      {ragVisible && (
        <div
          style={{
            width: 340,
            borderLeft: '1px solid #e5edf5',
            background: '#f6f9fc',
            padding: 16,
            overflowY: 'auto',
            minHeight: 0,
            transition: 'border-color 0.2s',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 16,
            }}
          >
            知识检索详情
          </div>

          {/* Thinking Section */}
          <RagSection
            title="Thinking"
            color="#ea2261"
            dotColor="#ea2261"
            defaultExpanded
          >
            <div
              style={{
                borderLeft: '3px solid #ea2261',
                padding: '10px 12px',
                background: '#f6f9fc',
                fontSize: 12,
                color: '#64748d',
                lineHeight: 1.7,
                borderRadius: '0 4px 4px 0',
              }}
            >
              {ragThinking || (
                <span style={{ color: '#94a3b8' }}>
                  {loading ? 'AI 正在思考...' : '暂无思考内容'}
                </span>
              )}
            </div>
          </RagSection>

          {/* Tool Calling Section */}
          <RagSection
            title="Tool Calling"
            color="#2874ad"
            dotColor="#2874ad"
            defaultExpanded
          >
            {ragToolQuery ? (
              <>
                <div style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      background: '#fff',
                      border: '1px solid #e5edf5',
                      borderRadius: 4,
                      fontSize: 12,
                      color: '#061b31',
                    }}
                  >
                    <SearchOutlined />
                    <span>检索: "{ragToolQuery}"</span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#94a3b8',
                      marginTop: 4,
                      padding: '0 2px',
                    }}
                  >
                    找到 <strong style={{ color: '#061b31', fontWeight: 400 }}>{ragToolResults.length}</strong>{' '}
                    条相关结果 · 耗时 {ragToolElapsed}s
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    maxHeight: 340,
                    overflowY: 'auto',
                  }}
                >
                  {ragToolResults.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        padding: '8px 10px',
                        background: '#f6f9fc',
                        border: '1px solid #e5edf5',
                        borderRadius: 4,
                        transition: 'border-color 0.12s',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 400,
                          color: '#061b31',
                          marginBottom: 2,
                        }}
                      >
                        {r.name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#64748d',
                          lineHeight: 1.5,
                        }}
                      >
                        {r.snippet}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: '#94a3b8',
                          marginTop: 4,
                        }}
                      >
                        {[r.category, r.era, r.location].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{loading ? '等待工具调用...' : '暂无工具调用'}</span>
            )}
          </RagSection>

          {/* Citations Section */}
          <RagSection
            title="引用结果"
            color="#108c3d"
            dotColor="#15be53"
            defaultExpanded
          >
            {ragSources.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ragSources.map((s, i) => {
                  const clickable = !!s.artifact_id;
                  return (
                    <div
                      key={i}
                      style={{
                        fontSize: 12,
                        color: clickable ? '#533afd' : '#64748d',
                        padding: '2px 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: clickable ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (s.artifact_id) {
                          navigate(`/artifacts/${s.artifact_id}`);
                        }
                      }}
                    >
                      <div
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: clickable ? '#533afd' : '#94a3b8',
                          flexShrink: 0,
                        }}
                      />
                      [{i + 1}] {s.name} — {s.source}
                    </div>
                  );
                })}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>{loading ? '等待引用结果...' : '暂无引用'}</span>
            )}
          </RagSection>
        </div>
      )}

      {/* ── History Drawer ── */}
      <Drawer
        title="历史记录"
        placement="left"
        onClose={() => { setHistoryVisible(false); setSelectedIds(new Set()); }}
        open={historyVisible}
        width={300}
        styles={{
          body: { padding: 0, display: 'flex', flexDirection: 'column' },
        }}
      >
        {/* Batch actions bar */}
        {sessions.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              borderBottom: '1px solid #e5edf5',
              fontSize: 12,
            }}
          >
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#64748d' }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={selectedIds.size === sessions.length && sessions.length > 0}
                onChange={() => {
                  if (selectedIds.size === sessions.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(sessions.map((s) => s.id)));
                  }
                }}
                style={{ accentColor: '#533afd' }}
              />
              全选
            </label>
            {selectedIds.size > 0 && (
              <Popconfirm
                title={`确定删除 ${selectedIds.size} 条会话？`}
                onConfirm={handleDeleteSelected}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                >
                  删除 ({selectedIds.size})
                </Button>
              </Popconfirm>
            )}
          </div>
        )}

        <div style={{ padding: '8px 0', flex: 1, overflowY: 'auto' }}>
          {sessions.length === 0 ? (
            <Empty
              description="暂无历史记录"
              style={{ marginTop: 40 }}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            sessions.map((s) => {
              const checked = selectedIds.has(s.id);
              return (
                <div
                  key={s.id}
                  onClick={() => {
                    if (selectedIds.size === 0) {
                      handleSelectSession(s);
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    color: s.id === activeSessionId ? '#533afd' : '#64748d',
                    cursor: selectedIds.size > 0 ? 'default' : 'pointer',
                    background: checked
                      ? 'rgba(83,58,253,0.05)'
                      : s.id === activeSessionId
                        ? 'rgba(83,58,253,0.05)'
                        : 'transparent',
                    borderLeft:
                      s.id === activeSessionId
                        ? '3px solid #533afd'
                        : '3px solid transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    if (!checked && s.id !== activeSessionId) {
                      (e.currentTarget as HTMLElement).style.background = '#f0f4f8';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!checked && s.id !== activeSessionId) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ accentColor: '#533afd', marginTop: 3, flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.title || '新对话'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                      {new Date(s.created_at).toLocaleString('zh-CN')}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Drawer>

      {/* Blink animation keyframes */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ── Thinking Block Sub-Component ── */

function ThinkingBlock({ content, done }: { content: string; done: boolean }) {
  const [expanded, setExpanded] = useState(false);

  // Auto-expand while streaming (thinking in progress)
  useEffect(() => {
    if (content && !done) {
      setExpanded(true);
    }
  }, [content, done]);

  if (!content) return null;

  return (
    <div
      style={{
        marginBottom: 12,
        border: '1px solid #e5edf5',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          cursor: 'pointer',
          fontSize: 12,
          color: '#64748d',
          background: '#f6f9fc',
          transition: 'background 0.12s',
          userSelect: 'none',
        }}
      >
        <RightOutlined
          style={{
            fontSize: 10,
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        />
        <span style={{ fontWeight: 400, color: '#273951' }}>Thinking</span>
        {!done && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#533afd' }}>
            <LoadingOutlined style={{ marginRight: 4 }} />
            思考中...
          </span>
        )}
        {done && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
            完成
          </span>
        )}
      </div>
      {expanded && (
        <div
          style={{
            padding: '10px 12px',
            fontSize: 12,
            color: '#64748d',
            lineHeight: 1.7,
            borderTop: '1px solid #e5edf5',
            background: '#fff',
            whiteSpace: 'pre-wrap',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

/* ── RAG Section Sub-Component ── */

function RagSection({
  title,
  color,
  dotColor,
  defaultExpanded = false,
  children,
}: {
  title: string;
  color: string;
  dotColor: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      style={{
        border: '1px solid #e5edf5',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          fontSize: 12,
          fontWeight: 400,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          cursor: 'pointer',
          background: '#fff',
          transition: 'background 0.12s',
          userSelect: 'none',
          color,
        }}
      >
        <RightOutlined
          style={{
            fontSize: 10,
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            color: '#94a3b8',
          }}
        />
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor,
          }}
        />
        {title}
      </div>
      {expanded && (
        <div
          style={{
            padding: '10px 12px',
            borderTop: '1px solid #e5edf5',
            background: '#fff',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
