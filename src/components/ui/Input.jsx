// src/components/ui/Input.jsx
import { cn } from "../../lib/utils";

export function Input({ label, error, hint, icon, required, className, ...props }) {
  return (
    <div className="flex flex-col">
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-silver-400">
            {icon}
          </span>
        )}
        <input
          className={cn(
            "input",
            icon && "pl-10",
            error && "input-error",
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-silver-500 mt-1">{hint}</p>}
    </div>
  );
}

export function Select({ label, error, options = [], required, className, children, ...props }) {
  return (
    <div className="flex flex-col">
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <select
        className={cn("input bg-white pr-9 cursor-pointer", error && "input-error", className)}
        {...props}
      >
        {children
          ? children
          : options.map((opt) => {
              if (typeof opt === "string") {
                return <option key={opt} value={opt}>{opt}</option>;
              }
              return <option key={opt.value} value={opt.value}>{opt.label}</option>;
            })}
      </select>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, hint, required, rows = 3, className, ...props }) {
  return (
    <div className="flex flex-col">
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <textarea
        rows={rows}
        className={cn("input resize-y", error && "input-error", className)}
        {...props}
      />
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-silver-500 mt-1">{hint}</p>}
    </div>
  );
}
