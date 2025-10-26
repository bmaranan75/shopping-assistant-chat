'use client';

import { useState, useEffect, useRef } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowUpIcon, LoaderCircle, MessageSquarePlus, Code2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { generateConversationId } from '@/utils/conversation-id';
import { DevMetadata, type MetadataEvent } from '@/components/dev-metadata';

interface LangChainMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isEphemeral?: boolean;
  ephemeralType?: 'authorization-request' | 'authorization-approved' | 'authorization-denied' | 'authorization-pending';
}


function ChatInput(props: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  loading?: boolean;
  placeholder?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        e.preventDefault();
        props.onSubmit(e);
      }}
      className="flex w-full flex-col p-4"
    >
      <div className="border border-input bg-background rounded-lg flex flex-col gap-2 max-w-[768px] w-full mx-auto">
        <input
          value={props.value}
          placeholder={props.placeholder}
          onChange={props.onChange}
          className="border-none outline-none bg-transparent p-4 text-foreground placeholder:text-muted-foreground"
        />

        <div className="flex justify-between ml-4 mr-2 mb-2">
          <div className="flex gap-3"></div>

          <Button
            className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
            type="submit"
            disabled={props.loading}
          >
            {props.loading ? <LoaderCircle className="animate-spin" /> : <ArrowUpIcon size={14} />}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function ChatWindow(props: {
  endpoint: string;
  emptyStateComponent: ReactNode;
  placeholder?: string;
  emoji?: string;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<LangChainMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>(''); // NEW: Single status indicator
  const [authorizationMessage, setAuthorizationMessage] = useState<string>(''); // NEW: Dedicated authorization message
  const [isAuthorizationPending, setIsAuthorizationPending] = useState(false); // NEW: Track auth state
  const [conversationId, setConversationId] = useState<string>(() => generateConversationId());
  const [metadataEvents, setMetadataEvents] = useState<MetadataEvent[]>([]); // NEW: Dev metadata
  const [showDevMetadata, setShowDevMetadata] = useState(false); // NEW: Toggle for dev panel
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const authMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track auth message clear timeout
  const isAuthorizationPendingRef = useRef(false); // Ref for closure-safe access
  const hasSeenActiveAuthRef = useRef(false); // Track if we've seen requested/pending/approved status
  const hasAuthorizationMessageRef = useRef(false); // Track if we're showing an auth message
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Helper to update authorization pending state and ref together
  const updateAuthorizationPending = (pending: boolean) => {
    setIsAuthorizationPending(pending);
    isAuthorizationPendingRef.current = pending;
  };

  // Function to add ephemeral messages as part of chat
  const addEphemeralMessage = (type: NonNullable<LangChainMessage['ephemeralType']>, content: string) => {
    const ephemeralMessage: LangChainMessage = {
      id: `ephemeral-${Date.now()}`,
      role: 'system',
      content,
      isEphemeral: true,
      ephemeralType: type,
    };
    setMessages(prev => [...prev, ephemeralMessage]);
    
    // Scroll to bottom after adding ephemeral message
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
    
    // Auto-remove ephemeral messages after 10 seconds (except pending ones)
    if (type !== 'authorization-pending') {
      setTimeout(() => {
        setMessages(prev => prev.filter(msg => msg.id !== ephemeralMessage.id));
      }, 10000);
    }
  };

  // Function to remove specific ephemeral message
  const removeEphemeralMessage = (id: string) => {
    setMessages(prev => prev.filter(msg => msg.id !== id));
  };

  // Function to remove pending authorization messages
  const removePendingAuthMessages = () => {
    setMessages(prev => prev.filter(msg => !(msg.isEphemeral && msg.ephemeralType === 'authorization-pending')));
  };

  // Function to remove completed authorization messages (but keep initial request message)
  const removeCompletedAuthMessages = () => {
    setMessages(prev => prev.filter(msg => !(msg.isEphemeral && ['authorization-pending', 'authorization-approved', 'authorization-denied'].includes(msg.ephemeralType || ''))));
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const scrollToBottom = () => {
      // Try multiple methods to ensure reliable scrolling
      if (messagesEndRef.current) {
        // Method 1: Scroll the target element into view
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
      
      if (chatContainerRef.current) {
        // Method 2: Directly scroll the container (fallback)
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 50);
      }
    };
    
    // Use a small delay to ensure DOM has updated
    const timeoutId = setTimeout(scrollToBottom, 100);
    
    return () => clearTimeout(timeoutId);
  }, [messages]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (authMessageTimeoutRef.current) {
        clearTimeout(authMessageTimeoutRef.current);
      }
    };
  }, []);

  // Function to start polling for authorization status
  const startAuthorizationPolling = () => {
    console.log('[ChatWindow] ========== startAuthorizationPolling CALLED ==========');
    if (pollIntervalRef.current) {
      console.log('[ChatWindow] Clearing existing polling interval');
      clearInterval(pollIntervalRef.current);
    }
    
    // Set authorization pending flag and show status
    updateAuthorizationPending(true);
    setAuthorizationMessage('⏳ Waiting for authorization approval...');
    console.log('[ChatWindow] Starting new polling interval (2 second interval)');
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        console.log('[ChatWindow] Polling is active, checking auth status...');
        const response = await fetch('/api/auth-status', {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        if (response.ok) {
          const data = await response.json();
          
          console.log('[ChatWindow] Auth status poll result:', {
            status: data.authorizationStatus,
            timestamp: data.timestamp,
            pollIntervalActive: pollIntervalRef.current !== null,
            hasSeenActiveAuth: hasSeenActiveAuthRef.current
          });
          
          // Track if we've seen an active authorization state (requested, pending, or approved)
          if (data.authorizationStatus && ['requested', 'pending', 'approved'].includes(data.authorizationStatus)) {
            console.log('[ChatWindow] Active authorization state detected:', data.authorizationStatus);
            hasSeenActiveAuthRef.current = true;
          }
          
          // Only clear message when transitioning from active auth to idle
          // Don't clear if we've never seen an active authorization (prevents premature clearing)
          if ((!data.authorizationStatus || data.authorizationStatus === 'idle') && hasSeenActiveAuthRef.current) {
            console.log('[ChatWindow] ✅✅✅ IDLE STATE DETECTED AFTER ACTIVE AUTH - CLEARING MESSAGE ✅✅✅');
            console.log('[ChatWindow] Authorization completed, clearing message');
            updateAuthorizationPending(false);
            hasSeenActiveAuthRef.current = false; // Reset for next authorization
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
              console.log('[ChatWindow] Polling interval cleared');
            }
            // Clear any existing timeout
            if (authMessageTimeoutRef.current) {
              clearTimeout(authMessageTimeoutRef.current);
              authMessageTimeoutRef.current = null;
            }
            console.log('[ChatWindow] About to call setAuthorizationMessage("")');
            setAuthorizationMessage('');
            console.log('[ChatWindow] setAuthorizationMessage("") called - message should be cleared');
            return;
          } else if (!data.authorizationStatus || data.authorizationStatus === 'idle') {
            // We got idle but haven't seen active auth yet - keep polling
            console.log('[ChatWindow] Idle state detected but no active auth seen yet, continuing to poll...');
            return;
          }
          
          if (data.authorizationStatus === 'approved') {
            console.log('[ChatWindow] 🎉 APPROVED status detected - keeping polling active');
            // Update to approved message but keep polling to detect when it resets
            updateAuthorizationPending(false);
            
            // Clear any existing timeout
            if (authMessageTimeoutRef.current) {
              clearTimeout(authMessageTimeoutRef.current);
              authMessageTimeoutRef.current = null;
            }
            
            console.log('[ChatWindow] Setting authorization message to APPROVED');
            setAuthorizationMessage('✅ Authorization approved! Processing your request...');
            console.log('[ChatWindow] Polling will continue to detect idle state');
            
            // Add a fallback timeout to clear the message after 10 seconds if polling doesn't detect idle
            authMessageTimeoutRef.current = setTimeout(() => {
              console.log('[ChatWindow] Fallback timeout: Clearing authorization message after 10s');
              setAuthorizationMessage('');
              hasSeenActiveAuthRef.current = false;
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              authMessageTimeoutRef.current = null;
            }, 10000);
            // Don't stop polling yet - wait for state to reset to idle
            
          } else if (data.authorizationStatus === 'denied') {
            // Stop polling for denied
            updateAuthorizationPending(false);
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            
            // Clear any existing timeout
            if (authMessageTimeoutRef.current) {
              clearTimeout(authMessageTimeoutRef.current);
              authMessageTimeoutRef.current = null;
            }
            
            setAuthorizationMessage('❌ Authorization was denied.');
            authMessageTimeoutRef.current = setTimeout(() => {
              setAuthorizationMessage('');
              authMessageTimeoutRef.current = null;
            }, 5000);
            
          } else if (data.authorizationStatus === 'pending' || data.authorizationStatus === 'requested') {
            // Keep showing pending/requested status
            if (isAuthorizationPendingRef.current || data.authorizationStatus === 'requested') {
              setAuthorizationMessage('⏳ Waiting for authorization approval...');
            }
          }
        }
      } catch (error) {
        console.error('Error polling authorization status:', error);
      }
    }, 2000); // Poll every 2 seconds
  };

  // Function to start a new chat conversation
  const startNewChat = () => {
    const newConversationId = generateConversationId();
    setConversationId(newConversationId);
    setMessages([]);
    setInput('');
    setMetadataEvents([]); // Clear metadata for new conversation
    
    // Stop any ongoing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    // Clear any pending auth message timeout
    if (authMessageTimeoutRef.current) {
      clearTimeout(authMessageTimeoutRef.current);
      authMessageTimeoutRef.current = null;
    }
    
    // Clear all status messages and reset flags
    setStatusMessage('');
    setAuthorizationMessage('');
    updateAuthorizationPending(false);
    hasSeenActiveAuthRef.current = false; // Reset the active auth flag
    hasAuthorizationMessageRef.current = false; // Reset the auth message flag
    
    console.log('[ChatWindow] Started new conversation:', newConversationId);
    toast.success('New conversation started');
  };

  // Function to check if message requires authorization
  const requiresAuthorization = (content: string): boolean => {
    // Only treat explicit checkout/payment intents as requiring authorization.
    // Do NOT treat generic 'add to cart' or ambiguous words like 'order' as
    // triggers for an authorization flow.
    const authKeywords = [
      'checkout', 'buy', 'purchase', 'proceed to checkout', 'complete purchase', 'make payment'
    ];
    const lowerContent = content.toLowerCase();
    return authKeywords.some(keyword => lowerContent.includes(keyword));
  };

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isLoading || !input.trim()) return;
    
    const userMessage: LangChainMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Scroll to bottom after adding user message
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
    
    // Check if this message likely requires authorization
    const needsAuth = requiresAuthorization(userMessage.content);
    
    setInput('');
    setIsLoading(true);
    
    // Show immediate authorization status if needed
    if (needsAuth) {
      console.log('[ChatWindow] Authorization detected, adding inline ephemeral message');
      
      // Mark that we have an authorization message showing
      hasAuthorizationMessageRef.current = true;
      
      // Remove any existing auth messages
      setMessages(prev => prev.filter(msg => !msg.isEphemeral || !msg.ephemeralType?.startsWith('authorization-')));
      
      // Add inline ephemeral authorization message
      const authRequestMessage: LangChainMessage = {
        id: `auth-${Date.now()}`,
        role: 'system',
        content: 'Authorization request sent. Please check your device to approve the transaction...',
        isEphemeral: true,
        ephemeralType: 'authorization-request'
      };
      setMessages(prev => [...prev, authRequestMessage]);
      
      // After 1 second, update to pending status
      setTimeout(() => {
        setMessages(prev => prev.map(msg => 
          msg.ephemeralType === 'authorization-request' 
            ? { ...msg, content: 'Waiting for authorization approval...', ephemeralType: 'authorization-pending' as const }
            : msg
        ));
      }, 1000);
    }
    
    try {
      // Use EventSource for SSE streaming
      const response = await fetch(props.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage]
            .filter(msg => !msg.isEphemeral) // Exclude ephemeral messages from context
            .map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
          conversationId, // Include conversation ID for agent context
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check if response is streaming (SSE)
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        // Handle SSE streaming
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        if (!reader) {
          throw new Error('No reader available for stream');
        }

        let buffer = '';
        let finalMessage = '';
        let authStatus: any = undefined;
        let authMessage: string | undefined = undefined;
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE messages (separated by \n\n)
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || ''; // Keep incomplete message in buffer
          
          for (const message of messages) {
            if (!message.trim() || !message.startsWith('data: ')) continue;
            
            try {
              const data = JSON.parse(message.slice(6)); // Remove 'data: ' prefix
              
              console.log('[ChatWindow] SSE event:', data);
              
              // Handle metadata events for dev tools
              if (data.type === 'metadata' && data.payload) {
                const metadataEvent: MetadataEvent = {
                  id: `metadata-${Date.now()}-${Math.random()}`,
                  timestamp: data.payload.timestamp || Date.now(),
                  type: data.payload.type,
                  data: data.payload.data
                };
                setMetadataEvents(prev => [...prev, metadataEvent]);
                console.log('[ChatWindow] Added metadata event:', metadataEvent);
              }
              
              if (data.type === 'progress') {
                // Only update status if authorization is NOT pending
                if (!isAuthorizationPendingRef.current) {
                  setStatusMessage(data.content);
                  
                  // Auto-clear after 5 seconds of no updates
                  setTimeout(() => {
                    setStatusMessage(prev => prev === data.content ? '' : prev);
                  }, 5000);
                } else {
                  console.log('[ChatWindow] Skipping progress update - authorization pending');
                }
                
              } else if (data.type === 'message') {
                // Final message from agent
                finalMessage = data.content;
                authStatus = data.authorizationStatus;
                authMessage = data.authorizationMessage;
                
              } else if (data.type === 'error') {
                // Error message
                finalMessage = data.content;
                
              } else if (data.type === 'done') {
                // Stream completed
                console.log('[ChatWindow] Stream completed');
              }
              
            } catch (parseError) {
              console.error('[ChatWindow] Error parsing SSE message:', parseError, message);
            }
          }
        }
        
        // Handle authorization status if present (before clearing status)
        if (authStatus) {
          console.log('[ChatWindow] ========== SSE - Authorization status DETECTED ==========');
          console.log('[ChatWindow] Status:', authStatus);
          console.log('[ChatWindow] Message:', authMessage);
          console.log('[ChatWindow] Current messages count:', messages.length);
          console.log('[ChatWindow] Ephemeral auth messages:', messages.filter(m => m.isEphemeral && m.ephemeralType?.startsWith('authorization-')));
          
          switch (authStatus) {
            case 'requested':
              // Remove any existing auth messages
              setMessages(prev => prev.filter(msg => !msg.isEphemeral || !msg.ephemeralType?.startsWith('authorization-')));
              
              // Add inline ephemeral message
              const requestMessage: LangChainMessage = {
                id: `auth-${Date.now()}`,
                role: 'system',
                content: authMessage || 'Authorization request sent. Please check your device to approve.',
                isEphemeral: true,
                ephemeralType: 'authorization-request'
              };
              setMessages(prev => [...prev, requestMessage]);
              
              // After 1 second, update to pending status
              setTimeout(() => {
                setMessages(prev => prev.map(msg => 
                  msg.ephemeralType === 'authorization-request' 
                    ? { ...msg, content: 'Waiting for authorization approval...', ephemeralType: 'authorization-pending' as const }
                    : msg
                ));
              }, 1000);
              break;
              
            case 'pending':
              // Check if we already have a pending message
              const hasPendingMsg = messages.some(m => m.ephemeralType === 'authorization-pending');
              if (!hasPendingMsg) {
                // Remove any existing auth messages
                setMessages(prev => prev.filter(msg => !msg.isEphemeral || !msg.ephemeralType?.startsWith('authorization-')));
                
                // Add pending message
                const pendingMessage: LangChainMessage = {
                  id: `auth-${Date.now()}`,
                  role: 'system',
                  content: 'Waiting for authorization approval...',
                  isEphemeral: true,
                  ephemeralType: 'authorization-pending'
                };
                setMessages(prev => [...prev, pendingMessage]);
              }
              break;
              
            case 'approved':
              console.log('[ChatWindow] ========== SSE - Authorization APPROVED CASE ==========');
              console.log('[ChatWindow] About to clear authorization pending flag');
              // Clear authorization pending flag to allow status messages again
              updateAuthorizationPending(false);
              console.log('[ChatWindow] Flag cleared, now updating message');
              
              // Update pending message to approved
              setMessages(prev => {
                console.log('[ChatWindow] Mapping messages to update auth message');
                console.log('[ChatWindow] Messages before update:', prev.length);
                const updated = prev.map(msg => 
                  msg.isEphemeral && msg.ephemeralType?.startsWith('authorization-')
                    ? { ...msg, content: 'Authorization approved! Processing your request...', ephemeralType: 'authorization-approved' as const }
                    : msg
                );
                console.log('[ChatWindow] Messages after update:', updated.length);
                console.log('[ChatWindow] Updated auth messages:', updated.filter(m => m.isEphemeral && m.ephemeralType?.startsWith('authorization-')));
                return updated;
              });
              
              console.log('[ChatWindow] Setting 3 second timeout to remove message');
              // Remove the approved message after 3 seconds
              setTimeout(() => {
                console.log('[ChatWindow] ========== SSE - Timeout fired: Removing approved authorization message ==========');
                setMessages(prev => {
                  const filtered = prev.filter(msg => !msg.isEphemeral || !msg.ephemeralType?.startsWith('authorization-'));
                  console.log('[ChatWindow] Messages before filter:', prev.length);
                  console.log('[ChatWindow] Messages after filter:', filtered.length);
                  return filtered;
                });
                hasAuthorizationMessageRef.current = false; // Clear the flag
              }, 3000);
              break;
              
            case 'denied':
              console.log('[ChatWindow] SSE - Authorization DENIED, updating message');
              // Clear authorization pending flag
              updateAuthorizationPending(false);
              
              // Update to denied message
              setMessages(prev => prev.map(msg => 
                msg.isEphemeral && msg.ephemeralType?.startsWith('authorization-')
                  ? { ...msg, content: 'Authorization was denied.', ephemeralType: 'authorization-denied' as const }
                  : msg
              ));
              
              // Remove the denied message after 5 seconds
              setTimeout(() => {
                console.log('[ChatWindow] SSE - Removing denied authorization message');
                setMessages(prev => prev.filter(msg => !msg.isEphemeral || !msg.ephemeralType?.startsWith('authorization-')));
                hasAuthorizationMessageRef.current = false; // Clear the flag
              }, 5000);
              break;
          }
        } else {
          // No explicit authStatus in SSE response
          // If we have an authorization message showing (pending), and the stream completed successfully,
          // assume authorization was approved and update the message
          console.log('[ChatWindow] No authStatus in SSE response');
          console.log('[ChatWindow] hasAuthorizationMessageRef.current:', hasAuthorizationMessageRef.current);
          
          if (hasAuthorizationMessageRef.current) {
            console.log('[ChatWindow] Found pending auth message flag, assuming approval since stream completed successfully');
            
            // Clear authorization pending flag
            updateAuthorizationPending(false);
            
            // Update to approved
            setMessages(prev => prev.map(msg => 
              msg.isEphemeral && msg.ephemeralType?.startsWith('authorization-')
                ? { ...msg, content: 'Authorization approved! Processing your request...', ephemeralType: 'authorization-approved' as const }
                : msg
            ));
            
            // Remove after 3 seconds
            setTimeout(() => {
              console.log('[ChatWindow] Removing approved authorization message (from implicit approval)');
              setMessages(prev => prev.filter(msg => !msg.isEphemeral || !msg.ephemeralType?.startsWith('authorization-')));
              hasAuthorizationMessageRef.current = false; // Clear the flag
            }, 3000);
          }
        }
        
        // Add final assistant message
        if (finalMessage) {
          const assistantMessage: LangChainMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: finalMessage,
          };
          
          setMessages(prev => [...prev, assistantMessage]);
        }
        
      } else {
        // Fallback to non-streaming JSON response (backward compatibility)
        const data = await response.json();
      
        // Handle authorization status if present
        if (data.authorizationStatus) {
          console.log('[ChatWindow] Non-streaming - Authorization status:', data.authorizationStatus);
          
          switch (data.authorizationStatus) {
            case 'requested':
              // Remove any existing auth messages
              setMessages(prev => prev.filter(msg => !msg.isEphemeral || !msg.ephemeralType?.startsWith('authorization-')));
              
              // Add inline ephemeral message
              const requestMessage: LangChainMessage = {
                id: `auth-${Date.now()}`,
                role: 'system',
                content: data.authorizationMessage || 'Authorization request sent. Please check your device to approve.',
                isEphemeral: true,
                ephemeralType: 'authorization-request'
              };
              setMessages(prev => [...prev, requestMessage]);
              
              // After 1 second, update to pending status
              setTimeout(() => {
                setMessages(prev => prev.map(msg => 
                  msg.ephemeralType === 'authorization-request' 
                    ? { ...msg, content: 'Waiting for authorization approval...', ephemeralType: 'authorization-pending' as const }
                    : msg
                ));
              }, 1000);
              break;
              
            case 'pending':
              // Check if we already have a pending message
              const hasPendingMsg = messages.some(m => m.ephemeralType === 'authorization-pending');
              if (!hasPendingMsg) {
                // Remove any existing auth messages
                setMessages(prev => prev.filter(msg => !msg.isEphemeral || !msg.ephemeralType?.startsWith('authorization-')));
                
                // Add pending message
                const pendingMessage: LangChainMessage = {
                  id: `auth-${Date.now()}`,
                  role: 'system',
                  content: 'Waiting for authorization approval...',
                  isEphemeral: true,
                  ephemeralType: 'authorization-pending'
                };
                setMessages(prev => [...prev, pendingMessage]);
              }
              break;
              
            case 'approved':
              console.log('[ChatWindow] Non-streaming - Authorization APPROVED, updating message');
              // Clear authorization pending flag to allow status messages again
              updateAuthorizationPending(false);
              
              // Update pending message to approved
              setMessages(prev => prev.map(msg => 
                msg.isEphemeral && msg.ephemeralType?.startsWith('authorization-')
                  ? { ...msg, content: 'Authorization approved! Processing your request...', ephemeralType: 'authorization-approved' as const }
                  : msg
              ));
              
              // Remove the approved message after 3 seconds
              setTimeout(() => {
                console.log('[ChatWindow] Non-streaming - Removing approved authorization message');
                setMessages(prev => prev.filter(msg => !msg.isEphemeral || !msg.ephemeralType?.startsWith('authorization-')));
              }, 3000);
              break;
              
            case 'denied':
              console.log('[ChatWindow] Non-streaming - Authorization DENIED, updating message');
              // Clear authorization pending flag
              updateAuthorizationPending(false);
              
              // Update to denied message
              setMessages(prev => prev.map(msg => 
                msg.isEphemeral && msg.ephemeralType?.startsWith('authorization-')
                  ? { ...msg, content: 'Authorization was denied.', ephemeralType: 'authorization-denied' as const }
                  : msg
              ));
              
              // Remove the denied message after 5 seconds
              setTimeout(() => {
                console.log('[ChatWindow] Non-streaming - Removing denied authorization message');
                setMessages(prev => prev.filter(msg => !msg.isEphemeral || !msg.ephemeralType?.startsWith('authorization-')));
              }, 5000);
              break;
          }
        }
        
        // Add the response as an assistant message
        const assistantMessage: LangChainMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.message || 'No response received',
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        
        // Scroll to bottom after adding assistant response
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 150);
      }

    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to get response');
      
      // Clear status message and authorization pending flag on error
      setStatusMessage('');
      updateAuthorizationPending(false);
      
      // Add error message
      const errorMessage: LangChainMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Only clear status if not waiting for authorization
      if (!isAuthorizationPendingRef.current) {
        setStatusMessage('');
      }
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value);
  }

  // Function to get styling for ephemeral messages
  const getEphemeralMessageStyle = (ephemeralType: NonNullable<LangChainMessage['ephemeralType']>) => {
    switch (ephemeralType) {
      case 'authorization-request':
        return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100';
      case 'authorization-pending':
        return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100';
      case 'authorization-approved':
        return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100';
      case 'authorization-denied':
        return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100';
      default:
        return 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100';
    }
  };

  const getEphemeralIcon = (ephemeralType: NonNullable<LangChainMessage['ephemeralType']>) => {
    switch (ephemeralType) {
      case 'authorization-request':
        return '🔐';
      case 'authorization-pending':
        return '⏳';
      case 'authorization-approved':
        return '✅';
      case 'authorization-denied':
        return '❌';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with New Chat and Dev Metadata buttons */}
      <div className="flex justify-end items-center gap-2 p-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        <Button
          onClick={() => setShowDevMetadata(!showDevMetadata)}
          variant="outline"
          size="sm"
          className={cn(
            "flex items-center gap-2 text-sm transition-colors",
            showDevMetadata && "bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700"
          )}
          disabled={isLoading}
        >
          <Code2 className="h-4 w-4" />
          Dev Metadata
          {metadataEvents.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-purple-500 text-white">
              {metadataEvents.length}
            </span>
          )}
        </Button>
        <Button
          onClick={startNewChat}
          variant="outline"
          size="sm"
          className="flex items-center gap-2 text-sm"
          disabled={isLoading}
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </Button>
      </div>
      
      {/* Main content area with optional dev panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat area */}
        <div className={cn(
          "flex-1 flex flex-col transition-all duration-300",
          showDevMetadata ? "mr-2" : ""
        )}>
          <div className="flex-1 overflow-auto p-4" id="chat-container" ref={chatContainerRef}>
        {messages.length === 0 ? (
          <div>{props.emptyStateComponent}</div>
        ) : (
          <div className="flex flex-col max-w-[768px] mx-auto pb-12 w-full">
            {messages.map((m) => {
              // Handle ephemeral messages differently
              if (m.isEphemeral && m.ephemeralType) {
                return (
                  <div key={m.id} className="mb-4">
                    <div className={cn(
                      'rounded-lg px-4 py-3 border text-sm max-w-[90%] mx-auto',
                      'transition-all duration-300 ease-in-out transform',
                      'animate-in slide-in-from-top-2 fade-in duration-300',
                      getEphemeralMessageStyle(m.ephemeralType)
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{getEphemeralIcon(m.ephemeralType)}</span>
                          <span className="font-medium">{m.content}</span>
                          {m.ephemeralType === 'authorization-pending' && (
                            <div className="ml-2">
                              <LoaderCircle className="animate-spin h-4 w-4" />
                            </div>
                          )}
                        </div>
                        {m.ephemeralType !== 'authorization-pending' && (
                          <button
                            onClick={() => removeEphemeralMessage(m.id)}
                            className="ml-3 text-xs opacity-60 hover:opacity-100 transition-opacity"
                            aria-label="Dismiss"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // Handle regular messages
              return (
                <div
                  key={m.id}
                  className={cn(
                    'rounded-[24px] max-w-[80%] mb-8 flex',
                    m.role === 'user' ? 'bg-secondary text-secondary-foreground px-4 py-2' : null,
                    m.role === 'user' ? 'ml-auto' : 'mr-auto',
                  )}
                >
                  {m.role !== 'user' && (
                    <div className="mr-4 mt-1 border bg-secondary -mt-2 rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
                      {props.emoji}
                    </div>
                  )}
                  <div className="prose dark:prose-invert">
                    {m.content}
                  </div>
                </div>
              );
            })}
            {/* Invisible element for auto-scrolling */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      <div className="sticky bottom-0 bg-background">
        {/* Authorization messages now appear inline in chat - see ephemeral messages above */}
        
        {/* Status Indicator - Single location for all progress updates */}
        {statusMessage && (
          <div className="max-w-[768px] mx-auto px-4 pb-2">
            <div className={cn(
              'rounded-lg px-4 py-3 border text-sm',
              'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
              'text-blue-900 dark:text-blue-100',
              'transition-all duration-300 ease-in-out',
              'animate-in slide-in-from-bottom-2 fade-in'
            )}>
              <div className="flex items-center gap-2">
                <LoaderCircle className="animate-spin h-4 w-4 flex-shrink-0" />
                <span className="font-medium">{statusMessage}</span>
              </div>
            </div>
          </div>
        )}
        
        <ChatInput
          value={input}
          onChange={handleInputChange}
          onSubmit={sendMessage}
          loading={isLoading}
          placeholder={props.placeholder ?? 'What can I help you with?'}
        />
      </div>
    </div>
    
        {/* Dev Metadata Panel - Slide in from right */}
        <div className={cn(
          "flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50",
          "transition-all duration-300 ease-in-out overflow-hidden",
          showDevMetadata ? "w-96" : "w-0"
        )}>
          {showDevMetadata && (
            <div className="h-full flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Agent Workflow Metadata
                </h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  Track planner recommendations and supervisor routing decisions
                </p>
              </div>
              <DevMetadata events={metadataEvents} className="flex-1" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
