import ReactMarkdown from 'react-markdown';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  ReloadOutlined,
  LinkOutlined,
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
  type ArtifactDetailResult,
  type GraphEntity,
  type GraphRelation,
} from '../api/chat';

/* ── Types ── */

interface ToolCallEntry {
  tool: string;
  query: string;
  // For search_artifacts
  results: SearchResultItem[];
  // For get_artifact_detail
  artifactDetail?: ArtifactDetailResult;
  // For query_knowledge_graph
  entities?: GraphEntity[];
  relations?: GraphRelation[];
  count: number;
  elapsed: number;
  done: boolean;
  roundIndex: number; // Which thinking round this tool call belongs to
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
  // Error state: if true, show retry button
  error: boolean;
  // The original user query for retry
  retryQuery?: string;
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
  const [ragToolLoading, setRagToolLoading] = useState(false);
  // Which tool call index the panel is showing (-1 = auto = last one)
  const [panelToolCallIdx, setPanelToolCallIdx] = useState<number>(-1);
  // Thinking section expansion state (per round, format: "msgId:roundIdx")
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());

  // Refs
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const isAtBottomRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipAutoRestoreRef = useRef(false);

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
        let thinkingRounds: string[] = [];
        if (m.tool_calls) {
          try {
            const tcData = JSON.parse(m.tool_calls);
            if (Array.isArray(tcData)) {
              for (const tc of tcData) {
                // Check for thinking rounds entry (persisted from backend)
                if (tc.type === "thinking" && Array.isArray(tc.rounds)) {
                  thinkingRounds = tc.rounds;
                } else if (tc.tool && tc.result) {
                  // Regular tool call entry — handle all tool types
                  const toolName = tc.tool;
                  const entry: ToolCallEntry = {
                    tool: toolName,
                    query: tc.args?.keyword || tc.args?.artifact_id?.toString() || '',
                    results: [],
                    count: 0,
                    elapsed: 0,
                    done: true,
                    roundIndex: 0, // Fallback: backend doesn't save round info, loaded messages assign to round 0
                  };

                  if (toolName === 'get_artifact_detail') {
                    entry.artifactDetail = tc.result;
                    entry.count = 1;
                  } else if (toolName === 'query_knowledge_graph') {
                    entry.entities = tc.result.entities || [];
                    entry.relations = tc.result.relations || [];
                    entry.count = tc.result.count || 0;
                  } else {
                    // Default: search_artifacts
                    entry.results = tc.result.results || [];
                    entry.count = tc.result.count || tc.result.results?.length || 0;
                  }

                  toolCalls.push(entry);
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
          thinkingRounds,
          thinkingDone: true,
          toolCalls,
          streaming: false,
          error: false,
        };
      });
      setMessages(displayMsgs);

      // Auto-show panel if last assistant message has tool calls
      const lastAssistant = [...displayMsgs].reverse().find(m => m.role === 'assistant');
      if (lastAssistant && lastAssistant.toolCalls.length > 0) {
        setRagVisible(true);
      } else {
        setRagVisible(false);
      }
    } catch {
      setMessages([]);
    }
  }, []);

  // ── Select session ──
  const handleSelectSession = useCallback(
    (session: ChatSessionInfo) => {
      // Prevent switching while a response is still streaming
      if (loading) {
        message.warning('请等待回复完成后再切换');
        return;
      }

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setLoading(false);

      skipAutoRestoreRef.current = false;
      setActiveSessionId(session.id);
      setSelectedIds(new Set());
      setHistoryVisible(false);
      setRagToolLoading(false);

      loadSessionMessages(session.id);
    },
    [loadSessionMessages],
  );

  // ── Auto-restore session on mount (Bug 1 fix) ──
  // When navigating back from artifact detail, auto-select the most recent session
  // But NOT when user explicitly clicked "新对话" (skipAutoRestoreRef)
  useEffect(() => {
    if (skipAutoRestoreRef.current) return;
    if (sessions.length > 0 && activeSessionId === null && !loading) {
      handleSelectSession(sessions[0]);
    }
  }, [sessions, activeSessionId, loading, handleSelectSession]);

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

    skipAutoRestoreRef.current = true;
    setActiveSessionId(null);
    setMessages([]);
    setRagToolLoading(false);
    setRagVisible(false);
    setPanelToolCallIdx(-1);
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
      error: false,
    };

    const assistantMsg: DisplayMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      thinkingRounds: [],
      thinkingDone: false,
      toolCalls: [],
      streaming: true,
      error: false,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    const assistantId = assistantMsg.id;

    // Reset RAG state
    setRagToolLoading(false);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await sendChatMessage(query, activeSessionId, (event: SSEEventData) => {
        if (controller.signal.aborted) return;

        switch (event.type) {
          case 'session_created':
            // New session created - set activeSessionId immediately
            if (event.session_id) {
              setActiveSessionId(event.session_id);
            }
            break;

          case 'thinking_start':
            // Start a new thinking round — push an empty string as new round
            setMessages((prev) => {
              const msg = prev.find(m => m.id === assistantId);
              const currentRoundCount = msg?.thinkingRounds.length ?? 0;
              const newRoundIdx = currentRoundCount; // The new round will be at this index

              // Auto-expand this new thinking round
              setExpandedThinking((prevExp) => {
                const next = new Set(prevExp);
                next.add(`${assistantId}:${newRoundIdx}`);
                return next;
              });

              return prev.map((m) =>
                m.id === assistantId
                  ? { ...m, thinkingDone: false, thinkingRounds: [...m.thinkingRounds, ''] }
                  : m,
              );
            });
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
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                // Auto-collapse the current thinking round (last one)
                const currentRoundIdx = m.thinkingRounds.length - 1;
                setExpandedThinking((prevExp) => {
                  const next = new Set(prevExp);
                  next.delete(`${assistantId}:${currentRoundIdx}`);
                  return next;
                });
                return { ...m, thinkingDone: true };
              }),
            );
            break;

          case 'tool_call_start':
            // Auto-open RAG panel when tool call starts
            setRagVisible(true);
            setRagToolLoading(true);
            // ADD a new tool call entry (don't replace previous ones)
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === assistantId) {
                  // Tool calls after thinking_end of round N belong to round N
                  const roundIdx = m.thinkingRounds.length > 0 ? m.thinkingRounds.length - 1 : 0;
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
                        roundIndex: roundIdx,
                      },
                    ],
                  };
                }
                return m;
              }),
            );
            break;

          case 'tool_call_result':
            // Update the LAST tool call entry (the most recent one)
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId || m.toolCalls.length === 0) return m;
                const lastIdx = m.toolCalls.length - 1;
                const updatedToolCalls = [...m.toolCalls];
                const toolType = event.tool || 'search_artifacts';
                const newEntry: ToolCallEntry = {
                  ...updatedToolCalls[lastIdx],
                  tool: toolType,
                  query: event.query || updatedToolCalls[lastIdx].query,
                  count: event.count || 0,
                  elapsed: event.elapsed || 0,
                  done: true,
                };
                // Different tools have different result formats
                if (toolType === 'get_artifact_detail') {
                  newEntry.artifactDetail = event.artifactDetail;
                  newEntry.results = []; // No search results for detail
                } else if (toolType === 'query_knowledge_graph') {
                  newEntry.entities = event.entities || [];
                  newEntry.relations = event.relations || [];
                  newEntry.results = []; // No search results for graph
                } else {
                  // Default: search_artifacts
                  newEntry.results = event.results || [];
                }
                updatedToolCalls[lastIdx] = newEntry;
                return { ...m, toolCalls: updatedToolCalls };
              }),
            );
            // Update RAG panel - show results for the latest tool call
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
            // Refresh sessions list so new conversation appears in history
            // skipAutoRestoreRef prevents auto-restore race condition
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
      const errMsg = err instanceof Error ? err.message : '发送失败';
      // Check for timeout
      const isTimeout = errMsg.includes('timeout') || errMsg.includes('Timeout') || errMsg.includes('timed out');
      const displayErr = isTimeout ? '请求超时，请稍后重试' : errMsg;
      // Show inline error in the assistant message with retry option
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, streaming: false, error: true, content: displayErr, retryQuery: query }
            : m,
        ),
      );
      setLoading(false);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [inputValue, loading, activeSessionId, loadSessions]);

  // ── Retry a failed message ──
  const handleRetry = useCallback((retryQuery: string) => {
    // Remove the error assistant message, then re-send the query
    setMessages((prev) => prev.slice(0, -1));
    setInputValue(retryQuery);
    // Use setTimeout to ensure state updates before sending
    setTimeout(() => {
      // Trigger send programmatically by setting the input and calling handleSend
      // We need to work around the stale closure, so we directly invoke with the query
      setInputValue('');
      // Create the message flow manually
      const query = retryQuery;
      setLoading(true);

      const userMsg: DisplayMessage = {
        id: generateId(),
        role: 'user',
        content: query,
        thinkingRounds: [],
        thinkingDone: true,
        toolCalls: [],
        streaming: false,
        error: false,
      };

      const assistantMsg: DisplayMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        thinkingRounds: [],
        thinkingDone: false,
        toolCalls: [],
        streaming: true,
        error: false,
      };

      setMessages((prev) => [...prev.slice(0, -1), userMsg, assistantMsg]);
      const assistantId = assistantMsg.id;

      setRagToolLoading(false);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      sendChatMessage(query, activeSessionId, (event: SSEEventData) => {
        if (controller.signal.aborted) return;

        switch (event.type) {
          case 'session_created':
            if (event.session_id) {
              setActiveSessionId(event.session_id);
            }
            break;

          case 'thinking_start':
            setMessages((prev) => {
              const msg = prev.find(m => m.id === assistantId);
              const currentRoundCount = msg?.thinkingRounds.length ?? 0;
              const newRoundIdx = currentRoundCount;

              setExpandedThinking((prevExp) => {
                const next = new Set(prevExp);
                next.add(`${assistantId}:${newRoundIdx}`);
                return next;
              });

              return prev.map((m) =>
                m.id === assistantId
                  ? { ...m, thinkingDone: false, thinkingRounds: [...m.thinkingRounds, ''] }
                  : m,
              );
            });
            break;

          case 'thinking_delta':
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
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const currentRoundIdx = m.thinkingRounds.length - 1;
                setExpandedThinking((prevExp) => {
                  const next = new Set(prevExp);
                  next.delete(`${assistantId}:${currentRoundIdx}`);
                  return next;
                });
                return { ...m, thinkingDone: true };
              }),
            );
            break;

          case 'tool_call_start':
            setRagVisible(true);
            setRagToolLoading(true);
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === assistantId) {
                  const roundIdx = m.thinkingRounds.length > 0 ? m.thinkingRounds.length - 1 : 0;
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
                        roundIndex: roundIdx,
                      },
                    ],
                  };
                }
                return m;
              }),
            );
            break;

          case 'tool_call_result':
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId || m.toolCalls.length === 0) return m;
                const lastIdx = m.toolCalls.length - 1;
                const updatedToolCalls = [...m.toolCalls];
                const toolType = event.tool || 'search_artifacts';
                const newEntry: ToolCallEntry = {
                  ...updatedToolCalls[lastIdx],
                  tool: toolType,
                  query: event.query || updatedToolCalls[lastIdx].query,
                  count: event.count || 0,
                  elapsed: event.elapsed || 0,
                  done: true,
                };
                if (toolType === 'get_artifact_detail') {
                  newEntry.artifactDetail = event.artifactDetail;
                  newEntry.results = [];
                } else if (toolType === 'query_knowledge_graph') {
                  newEntry.entities = event.entities || [];
                  newEntry.relations = event.relations || [];
                  newEntry.results = [];
                } else {
                  newEntry.results = event.results || [];
                }
                updatedToolCalls[lastIdx] = newEntry;
                return { ...m, toolCalls: updatedToolCalls };
              }),
            );
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
      }, controller.signal).catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          setLoading(false);
          return;
        }
        const errMsg = err instanceof Error ? err.message : '发送失败';
        const isTimeout = errMsg.includes('timeout') || errMsg.includes('Timeout') || errMsg.includes('timed out');
        const displayErr = isTimeout ? '请求超时，请稍后重试' : errMsg;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, error: true, content: displayErr, retryQuery: query }
              : m,
          ),
        );
        setLoading(false);
      }).finally(() => {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      });
    }, 0);
  }, [activeSessionId, loadSessions]);

  // ── Keyboard shortcut ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !loading) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Build artifact name→id map from tool calls ──
  const buildArtifactNameMap = (msg: DisplayMessage): Map<string, number> => {
    const map = new Map<string, number>();
    for (const tc of msg.toolCalls) {
      if (tc.tool === 'search_artifacts') {
        for (const r of tc.results) {
          if (r.name && r.id) map.set(r.name, r.id);
        }
      }
      if (tc.tool === 'get_artifact_detail' && tc.artifactDetail) {
        if (tc.artifactDetail.name && tc.artifactDetail.id) {
          map.set(tc.artifactDetail.name, tc.artifactDetail.id);
        }
      }
    }
    return map;
  };

  // ── Pre-process content: wrap artifact names in markdown links ──
  const linkifyArtifactNames = (content: string, nameMap: Map<string, number>): string => {
    if (nameMap.size === 0 || !content) return content;
    // Sort names by length (longest first) to avoid partial matches
    const names = [...nameMap.keys()].sort((a, b) => b.length - a.length);
    let result = content;
    for (const name of names) {
      const id = nameMap.get(name)!;
      // Only replace if the name appears as plain text (not already in a markdown link)
      // Use a regex that avoids matching inside markdown link syntax
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match the name when NOT preceded by '(' (part of markdown link) and NOT followed by ')' (part of markdown link)
      const regex = new RegExp(`(?<!\\[)(?<!\\]\\()(?:\\*\\*)?${escaped}(?:\\*\\*)?(?!\\]\\()`, 'g');
      result = result.replace(regex, `**[${name}](/artifacts/${id})**`);
    }
    return result;
  };

  // ── Render interleaved ReAct rounds (thinking + tool call paired) ──
  const renderReActRounds = (msg: DisplayMessage) => {
    if (msg.thinkingRounds.length === 0 && msg.toolCalls.length === 0) return null;

    const elements: React.ReactNode[] = [];
    const maxRound = Math.max(
      msg.thinkingRounds.length,
      msg.toolCalls.length > 0 ? Math.max(...msg.toolCalls.map(tc => tc.roundIndex)) + 1 : 0,
    );

    for (let i = 0; i < maxRound; i++) {
      const thinkingText = msg.thinkingRounds[i];
      const roundToolCalls = msg.toolCalls.filter(tc => tc.roundIndex === i);

      // 1. Render thinking for this round (if exists and has content)
      if (thinkingText && thinkingText.length > 0) {
        const key = `${msg.id}:${i}`;
        const isExpanded = expandedThinking.has(key);
        const isStreamingThisRound = !msg.thinkingDone && i === msg.thinkingRounds.length - 1;

        const toggleExpand = () => {
          setExpandedThinking((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          });
        };

        elements.push(
          <div
            key={`thinking-${i}`}
            style={{
              marginBottom: 8,
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
              {isStreamingThisRound && (
                <LoadingOutlined style={{ fontSize: 10, color: '#533afd', marginLeft: 4 }} />
              )}
              {!isStreamingThisRound && thinkingText.length > 0 && (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  ({thinkingText.length} 字)
                </span>
              )}
              {isExpanded ? (
                <DownOutlined style={{ fontSize: 10, marginLeft: 'auto' }} />
              ) : (
                <RightOutlined style={{ fontSize: 10, marginLeft: 'auto' }} />
              )}
            </div>
            {isExpanded && thinkingText.length > 0 && (
              <div
                style={{
                  padding: '10px 12px',
                  fontSize: 12,
                  lineHeight: 1.7,
                  color: '#64748d',
                  borderTop: '1px solid #e5edf5',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {thinkingText}
              </div>
            )}
          </div>,
        );
      }

      // 2. Render ALL tool calls for this round
      for (const toolCall of roundToolCalls) {
        const tcIdx = msg.toolCalls.indexOf(toolCall);
        const isPanelSelected = ragVisible && (panelToolCallIdx === tcIdx || (panelToolCallIdx < 0 && tcIdx === msg.toolCalls.length - 1));
        const handleClick = () => {
          setPanelToolCallIdx(tcIdx);
          setRagVisible(true);
        };

        elements.push(
          <div
            key={`tool-${tcIdx}`}
            onClick={handleClick}
            style={{
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              background: isPanelSelected ? 'rgba(83,58,253,0.08)' : '#f6f9fc',
              border: isPanelSelected ? '1px solid #b9b9f9' : '1px solid #e5edf5',
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = '#b9b9f9';
              (e.currentTarget as HTMLElement).style.background = 'rgba(83,58,253,0.04)';
            }}
            onMouseLeave={(e) => {
              if (!isPanelSelected) {
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
              {tcIdx + 1}
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
              "{toolCall.query}"
            </span>
            {!toolCall.done ? (
              <LoadingOutlined style={{ fontSize: 10, color: '#533afd', marginLeft: 'auto' }} />
            ) : toolCall.count > 0 ? (
              <span style={{ marginLeft: 'auto', color: '#15be53', fontWeight: 500 }}>
                {toolCall.count} 条
              </span>
            ) : (
              <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>无结果</span>
            )}
          </div>,
        );
      }
    }

    return <div>{elements}</div>;
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
          transition: 'flex-basis 0.2s ease',
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
          {(() => {
            const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
            const toolCallCount = lastAssistant?.toolCalls.length || 0;
            if (toolCallCount > 0 || ragToolLoading) {
              return (
                <Button
                  type="text"
                  size="small"
                  onClick={() => setRagVisible(!ragVisible)}
                  style={{ color: ragVisible ? '#533afd' : '#64748d', fontSize: 12 }}
                >
                  {ragVisible ? '收起检索结果' : `检索结果 (${toolCallCount})`}
                </Button>
              );
            }
            return null;
          })()}
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
              <RobotOutlined data-testid="robot-icon" style={{ fontSize: 48, color: '#94a3b8' }} />
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
                width: msg.role === 'assistant' ? '100%' : undefined,
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
                {msg.role === 'assistant' && renderReActRounds(msg)}

                {/* Content */}
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
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
                        a: ({ href, children }) => {
                          // If this is an internal artifact link, render as React Router Link
                          if (href && href.startsWith('/artifacts/')) {
                            return (
                              <Link
                                to={href}
                                style={{
                                  color: '#533afd',
                                  textDecoration: 'none',
                                  fontWeight: 500,
                                  borderBottom: '1px solid rgba(83,58,253,0.3)',
                                  transition: 'border-color 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.borderBottomColor = '#533afd';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.borderBottomColor = 'rgba(83,58,253,0.3)';
                                }}
                              >
                                {children}
                              </Link>
                            );
                          }
                          return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
                        },
                      }}
                    >
                      {linkifyArtifactNames(msg.content, buildArtifactNameMap(msg))}
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
                  {msg.error && msg.retryQuery && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 10,
                        padding: '8px 12px',
                        background: '#fff1f0',
                        border: '1px solid #ffa39e',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: '#cf1322', flex: 1 }}>{msg.content}</span>
                      <Button
                        type="primary"
                        size="small"
                        icon={<ReloadOutlined />}
                        onClick={() => handleRetry(msg.retryQuery!)}
                        style={{
                          background: '#533afd',
                          borderColor: '#533afd',
                          borderRadius: 4,
                          fontSize: 12,
                        }}
                      >
                        重试
                      </Button>
                    </div>
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
            flexShrink: 0,
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
            flexShrink: 0,
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
            </div>
            <Button
              type="text"
              icon={<CloseOutlined />}
              size="small"
              onClick={() => setRagVisible(false)}
              style={{ color: '#94a3b8' }}
            />
          </div>

          {/* All tool calls stacked (no tabs) */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {(() => {
              const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
              const allToolCalls = lastAssistant?.toolCalls || [];

              if (ragToolLoading && allToolCalls.length === 0) {
                return (
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
                );
              }

              if (allToolCalls.length === 0) {
                return (
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
                );
              }

              // Show the tool call selected by user (panelToolCallIdx), or last one if auto
              const lastTc = panelToolCallIdx >= 0 && panelToolCallIdx < allToolCalls.length
                ? allToolCalls[panelToolCallIdx]
                : allToolCalls[allToolCalls.length - 1];
              if (!lastTc) {
                return (
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
                );
              }

              return (
                <div>
                  {/* Tool call header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 8,
                      fontSize: 12,
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
                      1
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#061b31' }}>
                      {lastTc.tool === 'search_artifacts' ? '文物搜索' :
                       lastTc.tool === 'get_artifact_detail' ? '文物详情' :
                       lastTc.tool === 'query_knowledge_graph' ? '知识图谱' : lastTc.tool}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      "{lastTc.query}"
                    </span>
                    {!lastTc.done ? (
                      <LoadingOutlined style={{ fontSize: 10, color: '#533afd' }} />
                    ) : (
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        {lastTc.elapsed > 0 ? `${lastTc.elapsed.toFixed(1)}s` : ''}
                      </span>
                    )}
                  </div>

                  {/* Tool-specific content */}
                  {lastTc.tool === 'get_artifact_detail' && lastTc.artifactDetail && (
                    <div
                      style={{
                        padding: '12px',
                        background: '#f6f9fc',
                        border: '1px solid #e5edf5',
                        borderRadius: 8,
                      }}
                    >
                      {lastTc.artifactDetail.image_url && (
                        <img
                          src={lastTc.artifactDetail.image_url}
                          alt={lastTc.artifactDetail.name}
                          style={{
                            width: '100%',
                            height: 120,
                            objectFit: 'cover',
                            borderRadius: 6,
                            marginBottom: 8,
                          }}
                          onClick={() => navigate(`/artifacts/${lastTc.artifactDetail!.id}`)}
                        />
                      )}
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#061b31', marginBottom: 6 }}>
                        {lastTc.artifactDetail.name}
                      </div>
                      {lastTc.artifactDetail.description && (
                        <div style={{ fontSize: 12, color: '#64748d', lineHeight: 1.6, marginBottom: 8 }}>
                          {lastTc.artifactDetail.description.slice(0, 200)}{lastTc.artifactDetail.description.length > 200 ? '...' : ''}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {[lastTc.artifactDetail.category, lastTc.artifactDetail.era, lastTc.artifactDetail.location]
                          .filter(Boolean)
                          .map((tag) => (
                            <span
                              key={tag}
                              style={{
                                padding: '2px 8px',
                                background: '#fff',
                                border: '1px solid #e5edf5',
                                borderRadius: 4,
                                fontSize: 11,
                                color: '#64748d',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {lastTc.tool === 'query_knowledge_graph' && lastTc.entities && lastTc.entities.length > 0 && (
                    <div
                      style={{
                        padding: '12px',
                        background: '#f6f9fc',
                        border: '1px solid #e5edf5',
                        borderRadius: 8,
                      }}
                    >
                      {/* Group entities by type for structured display */}
                      {(() => {
                        const typeGroups: Record<string, typeof lastTc.entities> = {};
                        (lastTc.entities || []).forEach(e => {
                          const t = e.type || '其他';
                          if (!typeGroups[t]) typeGroups[t] = [];
                          typeGroups[t].push(e);
                        });

                        const typeIcons: Record<string, string> = {
                          '文物': '🏛️',
                          '朝代': '📅',
                          '类别': '📂',
                          '地点': '📍',
                          '标签': '🏷️',
                        };

                        const typeColors: Record<string, string> = {
                          '文物': '#533afd',
                          '朝代': '#f59e0b',
                          '类别': '#10b981',
                          '地点': '#ef4444',
                          '标签': '#6366f1',
                        };

                        // Group relations by relation type for a compact summary
                        const relByType: Record<string, {src: string, tgt: string}[]> = {};
                        (lastTc.relations || []).forEach(r => {
                          const rt = r.relation || '关联';
                          if (!relByType[rt]) relByType[rt] = [];
                          relByType[rt].push({ src: r.source, tgt: r.target });
                        });

                        return (
                          <>
                            {Object.entries(typeGroups).map(([type, ents]) => (
                              <div key={type} style={{ marginBottom: 8 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: typeColors[type] || '#64748d', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span>{typeIcons[type] || '📌'}</span>
                                  <span>{type}（{ents.length}）</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {ents.slice(0, 12).map((entity, i) => (
                                    <span
                                      key={i}
                                      style={{
                                        padding: '2px 8px',
                                        fontSize: 11,
                                        background: '#fff',
                                        border: `1px solid ${typeColors[type] || '#e5edf5'}30`,
                                        borderRadius: 4,
                                        color: '#334155',
                                      }}
                                    >
                                      {entity.name}
                                    </span>
                                  ))}
                                  {ents.length > 12 && (
                                    <span style={{ fontSize: 11, color: '#94a3b8', padding: '2px 4px' }}>
                                      +{ents.length - 12} 更多
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                            {/* Relations summary */}
                            {Object.keys(relByType).length > 0 && (
                              <div style={{ borderTop: '1px solid #e5edf5', paddingTop: 6, marginTop: 4 }}>
                                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>关系概览</div>
                                {Object.entries(relByType).map(([relType, pairs]) => (
                                  <div key={relType} style={{ fontSize: 11, color: '#64748d', marginBottom: 2 }}>
                                    <span style={{ color: '#533afd', fontWeight: 500 }}>{relType}</span>
                                    <span style={{ color: '#94a3b8' }}>（{pairs.length}条）</span>
                                    <span style={{ color: '#475569' }}> {pairs.slice(0, 3).map(p => `${p.src}→${p.tgt}`).join('；')}</span>
                                    {pairs.length > 3 && <span style={{ color: '#94a3b8' }}> 等</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                              共 {lastTc.entities!.length} 个实体，{lastTc.relations?.length || 0} 条关系
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {lastTc.tool === 'search_artifacts' && lastTc.results.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {lastTc.results.map((r, i) => (
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
                          }}
                          onMouseLeave={(e) => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.borderColor = '#e5edf5';
                            el.style.background = '#f6f9fc';
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                color: '#533afd',
                                background: 'rgba(83,58,253,0.1)',
                                width: 16,
                                height: 16,
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
                              lineHeight: 1.5,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {r.snippet}
                          </div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {[r.category, r.era, r.location].filter(Boolean).map((tag) => (
                              <span key={tag} style={{ padding: '1px 6px', background: '#fff', border: '1px solid #e5edf5', borderRadius: 3 }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No results for this tool */}
                  {lastTc.done && lastTc.tool === 'search_artifacts' && lastTc.results.length === 0 && (
                    <div style={{ padding: '12px', background: '#f6f9fc', borderRadius: 6, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                      未找到匹配的文物
                    </div>
                  )}
                  {lastTc.done && lastTc.tool === 'query_knowledge_graph' && (!lastTc.entities || lastTc.entities.length === 0) && (
                    <div style={{ padding: '12px', background: '#f6f9fc', borderRadius: 6, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                      未找到相关图谱数据
                    </div>
                  )}
                </div>
              );
            })()}
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
