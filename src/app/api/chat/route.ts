import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { createAgent } from '@/lib/multi-agent';
import { getUser } from '@/lib/auth0';
// Temporarily use fallback due to @auth0/ai-langchain build issues
import { getAuthorizationState, resetAuthorizationState } from '@/lib/auth0-ai-langchain-fallback';
import { InMemoryCache } from "@langchain/core/caches";
import { LangChainTracer } from "langchain/callbacks";

// Configure runtime for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds timeout

// Initialize tracing
if (process.env.LANGCHAIN_TRACING_V2 === 'true') {
  const tracer = new LangChainTracer({
    projectName: "Auth0 GenAI Next.js LangChain",
  });
}

const cache = new InMemoryCache();

export async function POST(req: NextRequest) {
  try {
    // Add CORS headers for better browser compatibility
    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    };

    const body = await req.json();
    const { messages, conversationId } = body;
    
    console.log(`[chat-api] Received request with conversationId: ${conversationId}`);
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({
        message: "Hello! I'm your shopping assistant. How can I help you today?"
      }, { headers });
    }

    // Get the last message from the user
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || !lastMessage.content) {
      return NextResponse.json({
        message: "I didn't receive a message. Please try again."
      }, { headers });
    }

    try {
      let userId = null;
      // Get the authenticated user for Auth0 AI context
      const user = await getUser();
      userId = user?.sub;
      console.log("[chat-api] User context:", user?.sub);
      console.log("[chat-api] User message:", lastMessage.content);
      
      // Reset authorization state before processing
      resetAuthorizationState();
      
      // Create a new multi-agent instance with the userId and conversationId for each request
      // This uses the supervisor agent to route to specialized agents
      const agent = createAgent(userId ?? '', conversationId);

      // Use streaming for real-time progress updates
      console.log("[chat-api] Starting streaming response for user:", userId);
      
      // Create a ReadableStream for SSE (Server-Sent Events)
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          
          // Helper to send SSE data
          const sendSSE = (data: any) => {
            const message = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          };
          
          try {
            // Use streaming API - SupervisorAgent.stream() returns an async iterator
            const streamIterator = await agent.stream(lastMessage.content, conversationId);
            
            // Track all messages to get final response
            let latestState: any = null;
            let finalResponse = '';
            
            // Track which progress messages have already been sent (by timestamp)
            // This prevents sending duplicate progress updates when subsequent chunks
            // contain the full message history
            const sentProgressTimestamps = new Set<number>();
            
            // Track workflow context to only emit metadata when it changes
            let previousWorkflowContext: string | null = null;
            
            // Process stream events
            for await (const chunk of streamIterator) {
              console.log("[chat-api] Stream chunk keys:", Object.keys(chunk));
              
              // Store the latest state from the stream
              latestState = chunk;
              
              // Extract metadata for dev tools
              for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
                if (nodeOutput && typeof nodeOutput === 'object') {
                  // Check for planner recommendation
                  if ((nodeOutput as any).plannerRecommendation) {
                    sendSSE({
                      type: 'metadata',
                      payload: {
                        type: 'planner_recommendation',
                        data: (nodeOutput as any).plannerRecommendation,
                        timestamp: Date.now()
                      }
                    });
                  }
                  
                  // Check for supervisor decision (routing)
                  if ((nodeOutput as any).next && (nodeOutput as any).next !== '__end__') {
                    sendSSE({
                      type: 'metadata',
                      payload: {
                        type: 'supervisor_decision',
                        data: {
                          targetAgent: (nodeOutput as any).next,
                          workflowContext: (nodeOutput as any).workflowContext,
                          dealData: (nodeOutput as any).dealData ? 'present' : null,
                          pendingProduct: (nodeOutput as any).pendingProduct ? 'present' : null,
                          cartData: (nodeOutput as any).cartData ? 'present' : null
                        },
                        timestamp: Date.now()
                      }
                    });
                  }
                  
                  // Check for workflow context changes - ONLY emit if it changed
                  const currentWorkflowContext = (nodeOutput as any).workflowContext;
                  if (currentWorkflowContext && currentWorkflowContext !== previousWorkflowContext) {
                    sendSSE({
                      type: 'metadata',
                      payload: {
                        type: 'workflow_context',
                        data: {
                          context: currentWorkflowContext,
                          dealData: (nodeOutput as any).dealData ? 'present' : null,
                          pendingProduct: (nodeOutput as any).pendingProduct ? 'present' : null
                        },
                        timestamp: Date.now()
                      }
                    });
                    previousWorkflowContext = currentWorkflowContext;
                    console.log(`[chat-api] Workflow context changed to: ${currentWorkflowContext}`);
                  }
                }
              }
              
              // LangGraph streams emit chunks with node names as keys
              // e.g., { supervisor: { messages: [...], next: 'catalog', ... } }
              // Extract messages from any node in the chunk
              for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
                if (nodeOutput && typeof nodeOutput === 'object') {
                  const messages = (nodeOutput as any).messages;
                  
                  if (messages && Array.isArray(messages)) {
                    console.log(`[chat-api] Node '${nodeName}' emitted ${messages.length} messages`);
                    
                    // Check each message for progress updates
                    for (const msg of messages) {
                      if (msg && msg.progress?.isProgressUpdate && msg.progress?.ephemeral) {
                        // Only send if we haven't sent this message before (check by timestamp)
                        if (!sentProgressTimestamps.has(msg.timestamp)) {
                          // Send progress update to client
                          const progressContent = typeof msg.message?.content === 'string' 
                            ? msg.message.content 
                            : String(msg.message?.content || '');
                          
                          sendSSE({
                            type: 'progress',
                            content: progressContent,
                            agent: msg.agent || nodeName,
                            timestamp: msg.timestamp
                          });
                          
                          // Mark this message as sent
                          sentProgressTimestamps.add(msg.timestamp);
                          console.log("[chat-api] Sent progress update:", progressContent, "at", msg.timestamp);
                        } else {
                          console.log("[chat-api] Skipping duplicate progress update:", msg.message?.content);
                        }
                      }
                    }
                  }
                }
              }
            }
            
            // Extract final response after stream completes
            console.log("[chat-api] Stream completed, extracting final response from latest state");
            
            if (latestState) {
              // LangGraph stream chunks are keyed by node name
              // Look through all nodes to find messages
              let allMessages: any[] = [];
              
              for (const [nodeName, nodeOutput] of Object.entries(latestState)) {
                if (nodeOutput && typeof nodeOutput === 'object') {
                  const messages = (nodeOutput as any).messages;
                  if (messages && Array.isArray(messages)) {
                    console.log(`[chat-api] Found ${messages.length} messages from node '${nodeName}'`);
                    allMessages = messages; // Use the last node's messages as the final state
                  }
                }
              }
              
              if (allMessages.length > 0) {
                // Debug: Log all messages to understand what we're working with
                console.log("[chat-api] Analyzing all messages:");
                allMessages.forEach((msg, idx) => {
                  const content = msg.message?.content || msg.content || '';
                  console.log(`[chat-api] Message ${idx}: agent=${msg.agent}, role=${msg.role}, ephemeral=${msg.progress?.ephemeral}, content="${content.substring(0, 100)}"`);
                });
                
                // Get messages that are substantial user-facing responses, excluding coordination and progress messages
                const finalMessages = allMessages.filter((m: any) => {
                  const isEphemeral = m.progress?.isProgressUpdate && m.progress?.ephemeral;
                  const isUser = m.role === 'user';
                  
                  // Skip ephemeral and user messages
                  if (isEphemeral || isUser) {
                    return false;
                  }
                  
                  const content = m.message?.content || m.content || '';
                  
                  // Skip empty content
                  if (!content || typeof content !== 'string' || !content.trim()) {
                    return false;
                  }
                  
                  // Skip planner JSON coordination messages
                  if (m.agent === 'planner' && content.trim().startsWith('{')) {
                    try {
                      const parsed = JSON.parse(content);
                      if (parsed.action && parsed.confidence !== undefined) {
                        console.log("[chat-api] Skipping planner coordination message:", content);
                        return false;
                      }
                    } catch (e) {
                      // Not JSON, continue
                    }
                  }
                  
                  // Skip short status/progress messages (emojis + brief text)
                  if (content.match(/^[🔄🏷️✅🛒🎯📦⚡️💰🎁]\s.*/) && content.length < 50) {
                    console.log("[chat-api] Skipping short status message:", content);
                    return false;
                  }
                  
                  // This should be a substantial message
                  console.log("[chat-api] Including message from", m.agent, ":", content.substring(0, 50));
                  return true;
                });
                
                console.log("[chat-api] Filtered final messages count:", finalMessages.length);
                
                // Prioritize messages from specialized agents over supervisor messages
                let lastMessage = null;
                if (finalMessages.length > 0) {
                  // First, look for messages from specialized agents (deals, catalog, cart, payment)
                  const specializedAgentMessages = finalMessages.filter(m => 
                    m.agent && ['deals', 'catalog', 'cart', 'payment', 'checkout'].includes(m.agent)
                  );
                  
                  if (specializedAgentMessages.length > 0) {
                    lastMessage = specializedAgentMessages[specializedAgentMessages.length - 1];
                    console.log(`[chat-api] Using specialized agent message from ${lastMessage.agent}`);
                  } else {
                    // Fall back to any final message
                    lastMessage = finalMessages[finalMessages.length - 1];
                    console.log(`[chat-api] Using general message from ${lastMessage?.agent || 'unknown'}`);
                  }
                }
                
                // If no valid message found, look for the last non-planner, non-ephemeral agent message specifically
                if (!lastMessage) {
                  console.log("[chat-api] No final message found after filtering, looking for agent responses...");
                  for (let i = allMessages.length - 1; i >= 0; i--) {
                    const msg = allMessages[i];
                    
                    // Skip user messages and planner messages
                    if (msg.role === 'user' || msg.agent === 'planner') {
                      continue;
                    }
                    
                    // Skip ephemeral progress messages
                    if (msg.progress?.isProgressUpdate && msg.progress?.ephemeral) {
                      continue;
                    }
                    
                    const content = msg.message?.content || msg.content || '';
                    
                    // Skip empty content and JSON coordination messages
                    if (!content || typeof content !== 'string' || !content.trim()) {
                      continue;
                    }
                    
                    // Skip JSON coordination messages
                    if (content.trim().startsWith('{')) {
                      try {
                        const parsed = JSON.parse(content);
                        if (parsed.action && parsed.confidence !== undefined) {
                          console.log(`[chat-api] Skipping JSON coordination from ${msg.agent}:`, content);
                          continue;
                        }
                      } catch (e) {
                        // Not JSON, continue checking
                      }
                    }
                    
                    // Skip status/progress messages (emojis + short text patterns)
                    if (content.match(/^[🔄🏷️✅🛒🎯📦⚡️💰🎁]\s.*/) && content.length < 50) {
                      console.log(`[chat-api] Skipping status message from ${msg.agent}:`, content);
                      continue;
                    }
                    
                    // This should be a substantial user-facing message
                    console.log(`[chat-api] Found agent response from ${msg.agent}:`, content.substring(0, 100));
                    lastMessage = msg;
                    break;
                  }
                }
                
                if (lastMessage) {
                  console.log("[chat-api] Last message role:", lastMessage.role, "agent:", lastMessage.agent);
                  
                  // Handle AnnotatedMessage structure
                  const unwrapped = lastMessage.message || lastMessage;
                  
                  // Extract content from various possible shapes
                  let extractedContent = '';
                  if (typeof unwrapped === 'string') {
                    extractedContent = unwrapped;
                  } else if (typeof unwrapped.content === 'string') {
                    extractedContent = unwrapped.content;
                  } else if (unwrapped.content && Array.isArray(unwrapped.content)) {
                    // Handle array content (some LangChain messages use this)
                    extractedContent = unwrapped.content.map((c: any) => 
                      typeof c === 'string' ? c : c.text || JSON.stringify(c)
                    ).join('');
                  } else if (unwrapped.text) {
                    extractedContent = unwrapped.text;
                  } else {
                    extractedContent = String(unwrapped.content || unwrapped);
                  }
                  
                  // Validate that the extracted content is not a JSON coordination message
                  if (extractedContent && extractedContent.trim().startsWith('{')) {
                    try {
                      const parsed = JSON.parse(extractedContent);
                      if (parsed.action && parsed.confidence !== undefined) {
                        console.log("[chat-api] Detected planner JSON in final response, discarding:", extractedContent);
                        extractedContent = ''; // Discard this JSON coordination message
                      }
                    } catch (e) {
                      // Not JSON, use as-is
                    }
                  }
                  
                  if (extractedContent) {
                    finalResponse = extractedContent;
                    console.log("[chat-api] Extracted content:", finalResponse.substring(0, 100));
                  } else {
                    console.log("[chat-api] No valid content extracted from message");
                  }
                }
              } else {
                console.log("[chat-api] No messages found in latest state");
              }
            } else {
              console.log("[chat-api] No latest state available");
            }
            
            console.log("[chat-api] Final response extracted:", finalResponse);
            
            // If we still don't have a response, provide a helpful fallback
            if (!finalResponse || finalResponse.trim().length === 0) {
              console.log("[chat-api] No valid response found, using fallback message");
              finalResponse = "I'm processing your request. Please let me know if you need help with products, deals, or your shopping cart.";
            }
            
            // Get authorization state after processing
            const authState = getAuthorizationState();
            
            // Send final message
            sendSSE({
              type: 'message',
              content: finalResponse,
              authorizationStatus: authState.status !== 'idle' ? authState.status : undefined,
              authorizationMessage: authState.message || undefined,
              timestamp: Date.now()
            });
            
            // Send done signal
            sendSSE({ type: 'done' });
            
          } catch (error) {
            console.error('[chat-api] Stream error:', error);
            
            // Send error to client
            sendSSE({
              type: 'error',
              content: error instanceof Error && error.message === 'Request timeout'
                ? "I apologize, but your request is taking longer than expected. Please try asking for something more specific or try again later."
                : "I'm your shopping assistant! I can help you with product recommendations and shopping. What would you like to do today?",
              timestamp: Date.now()
            });
            
            sendSSE({ type: 'done' });
          } finally {
            controller.close();
          }
        }
      });
      
      // Return streaming response
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Connection': 'keep-alive',
        },
      });
      
    } catch (agentError) {
      console.error('Agent error:', agentError);
      
      // Handle timeout specifically
      if (agentError instanceof Error && agentError.message === 'Request timeout') {
        return NextResponse.json({
          message: "I apologize, but your request is taking longer than expected. Please try asking for something more specific or try again later.",
          error: "Request timeout"
        }, { headers });
      }
      
      // Check if it's a recursion error
      if (agentError && typeof agentError === 'object' && 'lc_error_code' in agentError) {
        if (agentError.lc_error_code === 'GRAPH_RECURSION_LIMIT') {
          console.error('GraphRecursionError detected. The agent may be stuck in a loop.');
          return NextResponse.json({
            message: "I apologize, but I encountered an issue processing your request. Please try rephrasing your question or ask for something more specific.",
            error: "Request too complex - please simplify"
          }, { headers });
        }
      }
      
      return NextResponse.json({
        message: "I'm your shopping assistant! I can help you with product recommendations and shopping. What would you like to do today?"
      }, { headers });
    }
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "LangChain Agent Ready",
    message: "Direct LangChain integration active - no LangGraph server needed",
    runtime: "serverless",
    deployment: "vercel-compatible"
  });
}
