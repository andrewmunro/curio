import { useEffect } from "react";

type ToastProps = {
  message: string;
  type?: "error" | "success";
  onDismiss: () => void;
};

export function Toast({ message, type = "error", onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-lg shadow-xl text-sm font-medium animate-in ${
        type === "error"
          ? "bg-red-900/90 text-red-200 border border-red-700/50"
          : "bg-emerald-900/90 text-emerald-200 border border-emerald-700/50"
      }`}
    >
      <div className="flex items-center gap-2">
        <span>{message}</span>
        <button onClick={onDismiss} className="opacity-60 hover:opacity-100 ml-2">
          ×
        </button>
      </div>
    </div>
  );
}
