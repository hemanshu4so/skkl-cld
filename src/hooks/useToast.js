// src/hooks/useToast.js
import { createContext, useContext, useState, useCallback } from "react";
import { cn } from "../lib/utils";

const ToastContext = createContext({ toast: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = "info", duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const remove = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const styles = {
    success: "bg-green-50 border-green-400 text-green-800",
    error: "bg-red-50 border-red-400 text-red-800",
    warn: "bg-orange-50 border-orange-400 text-orange-800",
    info: "bg-blue-50 border-blue-400 text-blue-800",
  };
  const icons = { success: "✅", error: "❌", warn: "⚠️", info: "ℹ️" };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={cn(
              "pointer-events-auto cursor-pointer min-w-[260px] max-w-sm px-4 py-3 rounded-xl border-l-4 shadow-card animate-slide-up flex items-start gap-2 text-sm font-medium",
              styles[t.type]
            )}
          >
            <span>{icons[t.type]}</span>
            <span className="flex-1">{t.message}</span>
            <button className="text-lg opacity-50 hover:opacity-100 leading-none">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
