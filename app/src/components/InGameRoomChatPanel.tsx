import { useEffect, useRef } from "react";
import { Card } from "./ui/Card";
import type { RoomChatMessage } from "../netplay/types";

export function InGameRoomChatPanel(props: {
  side: "left" | "right";
  messages: RoomChatMessage[];
  input: string;
  onInput: (value: string) => void;
  onSend: () => void;
  localUserId?: string;
}) {
  const { side, messages, input, onInput, onSend, localUserId } = props;
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const visibleMessages = messages.slice(-80);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (!stickToBottomRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [visibleMessages.length]);

  return (
    <Card className={`ingame-chat-panel ingame-chat-${side}`}>
      <div className="ingame-chat-title">Room chat</div>
      <div
        ref={listRef}
        className="ingame-chat-list"
        onScroll={() => {
          const list = listRef.current;
          if (!list) return;
          const threshold = 12;
          stickToBottomRef.current = list.scrollTop + list.clientHeight >= list.scrollHeight - threshold;
        }}
      >
        {visibleMessages.length === 0 ? (
          <div className="ingame-chat-empty">No messages yet</div>
        ) : visibleMessages.map((message) => (
          <div key={message.id} className={`ingame-chat-line ${localUserId && message.fromUserId === localUserId ? "mine" : ""}`}>
            <span className="ingame-chat-author">{message.fromDisplayName}</span>
            <span>{message.text}</span>
          </div>
        ))}
      </div>
      <div className="ingame-chat-input-row">
        <input
          value={input}
          onChange={(event) => onInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="Type message..."
          maxLength={400}
        />
        <button type="button" onClick={onSend}>Send</button>
      </div>
    </Card>
  );
}
