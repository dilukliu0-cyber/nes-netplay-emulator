import type { ReactNode } from "react";

export function SectionHeader({ title, action, extra }: { title: string; action?: ReactNode; extra?: ReactNode }) {
  return (
    <div className="ui-section-header">
      <h3>{title}</h3>
      <div className="ui-section-header-right">
        {extra}
        {action}
      </div>
    </div>
  );
}
