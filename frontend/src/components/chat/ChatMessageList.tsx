import { useEffect, useRef } from 'react';

import type { ChatMessage } from '@/types/chat';

interface ChatMessageListProps {
  messages: ChatMessage[];
  currentUserId: string | null;
}

export default function ChatMessageList({ messages, currentUserId }: ChatMessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div className="h-[48vh] overflow-y-auto rounded-lg border bg-white p-3">
      <div className="space-y-2">
        {messages.map((message) => {
          const isMine = currentUserId === message.sender.user_id;
          return (
            <div
              key={message.id}
              className={`max-w-[86%] rounded-lg px-3 py-2 text-sm ${
                isMine ? 'ml-auto bg-blue-600 text-white' : 'mr-auto bg-gray-100 text-gray-900'
              }`}
            >
              <div className={`mb-1 text-xs ${isMine ? 'text-blue-100' : 'text-gray-500'}`}>
                {message.sender.name || message.sender.user_id}
              </div>
              <div className="whitespace-pre-wrap break-words">{message.text}</div>
              <div className={`mt-1 text-[11px] ${isMine ? 'text-blue-100' : 'text-gray-500'}`}>
                {new Date(message.created_at).toLocaleTimeString()}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={endRef} />
    </div>
  );
}

