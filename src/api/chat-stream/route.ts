// Final clean streaming endpoint
import { NextRequest } from 'next/server';
import { createSupervisorAgent } from '@/lib/agents/supervisor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { userId = '', conversationId, message = '' } = body;

  const agent = createSupervisorAgent(userId, conversationId);
  if (!agent || typeof agent.stream !== 'function') {
    // Return an NDJSON stream with a typed error event so the client receives
    // a structured error instead of an HTTP 500. This improves UX for
    // streaming consumers which expect NDJSON events.
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', payload: { message: 'Streaming agent unavailable' } }) + '\n'));
        controller.close();
      }
    });
    return new Response(responseStream, { headers: { 'Content-Type': 'application/x-ndjson' } });
  }

  let stream;
  try {
    stream = await agent.stream(message, conversationId);
  } catch (errStart) {
    // If starting the agent stream throws synchronously, return an NDJSON
    // stream containing a typed error event so the client receives the
    // error as part of the normal streaming protocol.
    console.error('[chat-stream] failed to start agent.stream', errStart);
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      start(controller) {
        const eAny: any = errStart as any;
        const payload = { message: String(eAny?.message ?? String(eAny)), stack: eAny?.stack };
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', payload }) + '\n'));
        controller.close();
      }
    });
    return new Response(responseStream, { headers: { 'Content-Type': 'application/x-ndjson' } });
  }
    const encoder = new TextEncoder();

    const toAsyncIterable = (s: any) => {
      if (!s) return null;
      if (typeof s[Symbol.asyncIterator] === 'function') return s;
      if (typeof s.getReader === 'function') {
        const reader = s.getReader();
        return {
          async *[Symbol.asyncIterator]() {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                yield value;
              }
            } finally {
              try { reader.releaseLock(); } catch {}
            }
          }
        };
      }

      return null;
    };

    const iterable = toAsyncIterable(stream) || stream;
    const responseStream = new ReadableStream({
      async start(controller) {
        // Helper: attempt to extract human-readable strings from complex agent state objects
          // Track workflow context to only emit when it changes
          let previousWorkflowContext: string | null = null;
          
          // Helper: detect plan-like (planner/supervisor) recommendation shapes
          function isPlanLike(value: any): boolean {
            try {
              if (value == null) return false;
              if (typeof value === 'string') {
                const s = value.trim();
                return s.startsWith('{') && /"action"\s*:\s*"[a-z_]+"/i.test(s);
              }
              if (typeof value === 'object') {
                if (typeof value.action === 'string' && typeof value.confidence !== 'undefined') return true;
                if (value.planningRecommendation || value.planner || value.targetAgent || value.recommendedAgent) return true;
              }
            } catch (e) {
              // ignore
            }
            return false;
          }

          // Helper: extract metadata from chunk for dev tools
          function extractMetadata(chunk: any, prevContext: string | null): { metadata: any | null, newContext: string | null } {
            try {
              if (!chunk || typeof chunk !== 'object') return { metadata: null, newContext: prevContext };
              
              let newContext = prevContext;
              
              // Check for planner recommendation
              if (chunk.plannerRecommendation || chunk.planningRecommendation) {
                return {
                  metadata: {
                    type: 'planner_recommendation',
                    data: chunk.plannerRecommendation || chunk.planningRecommendation,
                    timestamp: Date.now()
                  },
                  newContext
                };
              }
              
              // Check for agent routing decision (from specialized agents)
              // This captures when an agent decides where to route next
              if (chunk.next && chunk.next !== '__end__' && chunk.messages && Array.isArray(chunk.messages) && chunk.messages.length > 0) {
                const lastMsg = chunk.messages[chunk.messages.length - 1];
                // Detect if this is from a specialized agent (not supervisor, not planner)
                const fromAgent = lastMsg.agent;
                if (fromAgent && fromAgent !== 'supervisor' && fromAgent !== 'user' && fromAgent !== 'planner') {
                  return {
                    metadata: {
                      type: 'agent_routing_decision',
                      data: {
                        fromAgent: fromAgent,
                        toAgent: chunk.next,
                        workflowContext: chunk.workflowContext,
                        dealData: chunk.dealData ? {
                          applied: chunk.dealData.applied,
                          pending: chunk.dealData.pending,
                          type: chunk.dealData.type
                        } : null,
                        pendingProduct: chunk.pendingProduct ? {
                          product: chunk.pendingProduct.product,
                          quantity: chunk.pendingProduct.quantity
                        } : null,
                        cartData: chunk.cartData ? 'present' : null
                      },
                      timestamp: Date.now()
                    },
                    newContext
                  };
                }
              }
              
              // Check for supervisor decision/routing
              if (chunk.next && chunk.next !== '__end__' && (chunk.supervisor || chunk.agent === 'supervisor')) {
                return {
                  metadata: {
                    type: 'supervisor_decision',
                    data: {
                      targetAgent: chunk.next,
                      workflowContext: chunk.workflowContext,
                      dealData: chunk.dealData ? 'present' : null,
                      pendingProduct: chunk.pendingProduct ? 'present' : null,
                      cartData: chunk.cartData ? 'present' : null
                    },
                    timestamp: Date.now()
                  },
                  newContext
                };
              }
              
              // Check for agent transitions (messages with agent attribution)
              if (chunk.messages && Array.isArray(chunk.messages) && chunk.messages.length > 0) {
                const lastMsg = chunk.messages[chunk.messages.length - 1];
                if (lastMsg.agent && lastMsg.agent !== 'user') {
                  return {
                    metadata: {
                      type: 'agent_transition',
                      data: {
                        agent: lastMsg.agent,
                        role: lastMsg.role,
                        timestamp: lastMsg.timestamp
                      },
                      timestamp: Date.now()
                    },
                    newContext
                  };
                }
              }
              
              // Check for workflow context changes - ONLY emit if it changed
              if (chunk.workflowContext && chunk.workflowContext !== prevContext) {
                newContext = chunk.workflowContext;
                return {
                  metadata: {
                    type: 'workflow_context',
                    data: {
                      context: chunk.workflowContext,
                      dealData: chunk.dealData ? 'present' : null,
                      pendingProduct: chunk.pendingProduct ? 'present' : null
                    },
                    timestamp: Date.now()
                  },
                  newContext
                };
              }
              
              return { metadata: null, newContext };
            } catch (e) {
              return { metadata: null, newContext: prevContext };
            }
          }

          function extractReadableTexts(obj: any): string[] {
            const out: string[] = [];
            try {
              if (obj === null || obj === undefined) return out;
              if (typeof obj === 'string') {
                if (!isPlanLike(obj)) out.push(obj);
                return out;
              }

              if (obj instanceof Uint8Array) {
                out.push(new TextDecoder().decode(obj));
                return out;
              }

              if (obj.message && obj.message.kwargs && typeof obj.message.kwargs.content === 'string') {
                if (!isPlanLike(obj.message.kwargs.content)) out.push(obj.message.kwargs.content);
              }

              if (typeof obj.content === 'string') {
                if (!isPlanLike(obj.content)) out.push(obj.content);
              }

              if (obj.message && typeof obj.message.content === 'string') {
                if (!isPlanLike(obj.message.content)) out.push(obj.message.content);
              }

              const agentKeys = ['planner', 'supervisor', 'catalog', 'deals', 'cart_and_checkout', 'notification_agent'];
              for (const k of agentKeys) {
                if (obj[k]) {
                  out.push(...extractReadableTexts(obj[k]));
                }
              }

              if (Array.isArray(obj.messages)) {
                for (const m of obj.messages) {
                  if (m && m.message) {
                    out.push(...extractReadableTexts(m.message));
                  } else if (m && typeof m.content === 'string') {
                    if (!isPlanLike(m.content)) out.push(m.content);
                  } else if (m && typeof m === 'string') {
                    if (!isPlanLike(m)) out.push(m);
                  }
                }
              }

              if (out.length === 0) {
                const json = JSON.stringify(obj);
                const match = json.match(/"content"\s*:\s*"([^"]{1,2000})"/);
                if (match && !isPlanLike(match[1])) out.push(match[1]);
              }

              if (out.length === 0 && !isPlanLike(obj)) out.push(JSON.stringify(obj));
            } catch (e) {
              try { out.push(String(obj)); } catch { /* ignore */ }
            }
            return out;
          }

          // Helper: detect ephemeral/status-like short messages (e.g., "🤔 Thinking...", "✅ Agent task completed...")
          function isStatusLike(text: any): boolean {
            if (!text || typeof text !== 'string') return false;
            const t = text.trim();
            if (t.length === 0) return false;
            if (t.length > 200) return false; // too long to be a status
            const lower = t.toLowerCase();
            const keywords = ['thinking', 'evaluating', 'evaluating next', 'agent task', 'task completed', 'completed', 'processing', 'thinking...', 'done', 'evaluating next steps', 'searching', 'checking', 'adding', 'updating', 'preparing', 'found'];
            for (const k of keywords) if (lower.includes(k)) return true;
            try {
              if (/\p{Emoji}/u.test(t) || /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}]/u.test(t)) {
                if (t.split(/\s+/).length <= 6) return true;
              }
            } catch (e) {
              // ignore regex support issues
            }
            return false;
          }
          
          // Helper: check if chunk has ephemeral marker in progress field
          function isEphemeralChunk(obj: any): boolean {
            return Boolean(obj?.progress?.ephemeral);
          }

        try {
          for await (const chunk of iterable) {
            // Extract and emit metadata for dev tools if present
            const { metadata, newContext } = extractMetadata(chunk, previousWorkflowContext);
            if (metadata) {
              controller.enqueue(encoder.encode(JSON.stringify({ 
                type: 'metadata', 
                payload: metadata 
              }) + '\n'));
            }
            // Update tracked context
            previousWorkflowContext = newContext;
            
            // If chunk is textual or binary, decode and split into lines
            if (typeof chunk === 'string' || chunk instanceof Uint8Array) {
              const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
              const lines = String(text).split(/\r?\n/).filter(Boolean);
              for (const l of lines) {
                // Try to parse JSON lines; if it's valid JSON, attempt to extract readable bits
                try {
                  const parsed = JSON.parse(l);
                  // If the agent already emitted a typed event (type: 'progress'|'message'|...), pass it through
                  if (parsed && typeof parsed.type === 'string') {
                    controller.enqueue(encoder.encode(JSON.stringify(parsed) + '\n'));
                    continue;
                  }
                  // If this is a plan-like recommendation, emit as a meta event
                  if (isPlanLike(parsed)) {
                    controller.enqueue(encoder.encode(JSON.stringify({ type: 'meta', payload: parsed }) + '\n'));
                    continue;
                  }
                  const texts = extractReadableTexts(parsed);
                  for (const t of texts) {
                    // Check if the source chunk is ephemeral
                    const ephemeralMarker = isEphemeralChunk(parsed);
                    
                    if (isStatusLike(t) || ephemeralMarker) {
                      // Emit as status event with ephemeral metadata
                      const statusPayload: any = { 
                        text: t, 
                        ephemeral: true 
                      };
                      
                      // Include auto-remove timeout if available
                      if (parsed.progress?.autoRemoveMs) {
                        statusPayload.autoRemoveMs = parsed.progress.autoRemoveMs;
                      }
                      
                      // Include agent info if available
                      if (parsed.agent || parsed.progress?.agent) {
                        statusPayload.agent = parsed.agent || parsed.progress.agent;
                      }
                      
                      controller.enqueue(encoder.encode(JSON.stringify({ 
                        type: 'status', 
                        payload: statusPayload 
                      }) + '\n'));
                    } else {
                      controller.enqueue(encoder.encode(JSON.stringify({ type: 'message', payload: { content: t } }) + '\n'));
                    }
                  }
                } catch (e) {
                  // Not JSON — try to find an embedded JSON substring (e.g., 'USER_LATEST: {...}')
                  if (typeof l === 'string' && l.indexOf('{') >= 0 && l.indexOf('}') >= 0) {
                    try {
                      const first = l.indexOf('{');
                      const last = l.lastIndexOf('}');
                      if (first >= 0 && last > first) {
                        const sub = l.slice(first, last + 1);
                        const subParsed = JSON.parse(sub);
                        if (isPlanLike(subParsed)) {
                          controller.enqueue(encoder.encode(JSON.stringify({ type: 'meta', payload: subParsed }) + '\n'));
                          continue;
                        }
                        const texts = extractReadableTexts(subParsed);
                        for (const t of texts) controller.enqueue(encoder.encode(JSON.stringify({ type: 'message', payload: { content: t } }) + '\n'));
                        continue;
                      }
                    } catch (e2) {
                      // fall back to raw
                    }
                  }

                  // Default: send raw text as a raw event if it's not a plan-like string
                  if (!isPlanLike(l)) {
                    if (isStatusLike(l)) {
                      controller.enqueue(encoder.encode(JSON.stringify({ type: 'status', payload: { text: l, ephemeral: true } }) + '\n'));
                    } else {
                      controller.enqueue(encoder.encode(JSON.stringify({ type: 'raw', payload: l }) + '\n'));
                    }
                  }
                }
              }
              continue;
            }

            // Non-text chunk (object) - try to extract readable text fields
            if (typeof chunk === 'object') {
              const texts = extractReadableTexts(chunk);
              const ephemeralMarker = isEphemeralChunk(chunk);
              
              for (const t of texts) {
                if (isStatusLike(t) || ephemeralMarker) {
                  const statusPayload: any = { 
                    text: t, 
                    ephemeral: true 
                  };
                  
                  if (chunk.progress?.autoRemoveMs) {
                    statusPayload.autoRemoveMs = chunk.progress.autoRemoveMs;
                  }
                  
                  if (chunk.agent || chunk.progress?.agent) {
                    statusPayload.agent = chunk.agent || chunk.progress.agent;
                  }
                  
                  controller.enqueue(encoder.encode(JSON.stringify({ 
                    type: 'status', 
                    payload: statusPayload 
                  }) + '\n'));
                } else {
                  controller.enqueue(encoder.encode(JSON.stringify({ type: 'message', payload: { content: t } }) + '\n'));
                }
              }
              continue;
            }

            // Fallback: stringify chunk
            const text = JSON.stringify(chunk);
            if (isStatusLike(text)) {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'status', payload: { text, ephemeral: true } }) + '\n'));
            } else {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'message', payload: { content: text } }) + '\n'));
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', payload: String(err) }) + '\n'));
        } finally { controller.close(); }
      }
    });

    return new Response(responseStream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' } });
}
 