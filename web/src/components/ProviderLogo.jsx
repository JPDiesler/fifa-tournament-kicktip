// Compact provider mark for AI players: a custom logo URL if set, otherwise a small
// brand-coloured initial badge. Recognisable + consistent across every view.
const BRAND = {
  anthropic: { label: "A", bg: "#D97757" },
  openai: { label: "O", bg: "#10A37F" },
  gemini: { label: "G", bg: "#1A73E8" },
  mistral: { label: "M", bg: "#FA520F" },
};

export default function ProviderLogo({ provider, logo, size = 14, className = "" }) {
  if (logo) return <img src={logo} alt="" width={size} height={size} className={`inline-block shrink-0 rounded-sm object-contain ${className}`} />;
  const b = BRAND[provider] || { label: "KI", bg: "#52525b" };
  return (
    <span aria-hidden style={{ background: b.bg, width: size, height: size, fontSize: Math.round(size * 0.6) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-[4px] font-bold leading-none text-white ${className}`}>
      {b.label}
    </span>
  );
}
