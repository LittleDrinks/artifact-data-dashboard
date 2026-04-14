import client from './client';

/** 会话信息 */
export interface ChatSessionInfo {
  id: number;
  user_id: number;
  title: string | null;
  mode_used: string;
  created_at: string;
  message_count: number;
}

/** 消息信息 */
export interface ChatMessageInfo {
  id: number;
  session_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string | null;
  tool_calls: string | null;
  created_at: string;
}

/** SSE 事件数据 */
export interface SSEEventData {
  type: string;
  // thinking
  content?: string;
  // tool call
  tool?: string;
  query?: string;
  results?: SearchResultItem[];
  count?: number;
  elapsed?: number;
  // done
  sources?: SourceItem[];
}

/** 搜索结果条目 */
export interface SearchResultItem {
  id: number;
  name: string;
  snippet: string;
  category: string | null;
  era: string | null;
  location: string | null;
}

/** 引用来源 */
export interface SourceItem {
  name: string;
  source: string;
}

/** 创建会话 */
export async function createChatSession(title?: string): Promise<ChatSessionInfo> {
  const res = await client.post<ChatSessionInfo>('/chat/sessions', { title });
  return res.data;
}

/** 获取会话列表 */
export async function getChatSessions(
  page = 1,
  size = 20,
): Promise<{ items: ChatSessionInfo[]; total: number }> {
  const res = await client.get('/chat/sessions', { params: { page, size } });
  return res.data;
}

/** 获取会话历史消息 */
export async function getChatMessages(sessionId: number): Promise<ChatMessageInfo[]> {
  const res = await client.get<ChatMessageInfo[]>(`/chat/sessions/${sessionId}/messages`);
  return res.data;
}

/**
 * 发送聊天消息（SSE 流式）。
 * 因为 POST SSE 不能用 EventSource，使用 fetch + ReadableStream。
 */
export async function sendChatMessage(
  question: string,
  sessionId?: number | null,
  onEvent?: (event: SSEEventData) => void,
): Promise<void> {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/chat/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      question,
      session_id: sessionId ?? undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let detail = '请求失败';
    try {
      const errorJson = JSON.parse(errorText);
      detail = errorJson.detail || detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE format: "data: {...}\n\n"
    // Only process complete lines (ending with \n); keep the tail in buffer
    const lines = buffer.split('\n');
    // Last element is either an incomplete line (no trailing \n) or empty string (trailing \n)
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.startsWith('data: ')) {
        const jsonStr = line.slice(6);
        // Skip SSE keep-alive empty data lines (data: )
        if (jsonStr === '') continue;
        try {
          const event: SSEEventData = JSON.parse(jsonStr);
          onEvent?.(event);
        } catch {
          // Incomplete JSON — unlikely for complete lines, but safe to ignore
        }
      }
      // All other lines (empty delimiters, comments) are ignored
    }
  }
}
