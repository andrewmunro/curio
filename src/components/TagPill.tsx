type TagPillProps = {
  tag: string;
  isAi?: boolean;
  removable?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
};

export function TagPill({ tag, isAi, removable, onClick, onRemove }: TagPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
        isAi
          ? "bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25"
          : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {tag}
      {isAi && <span className="text-[10px] opacity-60">AI</span>}
      {removable && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:text-red-500 transition-colors"
        >
          ×
        </button>
      )}
    </span>
  );
}
