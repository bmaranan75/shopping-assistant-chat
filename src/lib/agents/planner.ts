import LangGraphClient from './langgraphClient';

// LangGraph server configuration
const LANGGRAPH_SERVER_URL = process.env.LANGGRAPH_SERVER_URL || 'http://localhost:2024';
const langGraphClient = new LangGraphClient(LANGGRAPH_SERVER_URL);

export async function getPlannerMetrics() {
  try {
    // Call the planner metrics endpoint on LangGraph server
    const response = await fetch(`${LANGGRAPH_SERVER_URL}/metrics/planner`);
    if (response.ok) {
      return await response.json();
    }
    return { error: 'Failed to fetch planner metrics' };
  } catch (error) {
    console.error('[Planner Metrics] Error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}