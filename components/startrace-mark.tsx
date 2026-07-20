import { cn } from "@/lib/utils";

export function StartraceMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 36 36"
      className={cn("size-9 shrink-0 text-foreground", className)}
      fill="none"
    >
      <path d="M7 27 16 10l6 15 7-5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="7" cy="27" r="2.2" fill="currentColor" />
      <circle cx="16" cy="10" r="2.2" fill="currentColor" />
      <circle cx="22" cy="25" r="2.2" fill="currentColor" />
      <circle cx="29" cy="20" r="2.2" fill="currentColor" />
      <path d="M25 7v6M22 10h6" stroke="hsl(var(--primary))" strokeWidth="1.6" />
    </svg>
  );
}
