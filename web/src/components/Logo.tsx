export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden>
        <rect width="32" height="32" rx="7" fill="var(--accent)" />
        <path d="M7 21h18" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M10 15.5h12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".7" />
        <path d="M13 10h6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" opacity=".42" />
      </svg>
      Groundline
    </span>
  );
}
