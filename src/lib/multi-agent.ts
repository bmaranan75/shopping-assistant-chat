// Backward compatibility export for existing API routes
// This file maintains the existing API while using the new multi-agent system

import { createSupervisorAgent, compileSupervisorWorkflow } from './agents/supervisor';

// Export the createAgent function for backward compatibility
export const createAgent = (userId: string, conversationId?: string) =>
  createSupervisorAgent(userId, conversationId);

// Export the supervisor graph as the main graph for existing uses by compiling
// a default graph instance. Callers who need per-instance checkpointers should
// use compileSupervisorWorkflow directly.
export const graph = compileSupervisorWorkflow();

// Also export individual agents for direct access if needed
export { createCatalogAgent, createCatalogCartAgent } from './agents/catalog-agent';
export { createCartAndCheckoutAgent } from './agents/cart-and-checkout-agent';
export { createPaymentAgent } from './agents/payment-agent';
export { createSupervisorAgent } from './agents/supervisor';