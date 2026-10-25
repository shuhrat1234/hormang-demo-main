import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/contexts/i18n-context";

interface AuthBackButtonProps {
  className?: string;
  label?: string;
}

export function AuthBackButton({ className = "", label }: AuthBackButtonProps) {
  const { t } = useI18n();
  const displayLabel = label ?? t.dashboard.backHome;

  return (
    <Link
      href="/"
      title={displayLabel}
      aria-label={displayLabel}
      className={`fixed top-4 left-4 sm:top-6 sm:left-6 z-50 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground bg-background/85 hover:bg-card border border-border/80 hover:border-primary/40 shadow-xs hover:shadow-md backdrop-blur-md transition-[transform,color,background-color,border-color,box-shadow] duration-150 ease-out group active:scale-[0.98] ${className}`}
    >
      <ArrowLeft className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1 text-muted-foreground group-hover:text-primary shrink-0" />
      <span className="tracking-tight">{displayLabel}</span>
    </Link>
  );
}
