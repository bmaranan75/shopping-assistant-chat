/**
 * Multi-Agent System Client
 * 
 * This file provides client-side interfaces to externally deployed agents.
 * All agents are deployed separately on the LangGraph server.
 * 
 * Legacy compatibility maintained for existing API routes.
 */

import LangGraphClient from './agents/langgraphClient';

// Get configured LangGraph client for external agents
const getLangGraphClient = () => new LangGraphClient(
  process.env.LANGGRAPH_SERVER_URL || 'http://localhost:2024'
);

/**
 * Legacy compatibility: Create a simple agent interface
 * Routes to external supervisor agent
 */
export const createAgent = (userId: string, conversationId?: string) => {
  const client = getLangGraphClient();
  
  return {
    async invoke(input: any) {
      return client.callAgentWithStream({
        agentId: 'supervisor',
        message: input.messages?.[0]?.content || input.input || '',
        userId: userId || 'default-user',
        conversationId: conversationId || `conv_${Date.now()}`
      });
    },
    async stream(input: any) {
      return client.streamAgentResponse({
        agentId: 'supervisor',
        message: input.messages?.[0]?.content || input.input || '',
        userId: userId || 'default-user',
        conversationId: conversationId || `conv_${Date.now()}`
      });
    }
  };
};

/**
 * Legacy compatibility: Main graph interface
 * Routes to external supervisor agent
 */
export const graph = {
  async invoke(input: any) {
    const client = getLangGraphClient();
    return client.callAgentWithStream({
      agentId: 'supervisor',
      message: input.messages?.[0]?.content || input.input || '',
      userId: 'default-user',
      conversationId: `conv_${Date.now()}`
    });
  },
  async stream(input: any) {
    const client = getLangGraphClient();
    return client.streamAgentResponse({
      agentId: 'supervisor',
      message: input.messages?.[0]?.content || input.input || '',
      userId: 'default-user',
      conversationId: `conv_${Date.now()}`
    });
  }
};

// Export client factory for direct external agent access
export const getExternalAgentClient = () => getLangGraphClient();