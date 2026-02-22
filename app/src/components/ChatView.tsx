import { useEffect, useMemo, useRef } from "react";
import { Button } from "./ui/Button";
import { MessageBubble } from "./MessageBubble";

type ChatMessage = {
  id: string;
  fromUserId: string;
  fromDisplayName: string;
  text: string;
  createdAt: string;
};

type ChatViewProps = {
  messages: ChatMessage[];
  localUserId: string;
  input: string;
  onInputChange: (next: string) => void;
  onSend: () => void;
  disabled?: boolean;
};

export function ChatView({ messages, localUserId, input, onInputChange, onSend, disabled = false }: ChatViewProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <div className="telegram-chat">
      <div className="telegram-chat-list">
        {!hasMessages && null}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            mine={Boolean(localUserId && message.fromUserId === localUserId)}
            author={message.fromDisplayName}
            text={message.text}
            createdAt={message.createdAt}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="telegram-chat-input">
        <input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }
            event.preventDefault();
            onSend();
          }}
          placeholder="Написать сообщение..."
          disabled={disabled}
        />
        <Button variant="primary" data-action="play" onClick={onSend} disabled={disabled}>
          Отправить
        </Button>
      </div>
    </div>
  );
}
