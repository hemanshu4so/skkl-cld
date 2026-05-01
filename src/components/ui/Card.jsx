// src/components/ui/Card.jsx
import { cn } from "../../lib/utils";

export function Card({ children, className, hover = false, ...props }) {
  return (
    <div
      className={cn("card", hover && "card-hover", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon, className }) {
  return (
    <div className={cn("flex items-start justify-between p-5 border-b border-silver-100", className)}>
      <div className="flex items-center gap-3">
        {icon && <span className="text-2xl">{icon}</span>}
        <div>
          <h3 className="text-base font-bold text-navy-900">{title}</h3>
          {subtitle && <p className="text-xs text-silver-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardBody({ children, className, padded = true }) {
  return (
    <div className={cn(padded && "p-5", className)}>
      {children}
    </div>
  );
}

export function StatCard({ icon, label, value, sub, accent = "navy", onClick }) {
  const accents = {
    navy: "border-l-navy-900",
    gold: "border-l-gold-500",
    silver: "border-l-silver-500",
    green: "border-l-green-500",
    red: "border-l-red-500",
    blue: "border-l-blue-500",
    purple: "border-l-purple-500",
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "card p-5 border-l-4 flex flex-col gap-1.5",
        accents[accent],
        onClick && "card-hover"
      )}
    >
      {icon && <div className="text-2xl mb-1">{icon}</div>}
      <div className="text-2xl font-bold text-navy-900 leading-tight">{value}</div>
      <div className="text-sm font-semibold text-silver-700">{label}</div>
      {sub && <div className="text-xs text-silver-500">{sub}</div>}
    </div>
  );
}
