import LangGraphClient from './langgraphClient';

// LangGraph server configuration
const LANGGRAPH_SERVER_URL = process.env.LANGGRAPH_SERVER_URL || 'http://localhost:2024';
const langGraphClient = new LangGraphClient(LANGGRAPH_SERVER_URL);

// Create a graph-like object that connects to LangGraph server
function createAgentGraph(agentId: string) {
  return {
    async stream(input: any, config?: any) {
      const userId = config?.configurable?._credentials?.user?.sub || 'default-user';
      const conversationId = input.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const message = input.messages?.[0]?.content || input.input || '';
      
      try {
        const result = await langGraphClient.callAgentWithStream({
          agentId,
          message,
          userId,
          conversationId
        });

        // Create a readable stream that yields the result
        const encoder = new TextEncoder();
        
        return new ReadableStream({
          start(controller) {
            try {
              // Stream the content
              if (result.content) {
                controller.enqueue(encoder.encode(JSON.stringify({ 
                  type: 'message', 
                  payload: { content: result.content } 
                }) + '\n'));
              }
              
              controller.close();
            } catch (error) {
              controller.enqueue(encoder.encode(JSON.stringify({ 
                type: 'error', 
                payload: { message: error instanceof Error ? error.message : 'Unknown error' } 
              }) + '\n'));
              controller.close();
            }
          }
        });
      } catch (error) {
        // Return an error stream
        const encoder = new TextEncoder();
        return new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify({ 
              type: 'error', 
              payload: { message: error instanceof Error ? error.message : 'Failed to connect to LangGraph server' } 
            }) + '\n'));
            controller.close();
          }
        });
      }
    }
  };
}

export const paymentGraph = createAgentGraph('payment');
export const createPaymentAgent = () => paymentGraph;