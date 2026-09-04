export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="4" y="4" width="56" height="56" rx="12" className="fill-accent" />
      <path
        d="M18 26v-6a2 2 0 0 1 2-2h6M46 26v-6a2 2 0 0 0-2-2h-6M18 38v6a2 2 0 0 0 2 2h6M46 38v6a2 2 0 0 1-2 2h-6"
        fill="none"
        className="stroke-accent-fg"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="32" r="6" className="fill-accent-fg" />
    </svg>
  );
}
