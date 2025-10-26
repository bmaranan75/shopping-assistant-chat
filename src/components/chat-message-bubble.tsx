import { MemoizedMarkdown } from './memoized-markdown';
import { cn } from '@/utils/cn';

interface LangChainMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function ChatMessageBubble(props: { message: LangChainMessage; aiEmoji?: string }) {
  const isUser = props.message.role === 'user';
  const content = props.message.content;
  
  return (
    <div
      className={cn(
        `rounded-[24px] max-w-[80%] mb-8 flex`,
        isUser ? 'bg-secondary text-secondary-foreground px-4 py-2' : null,
        isUser ? 'ml-auto' : 'mr-auto',
      )}
    >
      {!isUser && (
        <div className="mr-4 mt-1 border bg-secondary -mt-2 rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          {props.aiEmoji}
        </div>
      )}

      <div className="chat-message-bubble whitespace-pre-wrap flex flex-col prose dark:prose-invert max-w-none">
        <MemoizedMarkdown content={content} id={props.message.id || 'message'} />
      </div>
    </div>
  );
}
