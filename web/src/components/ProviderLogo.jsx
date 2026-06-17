// Local, bundled provider logos for AI players — inline SVG brand marks (no external
// URLs). Recognisable, theme-safe (brand colours), and crisp at any size. Unknown
// providers fall back to a neutral "KI" badge.

function Anthropic({ s }) {
  // Claude clay-coloured 8-ray burst.
  const bar = { x: 10.8, y: 1.5, width: 2.4, height: 21, rx: 1.2, fill: "#D97757" };
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden>
      <rect {...bar} />
      <rect {...bar} transform="rotate(45 12 12)" />
      <rect {...bar} transform="rotate(90 12 12)" />
      <rect {...bar} transform="rotate(135 12 12)" />
    </svg>
  );
}
function OpenAI({ s }) {
  // Interlocking knot approximation in the OpenAI green.
  const e = { cx: 12, cy: 12, rx: 9.5, ry: 4, fill: "none", stroke: "#10A37F", strokeWidth: 2 };
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden>
      <ellipse {...e} />
      <ellipse {...e} transform="rotate(60 12 12)" />
      <ellipse {...e} transform="rotate(120 12 12)" />
    </svg>
  );
}
function Gemini({ s }) {
  // Four-point sparkle with the Gemini blue→purple→red gradient.
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden>
      <defs>
        <linearGradient id="wm-gemini" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4" /><stop offset=".5" stopColor="#9168C0" /><stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path fill="url(#wm-gemini)" d="M12 2c.86 5.3 3.84 8.28 9 9-5.16.72-8.14 3.7-9 9-.86-5.3-3.84-8.28-9-9 5.16-.72 8.14-3.7 9-9z" />
    </svg>
  );
}
function Mistral({ s }) {
  // Mistral's stacked colour bands (yellow → red).
  const rows = ["#FFD800", "#FFAF00", "#FF8205", "#FA500F", "#E10500"];
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden>
      {rows.map((c, i) => <rect key={i} x="3" y={4 + i * 3.2} width="18" height="3.2" fill={c} />)}
    </svg>
  );
}

const LOGOS = { anthropic: Anthropic, openai: OpenAI, gemini: Gemini, mistral: Mistral };

export default function ProviderLogo({ provider, size = 14, className = "" }) {
  const L = LOGOS[provider];
  if (L) return <span className={`inline-flex shrink-0 ${className}`} style={{ lineHeight: 0 }}><L s={size} /></span>;
  return (
    <span aria-hidden style={{ background: "#52525b", width: size, height: size, fontSize: Math.round(size * 0.55) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-[4px] font-bold leading-none text-white ${className}`}>KI</span>
  );
}
