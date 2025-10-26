import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
});

export const simpleAgent = async (message: string) => {
  try {
    console.log('[simpleAgent] Processing message:', message);
    
    const systemPrompt = `You are a helpful grocery shopping assistant. When users ask about products, provide helpful information. Keep responses concise and helpful.`;
    
    const response = await llm.invoke([
      new HumanMessage(`System: ${systemPrompt}\n\nUser: ${message}`)
    ]);
    
    console.log('[simpleAgent] Response generated successfully');
    return response.content;
    
  } catch (error) {
    console.error('[simpleAgent] Error:', error);
    throw error;
  }
};
