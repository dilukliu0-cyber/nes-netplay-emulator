import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type OverflowMenuProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function OverflowMenu({ open, onClose, children }: OverflowMenuProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocumentClick = (event: MouseEvent) => {
      if (!panelRef.current) {
        return;
      }
      const target = event.target as Node | null;
      if (target && !panelRef.current.contains(target)) {
        onClose();
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("mousedown", onDocumentClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onDocumentClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="overflow-menu" ref={panelRef}>
      {children}
    </div>
  );
}
