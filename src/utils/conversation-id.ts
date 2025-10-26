/**
 * Conversation ID utility for managing chat instances
 * Generates unique conversation IDs to maintain context across agent interactions
 */

import { nanoid } from './nano-id';

/**
 * Generates a new conversation ID
 * Format: conv_[timestamp]_[random] for easy identification and uniqueness
 */
export function generateConversationId(): string {
  const timestamp = Date.now().toString(36);
  const random = nanoid(8);
  return `conv_${timestamp}_${random}`;
}

/**
 * Validates if a string is a valid conversation ID format
 */
export function isValidConversationId(id: string): boolean {
  return /^conv_[a-z0-9]+_[a-z0-9]{8}$/.test(id);
}

/**
 * Extracts timestamp from conversation ID for debugging/analytics
 */
export function getConversationTimestamp(conversationId: string): Date | null {
  try {
    const match = conversationId.match(/^conv_([a-z0-9]+)_/);
    if (match) {
      const timestamp = parseInt(match[1], 36);
      return new Date(timestamp);
    }
  } catch (error) {
    console.warn('Invalid conversation ID format:', conversationId);
  }
  return null;
}