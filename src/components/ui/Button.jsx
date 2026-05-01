// src/components/ui/Button.jsx
import { cn } from "../../lib/utils";

export default function Button({
  children,
  variant = "primary", // primary | gold | secondary | danger | ghost
  size = "md",          // sm | md | lg
  icon,
  loading = false,
  fullWidth = false,
  className,
  disabled,
  ...props
}) {
  const variants = {
    primary: "btn-primary",
    gold: "btn-gold",
    secondary: "btn-secondary",
    danger: "btn-danger",
    ghost: "btn-ghost",
  };
  const sizes = {
    sm: "btn-sm",
    md: "",
    lg: "btn-lg",
  };

  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "btn",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 100 20" fill="currentColor" className="opacity-75" />
        </svg>
      ) : icon}
      {children}
    </button>
  );
}
