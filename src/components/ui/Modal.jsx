// src/components/ui/Modal.jsx
import { useEffect } from "react";
import { cn } from "../../lib/utils";

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md", // sm | md | lg | xl | full
  closeOnBackdrop = true,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-6xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto animate-fade-in"
      onClick={() => closeOnBackdrop && onClose?.()}
    >
      <div
        className={cn(
          "w-full bg-white rounded-2xl shadow-2xl my-8 animate-slide-up",
          sizes[size] || sizes.md
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between p-5 border-b border-silver-100">
            <h2 className="text-lg font-bold text-navy-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-silver-500 hover:text-silver-900 text-2xl leading-none"
            >
              ×
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-silver-100 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
