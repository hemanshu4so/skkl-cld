// src/components/ui/EmptyState.jsx
import { cn } from "../../lib/utils";

export default function EmptyState({ icon = "📭", title, message, action, className }) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      <div className="text-6xl mb-4 opacity-40">{icon}</div>
      <h3 className="text-base font-semibold text-silver-700 mb-1">{title || "Nothing here yet"}</h3>
      {message && <p className="text-sm text-silver-500 max-w-sm mb-4">{message}</p>}
      {action}
    </div>
  );
}

export function Loader({ label = "Loading..." }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex items-center gap-3">
        <svg className="animate-spin h-6 w-6 text-navy-900" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <span className="text-sm text-silver-600">{label}</span>
      </div>
    </div>
  );
}

export function Skeleton({ className }) {
  return (
    <div
      className={cn("bg-silver-200 rounded animate-pulse", className)}
      style={{
        backgroundImage: "linear-gradient(90deg, #e5e5e5 0px, #f0f0f0 40px, #e5e5e5 80px)",
        backgroundSize: "1000px 100%",
        animation: "shimmer 2s infinite linear",
      }}
    />
  );
}
