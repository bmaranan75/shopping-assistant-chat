'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface MetadataEvent {
  id: string;
  timestamp: number;
  type: 'planner_recommendation' | 'supervisor_decision' | 'agent_transition' | 'workflow_context' | 'agent_routing_decision';
  data: any;
}

interface DevMetadataProps {
  events: MetadataEvent[];
  className?: string;
}

export function DevMetadata({ events, className }: DevMetadataProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const toggleEvent = (id: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getEventIcon = (type: MetadataEvent['type']) => {
    switch (type) {
      case 'planner_recommendation':
        return '🧠';
      case 'supervisor_decision':
        return '🎯';
      case 'agent_transition':
        return '🔄';
      case 'workflow_context':
        return '📋';
      case 'agent_routing_decision':
        return '🚦';
      default:
        return '•';
    }
  };

  const getEventColor = (type: MetadataEvent['type']) => {
    switch (type) {
      case 'planner_recommendation':
        return 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800';
      case 'supervisor_decision':
        return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
      case 'agent_transition':
        return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
      case 'workflow_context':
        return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800';
      case 'agent_routing_decision':
        return 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800';
      default:
        return 'bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const formatEventType = (type: MetadataEvent['type']) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  if (events.length === 0) {
    return (
      <div className={cn('p-4 text-center text-sm text-muted-foreground', className)}>
        No metadata events yet. Start a conversation to see agent routing decisions.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2 p-4 overflow-y-auto', className)}>
      {events.map(event => {
        const isExpanded = expandedEvents.has(event.id);
        
        return (
          <div
            key={event.id}
            className={cn(
              'border rounded-lg overflow-hidden transition-all',
              getEventColor(event.type)
            )}
          >
            <button
              onClick={() => toggleEvent(event.id)}
              className="w-full px-3 py-2 flex items-center gap-2 hover:opacity-80 transition-opacity text-left"
            >
              <span className="text-lg">{getEventIcon(event.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{formatEventType(event.type)}</span>
                  <span className="text-xs opacity-60">{formatTimestamp(event.timestamp)}</span>
                </div>
                {!isExpanded && (
                  <div className="text-xs opacity-70 truncate mt-0.5">
                    {event.type === 'planner_recommendation' && (
                      <>
                        {event.data.action && `Action: ${event.data.action}`}
                        {(event.data.targetAgent || event.data.recommendedAgent) && ` → ${event.data.targetAgent || event.data.recommendedAgent}`}
                        {event.data.confidence !== undefined && ` (${Math.round(event.data.confidence * 100)}%)`}
                      </>
                    )}
                    {event.type === 'agent_routing_decision' && (
                      <>
                        {event.data.fromAgent && `${event.data.fromAgent}`}
                        {event.data.toAgent && ` → ${event.data.toAgent}`}
                        {event.data.workflowContext && ` [${event.data.workflowContext}]`}
                      </>
                    )}
                    {event.type !== 'planner_recommendation' && event.type !== 'agent_routing_decision' && (
                      <>
                        {event.data.action && `Action: ${event.data.action}`}
                        {event.data.targetAgent && ` → ${event.data.targetAgent}`}
                        {event.data.confidence !== undefined && ` (${Math.round(event.data.confidence * 100)}%)`}
                      </>
                    )}
                  </div>
                )}
              </div>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 flex-shrink-0" />
              )}
            </button>
            
            {isExpanded && (
              <div className="px-3 pb-3 pt-1">
                {event.type === 'planner_recommendation' ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {event.data.action && (
                        <div>
                          <span className="font-semibold opacity-70">Action:</span>
                          <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded">
                            {event.data.action}
                          </div>
                        </div>
                      )}
                      {(event.data.targetAgent || event.data.recommendedAgent) && (
                        <div>
                          <span className="font-semibold opacity-70">Target Agent:</span>
                          <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded">
                            {event.data.targetAgent || event.data.recommendedAgent}
                          </div>
                        </div>
                      )}
                      {event.data.confidence !== undefined && (
                        <div>
                          <span className="font-semibold opacity-70">Confidence:</span>
                          <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded">
                            {Math.round(event.data.confidence * 100)}%
                          </div>
                        </div>
                      )}
                    </div>
                    {event.data.reasoning && (
                      <div className="text-xs">
                        <span className="font-semibold opacity-70">Reasoning:</span>
                        <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded">
                          {event.data.reasoning}
                        </div>
                      </div>
                    )}
                    {event.data.task && (
                      <div className="text-xs">
                        <span className="font-semibold opacity-70">Task:</span>
                        <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded">
                          {event.data.task}
                        </div>
                      </div>
                    )}
                    <details className="text-xs">
                      <summary className="cursor-pointer font-semibold opacity-70 hover:opacity-100">
                        Full JSON
                      </summary>
                      <pre className="mt-1 bg-black/5 dark:bg-white/5 p-2 rounded overflow-x-auto">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : event.type === 'agent_routing_decision' ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {event.data.fromAgent && (
                        <div>
                          <span className="font-semibold opacity-70">From Agent:</span>
                          <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded font-mono">
                            {event.data.fromAgent}
                          </div>
                        </div>
                      )}
                      {event.data.toAgent && (
                        <div>
                          <span className="font-semibold opacity-70">To Agent:</span>
                          <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded font-mono">
                            {event.data.toAgent}
                          </div>
                        </div>
                      )}
                    </div>
                    {event.data.workflowContext && (
                      <div className="text-xs">
                        <span className="font-semibold opacity-70">Workflow Context:</span>
                        <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded font-mono">
                          {event.data.workflowContext}
                        </div>
                      </div>
                    )}
                    {event.data.dealData && (
                      <div className="text-xs">
                        <span className="font-semibold opacity-70">Deal Data:</span>
                        <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded">
                          <div className="grid grid-cols-2 gap-1">
                            {event.data.dealData.applied !== undefined && (
                              <div>
                                <span className="opacity-60">Applied:</span>{' '}
                                <span className={event.data.dealData.applied ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}>
                                  {event.data.dealData.applied ? '✓ Yes' : '✗ No'}
                                </span>
                              </div>
                            )}
                            {event.data.dealData.pending !== undefined && (
                              <div>
                                <span className="opacity-60">Pending:</span>{' '}
                                <span className={event.data.dealData.pending ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500'}>
                                  {event.data.dealData.pending ? '⏳ Yes' : '✗ No'}
                                </span>
                              </div>
                            )}
                            {event.data.dealData.type && (
                              <div className="col-span-2">
                                <span className="opacity-60">Type:</span>{' '}
                                <span className="font-mono text-xs">{event.data.dealData.type}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {event.data.pendingProduct && (
                      <div className="text-xs">
                        <span className="font-semibold opacity-70">Pending Product:</span>
                        <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{event.data.pendingProduct.product}</span>
                            {event.data.pendingProduct.quantity && (
                              <span className="text-xs opacity-60">× {event.data.pendingProduct.quantity}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {event.data.cartData && (
                      <div className="text-xs">
                        <span className="font-semibold opacity-70">Cart Data:</span>
                        <div className="mt-0.5 px-2 py-1 bg-black/5 dark:bg-white/5 rounded">
                          {typeof event.data.cartData === 'string' ? (
                            <span className="text-green-600 dark:text-green-400">✓ Present</span>
                          ) : (
                            <pre className="text-xs overflow-x-auto">{JSON.stringify(event.data.cartData, null, 2)}</pre>
                          )}
                        </div>
                      </div>
                    )}
                    <details className="text-xs">
                      <summary className="cursor-pointer font-semibold opacity-70 hover:opacity-100">
                        Full JSON
                      </summary>
                      <pre className="mt-1 bg-black/5 dark:bg-white/5 p-2 rounded overflow-x-auto">
                        {JSON.stringify(event.data, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : (
                  <pre className="text-xs bg-black/5 dark:bg-white/5 p-2 rounded overflow-x-auto">
                    {JSON.stringify(event.data, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
