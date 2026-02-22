import type { InputHTMLAttributes, ReactNode } from "react";

export function Input({ icon, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }) {
  return (
    <div className="ui-input-wrap">
      {icon && <span className="ui-input-icon">{icon}</span>}
      <input className={`input ui-input ${icon ? "ui-input--with-icon" : ""} ${className}`.trim()} {...props} />
    </div>
  );
}
