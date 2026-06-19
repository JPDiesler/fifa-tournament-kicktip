// A single 0–99 score box. Scores are kept as strings ("" = empty) to match the API
// payload shape. A plain controlled input (not HeroUI NumberField) so the digit is
// reliably centred and the value passes straight through; the server validates the range.
export default function ScoreInput({ value, onChange, isDisabled, label }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={label}
      value={value ?? ""}
      disabled={isDisabled}
      // keep only digits, max two (→ 0–99)
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
      // select on focus so a tap overwrites; keep the field above the mobile keyboard
      onFocus={(e) => { const el = e.target; el.select?.(); setTimeout(() => el.scrollIntoView?.({ block: "center", behavior: "smooth" }), 350); }}
      className="h-11 w-14 rounded-md border border-border bg-field text-center text-lg font-bold tabular-nums text-foreground outline-none transition-colors focus:border-accent disabled:opacity-40"
    />
  );
}
