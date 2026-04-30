// Geometric mark: nested chevron forming an "A" — agent + arrow up-and-to-the-right.
export function AgentryLogo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-label="Agentry"
      className={className}
    >
      <path
        d="M4 26 L16 6 L28 26"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 20 L21 20"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="26" cy="8" r="2.4" fill="currentColor" />
    </svg>
  );
}
