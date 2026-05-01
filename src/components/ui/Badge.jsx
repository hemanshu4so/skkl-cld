// src/components/ui/Badge.jsx
import { cn } from "../../lib/utils";

export default function Badge({ children, variant = "silver", size = "md", className }) {
  const variants = {
    gold: "badge-gold",
    silver: "badge-silver",
    success: "badge-success",
    warn: "badge-warn",
    danger: "badge-danger",
    info: "badge-info",
    blue: "bg-blue-100 text-blue-800",
    purple: "bg-purple-100 text-purple-800",
    indigo: "bg-indigo-100 text-indigo-800",
    orange: "bg-orange-100 text-orange-800",
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-silver-200 text-silver-700",
  };
  const sizes = {
    sm: "text-[10px] px-2 py-0",
    md: "",
    lg: "text-sm px-3 py-1",
  };
  return (
    <span className={cn("badge", variants[variant] || variants.silver, sizes[size], className)}>
      {children}
    </span>
  );
}
