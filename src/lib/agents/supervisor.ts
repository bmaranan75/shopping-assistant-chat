import { Client } from '@langchain/langgraph-sdk';

// LangGraph server configuration
const LANGGRAPH_SERVER_URL = process.env.LANGGRAPH_SERVER_URL || 'http://localhost:2024';
const langGraphClient = new Client({ apiUrl: LANGGRAPH_SERVER_URL });

console.log(`[Supervisor] Initialized LangGraph client with URL: ${LANGGRAPH_SERVER_URL}`);

// Thread cache to persist threads per conversation
const threadCache = new Map<string, string>();

export interface SupervisorAgent {
  stream: (message: string, conversationId?: string) => Promise<AsyncIterable<any>>;
}

// Function to clear thread cache for a specific conversation or all conversations
export function clearConversationThread(conversationId?: string) {
  if (conversationId) {
    threadCache.delete(conversationId);
    console.log(`[Supervisor] Cleared thread cache for conversation: ${conversationId}`);
  } else {
    threadCache.clear();
    console.log(`[Supervisor] Cleared all thread cache`);
  }
}

export function createSupervisorAgent(userId: string, conversationId?: string): SupervisorAgent {
  return {
    async stream(message: string, convId?: string): Promise<AsyncIterable<any>> {
      const finalConversationId = convId || conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`[Supervisor] Creating stream for user: ${userId}, conversation: ${finalConversationId}, message: ${message}`);
      
      // Return an async generator that yields chunks in the format expected by the chat API
      return (async function* () {
        try {
          // Get or create a thread for this conversation
          let threadId = threadCache.get(finalConversationId);
          
          if (!threadId) {
            // Create a new thread for this conversation
            console.log(`[Supervisor] Creating new thread for conversation: ${finalConversationId}`);
            const thread = await langGraphClient.threads.create({
              metadata: { 
                conversationId: finalConversationId, 
                userId, 
                agentId: 'supervisor',
                createdAt: new Date().toISOString() 
              }
            });
            
            threadId = thread.thread_id;
            threadCache.set(finalConversationId, threadId);
            console.log(`[Supervisor] Created new thread: ${threadId} for conversation: ${finalConversationId}`);
          } else {
            console.log(`[Supervisor] Reusing existing thread: ${threadId} for conversation: ${finalConversationId}`);
          }

          // Prepare the input for the supervisor agent
          const input = {
            messages: [{ role: 'human', content: message }],
            userId,
            conversationId: finalConversationId
          };

          console.log(`[Supervisor] Sending input to LangGraph:`, JSON.stringify(input, null, 2));

          // Stream the response using the official SDK
          const stream = langGraphClient.runs.stream(
            threadId,
            'supervisor', // assistant_id
            {
              input,
              config: {
                configurable: {
                  _credentials: { user: { sub: userId } }
                }
              },
              streamMode: 'values' // Changed back to 'values' - updates only shows planner, need full state
            }
          );
          
          console.log(`[Supervisor] Stream started for thread: ${threadId}`);

          // Process the stream and yield chunks in the expected format
          for await (const chunk of stream) {
            console.log(`[Supervisor] Received chunk:`, JSON.stringify(chunk, null, 2));
            
            try {
              // Handle different types of chunks from LangGraph
              if (chunk.event === 'values' && chunk.data) {
                const data = chunk.data as any;
                
                console.log(`[Supervisor] Values chunk:`, JSON.stringify(data, null, 2));
                
                // Log workflow execution details and state
                console.log(`[Supervisor] Workflow State Analysis:`);
                console.log(`  - next: ${data.next || 'undefined'}`);
                console.log(`  - workflowContext: ${data.workflowContext || 'undefined'}`);
                console.log(`  - plannerRecommendation:`, data.plannerRecommendation);
                console.log(`  - pendingProduct:`, data.pendingProduct);
                console.log(`  - dealData:`, data.dealData);
                
                if (data.next) {
                  console.log(`[Supervisor] ✅ Workflow routing to: ${data.next}`);
                } else {
                  console.log(`[Supervisor] ❌ No workflow routing - this indicates the supervisor is not delegating to target agents`);
                  
                  // Check if we have a planner recommendation that should trigger delegation
                  if (data.plannerRecommendation?.action === 'delegate') {
                    console.log(`[Supervisor] 🚨 ISSUE: Planner recommended delegation but supervisor is not routing to target agent`);
                    console.log(`[Supervisor] 🚨 This suggests a workflow configuration issue in the LangGraph server`);
                  }
                }
                
                if (data.messages && Array.isArray(data.messages)) {
                  console.log(`[Supervisor] Current message count: ${data.messages.length}`);
                  
                  // Look for the most recent agent responses (not just planner coordination)
                  const recentMessages = data.messages.slice(-5); // Last 5 messages
                  recentMessages.forEach((msg: any, idx: number) => {
                    const content = msg.message?.content || msg.content || '';
                    console.log(`[Supervisor] Recent Message ${idx}: agent=${msg.agent}, role=${msg.role}, content="${content.substring(0, 100)}"`);
                  });
                }
                
                // The LangGraph SDK streams values chunks where data contains the graph state
                // We need to yield chunks in the format expected by the chat API: { nodeName: nodeOutput }
                
                // Since we're using the supervisor agent, all chunks should be keyed as 'supervisor'
                // The chat API expects to find messages, next, workflowContext, etc. in the supervisor output
                yield { supervisor: data };
                
              } else if (chunk.event === 'metadata') {
                console.log(`[Supervisor] Metadata event:`, chunk.data);
                // Can yield metadata chunks if needed
                yield { metadata: chunk.data };
              } else if (chunk.event === 'error') {
                console.error(`[Supervisor] LangGraph error event:`, chunk.data);
                // Yield an error chunk
                yield { error: chunk.data };
              } else {
                console.log(`[Supervisor] Unknown chunk event: ${chunk.event}`, chunk);
              }
            } catch (chunkError) {
              console.warn(`[Supervisor] Error processing chunk:`, chunkError);
              console.warn(`[Supervisor] Problematic chunk:`, JSON.stringify(chunk, null, 2));
            }
          }

        } catch (error) {
          console.error('[Supervisor] Stream error:', error);
          // Yield an error chunk
          yield { 
            error: { 
              message: error instanceof Error ? error.message : 'Streaming error',
              details: error instanceof Error ? error.stack : undefined
            } 
          };
        }
        
        console.log(`[Supervisor] Stream completed`);
      })();
    }
  };
}export function compileSupervisorWorkflow() {
  // This function is for backward compatibility
  // In the LangGraph server architecture, the workflow is compiled on the server side
  return {
    stream: async (input: any, config?: any) => {
      const userId = config?.configurable?._credentials?.user?.sub || 'default-user';
      const conversationId = input.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const message = input.messages?.[0]?.content || input.input || '';
      
      const agent = createSupervisorAgent(userId, conversationId);
      return agent.stream(message, conversationId);
    }
  };
}

// Export for pushover notifications - placeholder implementation
export async function sendPushoverNotification(message: string, userId?: string) {
  console.log(`[Pushover] Would send notification: ${message} (userId: ${userId})`);
  // TODO: Implement actual pushover notification if needed
  return { success: true, message: 'Notification sent' };
}