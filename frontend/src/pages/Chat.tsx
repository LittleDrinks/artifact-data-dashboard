import ReactMarkdown from 'react-markdown';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Input,
  Button,
  Empty,
  message,
  Drawer,
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
} from '@ant-design/icons';
import {
  getChatSessions,
  getChatMessages,
  sendChatMessage,
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
  // Sessions
  const [sessions, setSessions] = useState<ChatSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);

  // Messages
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

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
        let toolCall: DisplayMessage['toolCall'] = null;
        if (m.tool_calls) {
          try {
            const tcData = JSON.parse(m.tool_calls);
            if (tcData.results && tcData.count) {
              toolCall = {
                tool: 'search_artifacts',
                query: '', // Query is not stored in tool_calls
                results: tcData.results as SearchResultItem[],
                count: tcData.count,
                elapsed: tcData.elapsed || 0,
                done: true,
              };
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
      setActiveSessionId(session.id);
      setHistoryVisible(false);
      loadSessionMessages(session.id);
    },
    [loadSessionMessages],
  );

  // ── New session ──
  const handleNewSession = useCallback(() => {
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
      await sendChatMessage(query, activeSessionId, (event: SSEEventData) => {
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
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '发送失败';
      message.error(msg);
      // Remove the empty assistant message
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setLoading(false);
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

  // ── Render tool call bar ──
  const renderToolCallBar = (msg: DisplayMessage) => {
    if (!msg.toolCall) return null;
    const tc = msg.toolCall;
    return (
      <div
        className="tool-call-bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          marginBottom: 12,
          background: '#f6f9fc',
          border: '1px solid #e5edf5',
          borderRadius: 4,
          fontSize: 12,
          cursor: 'pointer',
          transition: 'all 0.12s',
        }}
        onClick={() => setRagVisible(true)}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 3,
            background: '#533afd',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            flexShrink: 0,
          }}
        >
          <SearchOutlined style={{ fontSize: 10 }} />
        </div>
        <span style={{ fontWeight: 400, color: '#061b31' }}>知识检索</span>
        <span
          style={{
            color: '#94a3b8',
            fontSize: 11,
            maxWidth: 300,
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
        {msg.sources.map((s, i) => (
          <div
            key={i}
            style={{
              fontSize: 12,
              color: '#533afd',
              padding: '2px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: '#94a3b8',
                flexShrink: 0,
              }}
            />
            [{i + 1}] {s.name} — {s.source}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
      {/* ── Chat Area ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
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
                  等待 AI 思考...
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
              <span style={{ fontSize: 12, color: '#94a3b8' }}>等待工具调用...</span>
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
                {ragSources.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 12,
                      color: '#533afd',
                      padding: '2px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: '#94a3b8',
                        flexShrink: 0,
                      }}
                    />
                    [{i + 1}] {s.name} — {s.source}
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>等待引用结果...</span>
            )}
          </RagSection>
        </div>
      )}

      {/* ── History Drawer ── */}
      <Drawer
        title="历史记录"
        placement="left"
        onClose={() => setHistoryVisible(false)}
        open={historyVisible}
        width={300}
        styles={{
          body: { padding: 0 },
        }}
      >
        <div style={{ padding: '8px 0' }}>
          {sessions.length === 0 ? (
            <Empty
              description="暂无历史记录"
              style={{ marginTop: 40 }}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSelectSession(s)}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  color: s.id === activeSessionId ? '#533afd' : '#64748d',
                  cursor: 'pointer',
                  background:
                    s.id === activeSessionId ? 'rgba(83,58,253,0.05)' : 'transparent',
                  transition: 'all 0.12s',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  borderLeft:
                    s.id === activeSessionId
                      ? '3px solid #533afd'
                      : '3px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (s.id !== activeSessionId) {
                    (e.target as HTMLElement).style.background = '#f0f4f8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (s.id !== activeSessionId) {
                    (e.target as HTMLElement).style.background = 'transparent';
                  }
                }}
              >
                {s.title || '新对话'}
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {new Date(s.created_at).toLocaleString('zh-CN')}
                </div>
              </div>
            ))
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
