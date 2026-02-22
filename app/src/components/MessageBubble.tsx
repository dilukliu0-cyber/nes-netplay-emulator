type MessageBubbleProps = {
  mine: boolean;
  author: string;
  text: string;
  createdAt: string;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ mine, author, text, createdAt }: MessageBubbleProps) {
  return (
    <div className={`message-bubble-row ${mine ? "mine" : "friend"}`}>
      <div className="message-bubble">
        <div className="message-bubble-author">{author}</div>
        <div className="message-bubble-text">{text}</div>
        <div className="message-bubble-time">{formatTime(createdAt)}</div>
      </div>
    </div>
  );
}
