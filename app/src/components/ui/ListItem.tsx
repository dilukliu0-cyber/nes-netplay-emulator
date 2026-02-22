import type { ButtonHTMLAttributes } from "react";

export function ListItem({ active = false, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <button className={`game-item ${active ? "selected" : ""} ui-list-item ${active ? "ui-list-item--active" : ""} ${className}`.trim()} {...props} />;
}
