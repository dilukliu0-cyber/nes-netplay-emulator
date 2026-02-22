export function Tabs<T extends string>({
  items,
  active,
  onChange
}: {
  items: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs ui-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          className={`bottom-tab tab ${active === item.id ? "active" : ""} ui-tab ${active === item.id ? "ui-tab--active" : ""}`.trim()}
          role="tab"
          aria-selected={active === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

