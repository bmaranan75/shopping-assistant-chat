import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP tool definitions that map to our LangGraph agents
 * These are exposed to MCP clients (Claude Desktop, etc.)
 */
export const mcpTools: Tool[] = [
  {
    name: 'search_products',
    description: 'Search the Safeway product catalog for items. Returns product details including name, price, and availability.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term (e.g., "milk", "organic apples")'
        },
        category: {
          type: 'string',
          description: 'Optional product category filter'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
          default: 10
        }
      },
      required: ['query']
    }
  },
  {
    name: 'add_to_cart',
    description: 'Add a product to the shopping cart',
    inputSchema: {
      type: 'object',
      properties: {
        productCode: {
          type: 'string',
          description: 'The product code/SKU to add'
        },
        quantity: {
          type: 'number',
          description: 'Quantity to add',
          default: 1
        }
      },
      required: ['productCode']
    }
  },
  {
    name: 'view_cart',
    description: 'View current shopping cart contents',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'checkout',
    description: 'Complete checkout with CIBA (Client Initiated Backchannel Authentication) authorization',
    inputSchema: {
      type: 'object',
      properties: {
        cartSummary: {
          type: 'string',
          description: 'Summary of cart contents for authorization'
        }
      }
    }
  },
  {
    name: 'add_payment_method',
    description: 'Add a new payment method with authorization',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['credit_card', 'debit_card', 'bank_account', 'paypal'],
          description: 'Type of payment method'
        }
      },
      required: ['type']
    }
  },
  {
    name: 'get_deals',
    description: 'Get current deals and promotions available at Safeway',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional category filter for deals'
        }
      }
    }
  }
];
