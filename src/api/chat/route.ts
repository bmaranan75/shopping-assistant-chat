import { NextRequest, NextResponse } from 'next/server';
import { HumanMessage } from '@langchain/core/messages';
import { createAgent } from '@/lib/multi-agent';
import { getUser } from '@/lib/auth0';
import { getAuthorizationState, resetAuthorizationState } from '@/lib/auth0-ai-langchain';
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
                // Get the last non-ephemeral, non-user message
                const finalMessages = allMessages.filter((m: any) => {
                  const isEphemeral = m.progress?.isProgressUpdate && m.progress?.ephemeral;
                  const isUser = m.role === 'user';
                  return !isEphemeral && !isUser;
                });
                
                console.log("[chat-api] Filtered final messages count:", finalMessages.length);
                
                const lastMessage = finalMessages[finalMessages.length - 1];
                
                if (lastMessage) {
                  console.log("[chat-api] Last message role:", lastMessage.role, "agent:", lastMessage.agent);
                  
                  // Handle AnnotatedMessage structure
                  const unwrapped = lastMessage.message || lastMessage;
                  
                  // Extract content from various possible shapes
                  if (typeof unwrapped === 'string') {
                    finalResponse = unwrapped;
                  } else if (typeof unwrapped.content === 'string') {
                    finalResponse = unwrapped.content;
                  } else if (unwrapped.content && Array.isArray(unwrapped.content)) {
                    // Handle array content (some LangChain messages use this)
                    finalResponse = unwrapped.content.map((c: any) => 
                      typeof c === 'string' ? c : c.text || JSON.stringify(c)
                    ).join('');
                  } else if (unwrapped.text) {
                    finalResponse = unwrapped.text;
                  } else {
                    finalResponse = String(unwrapped.content || unwrapped);
                  }
                  
                  console.log("[chat-api] Extracted content:", finalResponse.substring(0, 100));
                }
              } else {
                console.log("[chat-api] No messages found in latest state");
              }
            } else {
              console.log("[chat-api] No latest state available");
            }
            
            console.log("[chat-api] Final response extracted:", finalResponse);
            
            // Get authorization state after processing
            const authState = getAuthorizationState();
            
            // Send final message
            sendSSE({
              type: 'message',
              content: finalResponse || "I'm sorry, I couldn't process that request.",
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
