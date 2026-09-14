type BrandMarkProps = {
  tone?: "light" | "dark";
  wordmark?: string;
  size?: number;
};

export function BrandMark({
  tone = "light",
  wordmark,
  size = 40,
}: BrandMarkProps) {
  return (
    <span
      className={`a9-brand a9-brand--${tone}`}
      role="img"
      aria-label={
        wordmark
          ? wordmark.toLowerCase().includes("a9")
            ? wordmark
            : `A9 ${wordmark}`
          : "A9"
      }
    >
      <svg
        className="a9-brand-badge"
        width={size}
        height={size}
        viewBox="0 0 40 40"
        aria-hidden="true"
        focusable="false"
      >
        <rect className="a9-badge-bg" width="40" height="40" rx="10" />
        <text
          className="a9-badge-fg"
          x="20"
          y="26.5"
          textAnchor="middle"
          style={{
            fontFamily: "Manrope, sans-serif",
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: "-1.6px",
          }}
        >
          A9
        </text>
      </svg>
      {wordmark ? (
        <span className="a9-brand-word" aria-hidden="true">
          {wordmark}
        </span>
      ) : null}
    </span>
  );
}
