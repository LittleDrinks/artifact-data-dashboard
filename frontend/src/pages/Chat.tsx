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
  SearchOutlined,
  RobotOutlined,
  LoadingOutlined,
  DeleteOutlined,
  CloseOutlined,
  DownOutlined,
  RightOutlined,
  BulbOutlined,
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
} from '../api/chat';

/* ── Types ── */

interface ToolCallEntry {
  tool: string;
  query: string;
  results: SearchResultItem[];
  count: number;
  elapsed: number;
  done: boolean;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  // thinking rounds — each ReAct round produces a separate thinking entry
  thinkingRounds: string[];
  thinkingDone: boolean;
  // Support multiple tool calls from ReAct loop
  toolCalls: ToolCallEntry[];
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

  // RAG side panel
  const [ragVisible, setRagVisible] = useState(false);
  const [ragToolResults, setRagToolResults] = useState<SearchResultItem[]>([]);
  const [ragToolQueries, setRagToolQueries] = useState<string[]>([]);
  const [ragToolElapsed, setRagToolElapsed] = useState(0);
  const [ragToolLoading, setRagToolLoading] = useState(false);
  // Selected tool call index for RAG panel (which retrieval to show)
  const [selectedToolCallIndex, setSelectedToolCallIndex] = useState<number>(-1);
  // Thinking section expansion state (per message)
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());

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
    const toolCalls = lastAssistant.toolCalls;
    if (toolCalls.length > 0) {
      // Show results from selected tool call (default to latest)
      const idx = selectedToolCallIndex >= 0 && selectedToolCallIndex < toolCalls.length
        ? selectedToolCallIndex
        : toolCalls.length - 1;
      const selectedTc = toolCalls[idx];
      setRagToolResults(selectedTc.results);
      setRagToolQueries([selectedTc.query]);
      setRagToolElapsed(selectedTc.elapsed);
      setRagToolLoading(false);
      // Update selected index if it was out of bounds
      if (selectedToolCallIndex < 0 || selectedToolCallIndex >= toolCalls.length) {
        setSelectedToolCallIndex(toolCalls.length - 1);
      }
    } else {
      setRagToolResults([]);
      setRagToolQueries([]);
      setRagToolElapsed(0);
      setRagToolLoading(false);
      setSelectedToolCallIndex(-1);
    }
  }, [messages, selectedToolCallIndex]);

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
        const toolCalls: ToolCallEntry[] = [];
        if (m.tool_calls) {
          try {
            const tcData = JSON.parse(m.tool_calls);
            if (Array.isArray(tcData)) {
              for (const tc of tcData) {
                if (tc.result?.results) {
                  toolCalls.push({
                    tool: tc.tool || 'search_artifacts',
                    query: tc.args?.keyword || '',
                    results: tc.result.results as SearchResultItem[],
                    count: tc.result.count || tc.result.results.length || 0,
                    elapsed: 0,
                    done: true,
                  });
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
          thinkingRounds: [],
          thinkingDone: true,
          toolCalls,
          streaming: false,
        };
      });
      setMessages(displayMsgs);

      // Auto-show panel if last assistant message has tool calls
      const lastAssistant = [...displayMsgs].reverse().find(m => m.role === 'assistant');
      if (lastAssistant && lastAssistant.toolCalls.length > 0) {
        // Show the latest retrieval by default
        const latestIdx = lastAssistant.toolCalls.length - 1;
        setSelectedToolCallIndex(latestIdx);
        setRagToolResults(lastAssistant.toolCalls[latestIdx].results);
        setRagToolQueries([lastAssistant.toolCalls[latestIdx].query]);
        setRagToolElapsed(lastAssistant.toolCalls[latestIdx].elapsed);
        setRagVisible(true);
      } else {
        setRagToolResults([]);
        setRagToolQueries([]);
        setRagToolElapsed(0);
        setSelectedToolCallIndex(-1);
        setRagVisible(false);
      }
    } catch {
      setMessages([]);
    }
  }, []);

  // ── Select session ──
  const handleSelectSession = useCallback(
    (session: ChatSessionInfo) => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setLoading(false);

      setActiveSessionId(session.id);
      setSelectedIds(new Set());
      setHistoryVisible(false);

      setRagToolResults([]);
      setRagToolQueries([]);
      setRagToolElapsed(0);
      setRagToolLoading(false);
      setSelectedToolCallIndex(-1);

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
        setRagVisible(false);
      }
      setSelectedIds(new Set());
      loadSessions();
    } catch {
      message.error('删除失败');
    }
  }, [selectedIds, activeSessionId, loadSessions]);

  // ── New session ──
  const handleNewSession = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);

    setActiveSessionId(null);
    setMessages([]);
    setRagToolResults([]);
    setRagToolQueries([]);
    setRagToolElapsed(0);
    setRagToolLoading(false);
    setSelectedToolCallIndex(-1);
    setRagVisible(false);
    inputRef.current?.focus();
  }, []);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const query = inputValue.trim();
    if (!query || loading) return;

    setInputValue('');
    setLoading(true);

    const userMsg: DisplayMessage = {
      id: generateId(),
      role: 'user',
      content: query,
      thinkingRounds: [],
      thinkingDone: true,
      toolCalls: [],
      streaming: false,
    };

    const assistantMsg: DisplayMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      thinkingRounds: [],
      thinkingDone: false,
      toolCalls: [],
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    const assistantId = assistantMsg.id;

    // Reset RAG state
    setRagToolResults([]);
    setRagToolQueries([]);
    setRagToolElapsed(0);
    setRagToolLoading(false);
    setSelectedToolCallIndex(-1);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await sendChatMessage(query, activeSessionId, (event: SSEEventData) => {
        if (controller.signal.aborted) return;

        switch (event.type) {
          case 'thinking_start':
            // Start a new thinking round — push an empty string as new round
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, thinkingDone: false, thinkingRounds: [...m.thinkingRounds, ''] }
                  : m,
              ),
            );
            break;

          case 'thinking_delta':
            // Append to the LATEST thinking round
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const rounds = [...m.thinkingRounds];
                const lastIdx = rounds.length - 1;
                if (lastIdx >= 0) {
                  rounds[lastIdx] = rounds[lastIdx] + (event.content || '');
                }
                return { ...m, thinkingRounds: rounds };
              }),
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
            // Auto-open RAG panel when tool call starts
            setRagVisible(true);
            setRagToolLoading(true);
            // ADD a new tool call entry (don't replace previous ones)
            let newToolCallIdx = 0;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === assistantId) {
                  newToolCallIdx = m.toolCalls.length; // Index of new tool call
                  return {
                    ...m,
                    toolCalls: [
                      ...m.toolCalls,
                      {
                        tool: event.tool || 'search_artifacts',
                        query: event.query || query,
                        results: [],
                        count: 0,
                        elapsed: 0,
                        done: false,
                      },
                    ],
                  };
                }
                return m;
              }),
            );
            // Update selected index to the new tool call (will be set after render)
            setTimeout(() => setSelectedToolCallIndex(newToolCallIdx), 0);
            break;

          case 'tool_call_result':
            // Update the LAST tool call entry (the most recent one)
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId || m.toolCalls.length === 0) return m;
                const lastIdx = m.toolCalls.length - 1;
                const updatedToolCalls = [...m.toolCalls];
                updatedToolCalls[lastIdx] = {
                  ...updatedToolCalls[lastIdx],
                  results: event.results || [],
                  count: event.count || 0,
                  elapsed: event.elapsed || 0,
                  done: true,
                };
                return { ...m, toolCalls: updatedToolCalls };
              }),
            );
            // Update RAG panel to show this retrieval's results
            setRagToolResults(event.results || []);
            setRagToolQueries([event.query || query]);
            setRagToolElapsed(event.elapsed || 0);
            setRagToolLoading(false);
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
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, streaming: false }
                  : m,
              ),
            );
            setRagToolLoading(false);
            loadSessions();
            setLoading(false);
            break;

          default:
            break;
        }
      }, controller.signal);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setLoading(false);
        return;
      }
      const msg = err instanceof Error ? err.message : '发送失败';
      message.error(msg);
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setLoading(false);
    } finally {
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

  // ── Render thinking section (collapsible, with multi-round support) ──
  const renderThinkingSection = (msg: DisplayMessage) => {
    const totalLen = msg.thinkingRounds.reduce((s, r) => s + r.length, 0);
    if (!totalLen && msg.thinkingDone) return null;
    const isExpanded = expandedThinking.has(msg.id);
    const toggleExpand = () => {
      setExpandedThinking((prev) => {
        const next = new Set(prev);
        if (next.has(msg.id)) next.delete(msg.id);
        else next.add(msg.id);
        return next;
      });
    };
    const multiRound = msg.thinkingRounds.filter(r => r.length > 0).length > 1;

    return (
      <div
        style={{
          marginBottom: 10,
          borderRadius: 6,
          background: '#f6f9fc',
          border: '1px solid #e5edf5',
        }}
      >
        <div
          onClick={toggleExpand}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: 12,
            color: '#64748d',
            userSelect: 'none',
          }}
        >
          <BulbOutlined style={{ fontSize: 12, color: '#533afd' }} />
          <span style={{ fontWeight: 500 }}>思考过程</span>
          {!msg.thinkingDone && (
            <LoadingOutlined style={{ fontSize: 10, color: '#533afd', marginLeft: 4 }} />
          )}
          {msg.thinkingDone && totalLen > 0 && (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              ({totalLen} 字)
            </span>
          )}
          {isExpanded ? (
            <DownOutlined style={{ fontSize: 10, marginLeft: 'auto' }} />
          ) : (
            <RightOutlined style={{ fontSize: 10, marginLeft: 'auto' }} />
          )}
        </div>
        {isExpanded && totalLen > 0 && (
          <div
            style={{
              padding: '10px 12px',
              fontSize: 12,
              lineHeight: 1.7,
              color: '#64748d',
              borderTop: '1px solid #e5edf5',
            }}
          >
            {msg.thinkingRounds.map((round, idx) =>
              round.length > 0 ? (
                <div key={idx}>
                  {multiRound && (
                    <div
                      style={{
                        fontSize: 10,
                        color: '#94a3b8',
                        fontWeight: 600,
                        marginBottom: 4,
                        marginTop: idx > 0 ? 10 : 0,
                      }}
                    >
                      第 {idx + 1} 轮思考
                    </div>
                  )}
                  <div style={{ whiteSpace: 'pre-wrap' }}>{round}</div>
                  {multiRound && idx < msg.thinkingRounds.length - 1 && (
                    <div
                      style={{
                        borderBottom: '1px dashed #dfe6ee',
                        margin: '8px 0',
                      }}
                    />
                  )}
                </div>
              ) : null,
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Render per-tool-call bubbles ──
  const renderToolCallBubbles = (msg: DisplayMessage) => {
    if (msg.toolCalls.length === 0) return null;

    return (
      <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {msg.toolCalls.map((tc, idx) => {
          const isSelected = selectedToolCallIndex === idx;
          const handleClick = () => {
            setSelectedToolCallIndex(idx);
            setRagToolResults(tc.results);
            setRagToolQueries([tc.query]);
            setRagToolElapsed(tc.elapsed);
            setRagVisible(true);
          };

          return (
            <div
              key={idx}
              onClick={handleClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: isSelected ? 'rgba(83,58,253,0.08)' : '#f6f9fc',
                border: isSelected ? '1px solid #b9b9f9' : '1px solid #e5edf5',
                borderRadius: 8,
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.borderColor = '#b9b9f9';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(83,58,253,0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLElement).style.borderColor = '#e5edf5';
                  (e.currentTarget as HTMLElement).style.background = '#f6f9fc';
                }
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: '#533afd',
                  background: 'rgba(83,58,253,0.1)',
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </span>
              <SearchOutlined style={{ fontSize: 12, color: '#533afd' }} />
              <span
                style={{
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: '#061b31',
                }}
              >
                "{tc.query}"
              </span>
              {!tc.done ? (
                <LoadingOutlined style={{ fontSize: 10, color: '#533afd', marginLeft: 'auto' }} />
              ) : tc.count > 0 ? (
                <span style={{ marginLeft: 'auto', color: '#15be53', fontWeight: 500 }}>
                  {tc.count} 条
                </span>
              ) : (
                <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>无结果</span>
              )}
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
          {(ragToolResults.length > 0 || ragToolLoading) && (
            <Button
              type="text"
              size="small"
              onClick={() => setRagVisible(!ragVisible)}
              style={{ color: ragVisible ? '#533afd' : '#64748d', fontSize: 12 }}
            >
              {ragVisible ? '收起检索结果' : `检索结果 (${ragToolResults.length})`}
            </Button>
          )}
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
                {msg.role === 'assistant' && renderThinkingSection(msg)}
                {msg.role === 'assistant' && renderToolCallBubbles(msg)}

                {/* Content */}
                <div>
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      components={{
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

      {/* ── RAG Side Panel (auto-shows on tool calls) ── */}
      {ragVisible && (
        <div
          style={{
            width: 340,
            borderLeft: '1px solid #e5edf5',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Panel header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid #e5edf5',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  background: '#533afd',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <SearchOutlined style={{ fontSize: 11 }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#061b31' }}>
                检索结果
              </span>
              {ragToolResults.length > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    background: 'rgba(83,58,253,0.1)',
                    color: '#533afd',
                    padding: '1px 8px',
                    borderRadius: 10,
                  }}
                >
                  {ragToolResults.length}
                </span>
              )}
            </div>
            <Button
              type="text"
              icon={<CloseOutlined />}
              size="small"
              onClick={() => setRagVisible(false)}
              style={{ color: '#94a3b8' }}
            />
          </div>

          {/* Retrieval tabs (when multiple tool calls exist) */}
          {/* Get the last assistant message's tool calls */}
          {(() => {
            const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
            const allToolCalls = lastAssistant?.toolCalls || [];
            if (allToolCalls.length > 1) {
              return (
                <div
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #f0f4f8',
                    fontSize: 12,
                    flexShrink: 0,
                    display: 'flex',
                    gap: 6,
                  }}
                >
                  {allToolCalls.map((tc, idx) => {
                    const isSelected = selectedToolCallIndex === idx;
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedToolCallIndex(idx);
                          setRagToolResults(tc.results);
                          setRagToolQueries([tc.query]);
                          setRagToolElapsed(tc.elapsed);
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          background: isSelected ? 'rgba(83,58,253,0.1)' : '#fff',
                          border: isSelected ? '1px solid #b9b9f9' : '1px solid #e5edf5',
                          color: isSelected ? '#533afd' : '#64748d',
                          maxWidth: 100,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        第 {idx + 1} 轮
                      </div>
                    );
                  })}
                </div>
              );
            }
            return null;
          })()}

          {/* Current retrieval info */}
          {ragToolQueries.length > 0 && (
            <div
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid #f0f4f8',
                fontSize: 12,
                color: '#64748d',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SearchOutlined style={{ fontSize: 11, color: '#94a3b8' }} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>检索关键词</span>
                {!ragToolLoading && ragToolElapsed > 0 && (
                  <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 11 }}>
                    {ragToolElapsed.toFixed(1)}s
                  </span>
                )}
                {ragToolLoading && (
                  <span style={{ marginLeft: 'auto', color: '#533afd', fontSize: 11 }}>
                    <LoadingOutlined style={{ marginRight: 4 }} />
                    检索中
                  </span>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginTop: 4,
                  paddingLeft: 20,
                }}
              >
                <span style={{ fontSize: 12, color: '#061b31', fontWeight: 500 }}>
                  "{ragToolQueries[0]}"
                </span>
              </div>
            </div>
          )}

          {/* Results list */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '12px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {ragToolLoading && ragToolResults.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 0',
                  gap: 12,
                }}
              >
                <LoadingOutlined style={{ fontSize: 24, color: '#533afd' }} />
                <span style={{ fontSize: 13, color: '#64748d' }}>正在检索文物数据...</span>
              </div>
            ) : ragToolResults.length > 0 ? (
              ragToolResults.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    padding: '10px 12px',
                    background: '#f6f9fc',
                    border: '1px solid #e5edf5',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => navigate(`/artifacts/${r.id}`)}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = '#b9b9f9';
                    el.style.background = 'rgba(83,58,253,0.04)';
                    el.style.transform = 'translateY(-1px)';
                    el.style.boxShadow = '0 2px 8px rgba(83,58,253,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = '#e5edf5';
                    el.style.background = '#f6f9fc';
                    el.style.transform = 'translateY(0)';
                    el.style.boxShadow = 'none';
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 500,
                        color: '#533afd',
                        background: 'rgba(83,58,253,0.1)',
                        width: 18,
                        height: 18,
                        borderRadius: 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#061b31' }}>
                      {r.name}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#64748d',
                      lineHeight: 1.6,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {r.snippet}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: '#94a3b8',
                      marginTop: 6,
                      display: 'flex',
                      gap: 4,
                      flexWrap: 'wrap',
                    }}
                  >
                    {[r.category, r.era, r.location]
                      .filter(Boolean)
                      .map((tag) => (
                        <span
                          key={tag}
                          style={{
                            padding: '1px 6px',
                            background: '#fff',
                            border: '1px solid #e5edf5',
                            borderRadius: 3,
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                  </div>
                </div>
              ))
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px 0',
                  gap: 8,
                }}
              >
                <SearchOutlined style={{ fontSize: 24, color: '#e5edf5' }} />
                <span style={{ fontSize: 13, color: '#94a3b8' }}>暂无检索结果</span>
                <span style={{ fontSize: 11, color: '#c5cdd8', textAlign: 'center', lineHeight: 1.5 }}>
                  发送消息后，AI 检索的文物将显示在这里
                </span>
              </div>
            )}
          </div>
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
