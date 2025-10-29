export const conversationThreadMap = new Map<string, string>();
export const conversationThreadTimestamps = new Map<string, number>();

// Exported types
export type SSEEvent =
  | { done: true }
  | { done: false; json: any }
  | { done: false; text: string };

export interface AgentCallOptions {
  agentId: string;
  message: string;
  userId: string;
  conversationId: string;
}

export interface AgentCallResult {
  messages: any[];
  content?: string;
}

export interface ThreadCreateResponse {
  thread_id?: string;
  id?: string;
  threadId?: string;
}

export function parseSSEFromString(sse: string): SSEEvent[] {
  // Test helper: parse an SSE string into events (json/text/done)
  const events: any[] = [];
  const blocks = sse.split(/\n\n/);
  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;
    const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
    const dataLines: string[] = [];
    for (const l of lines) {
      if (l.startsWith('data:')) dataLines.push(l.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    const payload = dataLines.join('\n');
    if (payload === '[DONE]') {
      events.push({ done: true });
      continue;
    }
    try {
      events.push({ done: false, json: JSON.parse(payload) });
    } catch (e) {
      events.push({ done: false, text: payload });
    }
  }
  return events as SSEEvent[];
}

export class LangGraphClient {
  public baseUrl: string;
  maxRetries: number;
  retryDelay: number;

  constructor(baseUrl: string, maxRetries = 3, retryDelay = 1000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  private now() { return Date.now(); }

  async ensureThread(conversationId: string, userId: string, agentId?: string): Promise<string> {
    let threadId = conversationThreadMap.get(conversationId);
    if (threadId) {
      conversationThreadTimestamps.set(conversationId, this.now());
      return threadId;
    }

    const res = await fetch(`${this.baseUrl}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metadata: { conversationId, userId, agentId, createdAt: new Date().toISOString() } })
    });

    if (!res.ok) throw new Error(`Failed to create thread: ${res.status} ${res.statusText}`);
    const body = await res.json();
    threadId = body.thread_id || body.id || body.threadId;
    if (!threadId) throw new Error('LangGraph created thread but returned no id');

    conversationThreadMap.set(conversationId, threadId);
    conversationThreadTimestamps.set(conversationId, this.now());
    return threadId;
  }

  private async parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>, onEvent: (data: SSEEvent) => void) {
    const decoder = new TextDecoder();
    let buf = '';
    return (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!block) continue;
          const lines = block.split(/\n/);
          const dataLines: string[] = [];
          for (const line of lines) if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          if (dataLines.length === 0) continue;
          const payload = dataLines.join('\n');
          if (payload === '[DONE]') { onEvent({ done: true }); return; }
          try { onEvent({ done: false, json: JSON.parse(payload) }); } catch (e) { onEvent({ done: false, text: payload }); }
        }
      }
      if (buf.trim()) {
        const lines = buf.split(/\n/).map(l => l.trim()).filter(Boolean);
        for (const l of lines) {
          if (l.startsWith('data:')) {
            const payload = l.slice(5).trim();
            if (payload === '[DONE]') { onEvent({ done: true }); return; }
            try { onEvent({ done: false, json: JSON.parse(payload) }); } catch (e) { onEvent({ done: false, text: payload }); }
          }
        }
      }
    })();
  }

  async callAgentWithStream(opts: AgentCallOptions): Promise<AgentCallResult> {
    const { agentId, message, userId, conversationId } = opts;
    let attempt = 0;
    const max = this.maxRetries;
    const baseDelay = this.retryDelay;

    while (attempt <= max) {
      try {
        const threadId = await this.ensureThread(conversationId, userId, agentId);

        const messageData = {
          input: { messages: [{ role: 'human', content: message }], userId, conversationId },
          assistant_id: agentId,
          config: { configurable: { _credentials: { user: { sub: userId } } } },
          stream_mode: 'values'
        };

        const resp = await fetch(`${this.baseUrl}/threads/${threadId}/runs/stream`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(messageData)
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`LangGraph agent error: ${resp.status} ${resp.statusText} ${text}`);
        }

  const reader = resp.body?.getReader();
        if (!reader) throw new Error('No response body reader from LangGraph');

        let messages: any[] = [];
        let lastContent = '';

        await this.parseSSE(reader, (ev) => {
          if (ev.done) return;
          if ('json' in ev) {
            const data = ev.json;
            if (data.messages && Array.isArray(data.messages)) {
              messages = data.messages;
              for (let i = data.messages.length - 1; i >= 0; i--) {
                const m = data.messages[i];
                if ((m.type === 'ai' || m.role === 'assistant') && m.content) {
                  lastContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                  break;
                }
              }
            } else if (data.event === 'messages/partial' && data.partial) {
              lastContent = lastContent || (typeof data.partial === 'string' ? data.partial : JSON.stringify(data.partial));
            }
          } else if ('text' in ev) {
            lastContent = ev.text;
          }
        });

        if (!lastContent && messages.length > 0) {
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if ((m.type === 'ai' || m.role === 'assistant') && m.content) {
              lastContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
              break;
            }
          }
        }

        this.evictStaleThreads(60 * 60 * 1000);

        return { messages: messages.length ? messages : [{ role: 'assistant', content: lastContent }], content: lastContent };
      } catch (err) {
        attempt += 1;
        const isTransient = err instanceof TypeError || (err instanceof Error && /timeout|network|ECONNRESET|ENOTFOUND/i.test(err.message || ''));
        if (!isTransient || attempt > max) {
          const msg = `I apologize, but I'm having trouble connecting to the ${opts.agentId} service right now. Please try again in a moment.`;
          return { messages: [{ role: 'assistant', content: msg }], content: msg };
        }

        const backoff = baseDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100);
        await new Promise(r => setTimeout(r, backoff));
      }
    }

    const fallback = `I apologize, but I'm having trouble connecting to the ${opts.agentId} service right now.`;
    return { messages: [{ role: 'assistant', content: fallback }], content: fallback };
  }

  evictStaleThreads(ttlMs: number) {
    const now = this.now();
    for (const [convId, ts] of conversationThreadTimestamps.entries()) {
      if (now - ts > ttlMs) {
        conversationThreadTimestamps.delete(convId);
        const tid = conversationThreadMap.get(convId);
        if (tid) conversationThreadMap.delete(convId);
      }
    }
  }
}

export default LangGraphClient;
