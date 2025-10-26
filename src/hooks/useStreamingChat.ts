/**
 * STREAMING CHAT HOOK
 * 
 * React hook for handling NDJSON streaming with ephemeral status messages.
 * 
 * Features:
 * - Parses NDJSON stream events (message, status, error, meta)
 * - Auto-dismisses ephemeral status messages after timeout
 * - Filters ephemeral messages when sending context to backend
 * - Handles errors and reconnection
 * 
 * Usage:
 *   const { messages, sendMessage, isLoading } = useStreamingChat({
 *     endpoint: '/api/chat-stream',
 *     conversationId
 *   });
 */

import { useState, useCallback, useRef } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isEphemeral?: boolean;
  ephemeralType?: 'status' | 'progress' | 'authorization' | 'error';
  agent?: string;
  autoRemoveMs?: number;
  timestamp: number;
}

export interface StreamEvent {
  type: 'message' | 'status' | 'error' | 'meta' | 'raw';
  payload: any;
}

export interface UseStreamingChatOptions {
  endpoint: string;
  conversationId: string;
  userId?: string;
  onError?: (error: Error) => void;
  onStatusChange?: (isLoading: boolean) => void;
}

export interface UseStreamingChatResult {
  messages: ChatMessage[];
  sendMessage: (content: string) => Promise<void>;
  isLoading: boolean;
  clearMessages: () => void;
}

export function useStreamingChat(options: UseStreamingChatOptions): UseStreamingChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoRemoveTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Schedule auto-removal of ephemeral messages
  const scheduleAutoRemove = useCallback((messageId: string, timeoutMs: number) => {
    // Clear existing timer if any
    const existingTimer = autoRemoveTimersRef.current.get(messageId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new timer
    const timer = setTimeout(() => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      autoRemoveTimersRef.current.delete(messageId);
    }, timeoutMs);

    autoRemoveTimersRef.current.set(messageId, timer);
  }, []);

  // Add a message to the chat
  const addMessage = useCallback((message: Partial<ChatMessage>) => {
    const fullMessage: ChatMessage = {
      id: message.id || `msg-${Date.now()}-${Math.random()}`,
      role: message.role || 'assistant',
      content: message.content || '',
      timestamp: message.timestamp || Date.now(),
      isEphemeral: message.isEphemeral,
      ephemeralType: message.ephemeralType,
      agent: message.agent,
      autoRemoveMs: message.autoRemoveMs
    };

    setMessages(prev => [...prev, fullMessage]);

    // Schedule auto-removal if ephemeral
    if (fullMessage.isEphemeral && fullMessage.autoRemoveMs) {
      scheduleAutoRemove(fullMessage.id, fullMessage.autoRemoveMs);
    }

    return fullMessage;
  }, [scheduleAutoRemove]);

  // Handle different event types from stream
  const handleStreamEvent = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case 'status':
        addMessage({
          content: event.payload.text || JSON.stringify(event.payload),
          isEphemeral: true,
          ephemeralType: 'status',
          agent: event.payload.agent,
          autoRemoveMs: event.payload.autoRemoveMs || 5000
        });
        break;

      case 'message':
        addMessage({
          content: event.payload.content || JSON.stringify(event.payload),
          isEphemeral: false
        });
        break;

      case 'error':
        addMessage({
          content: event.payload.message || String(event.payload),
          isEphemeral: true,
          ephemeralType: 'error',
          autoRemoveMs: 10000 // Errors stay longer
        });
        break;

      case 'meta':
        // Meta events are internal - log but don't display
        console.log('[StreamingChat] Meta event:', event.payload);
        break;

      case 'raw':
        // Raw fallback - only show if it's not empty
        if (event.payload && String(event.payload).trim()) {
          addMessage({
            content: String(event.payload),
            isEphemeral: false
          });
        }
        break;

      default:
        console.warn('[StreamingChat] Unknown event type:', event.type);
    }
  }, [addMessage]);

  // Send a message and handle streaming response
  const sendMessage = useCallback(async (content: string) => {
    if (isLoading || !content.trim()) return;

    // Add user message
    const userMessage = addMessage({
      role: 'user',
      content: content.trim(),
      isEphemeral: false
    });

    setIsLoading(true);
    options.onStatusChange?.(true);

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      // Get non-ephemeral messages for context
      const contextMessages = messages
        .filter(m => !m.isEphemeral)
        .map(m => ({
          role: m.role,
          content: m.content
        }));

      // Make streaming request
      const response = await fetch(options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content.trim(),
          conversationId: options.conversationId,
          userId: options.userId,
          messages: contextMessages
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Parse NDJSON stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event: StreamEvent = JSON.parse(line);
            handleStreamEvent(event);
          } catch (e) {
            console.warn('[StreamingChat] Failed to parse event:', line, e);
            // Try to display as raw text if it's not empty
            if (line.trim()) {
              handleStreamEvent({ type: 'raw', payload: line });
            }
          }
        }
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[StreamingChat] Request aborted');
        return;
      }

      console.error('[StreamingChat] Error:', error);
      options.onError?.(error);

      addMessage({
        content: `Error: ${error.message || 'Failed to get response'}`,
        isEphemeral: true,
        ephemeralType: 'error',
        autoRemoveMs: 10000
      });
    } finally {
      setIsLoading(false);
      options.onStatusChange?.(false);
      abortControllerRef.current = null;
    }
  }, [messages, isLoading, options, addMessage, handleStreamEvent]);

  // Clear all messages
  const clearMessages = useCallback(() => {
    // Clear all auto-remove timers
    autoRemoveTimersRef.current.forEach(timer => clearTimeout(timer));
    autoRemoveTimersRef.current.clear();
    
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    clearMessages
  };
}
