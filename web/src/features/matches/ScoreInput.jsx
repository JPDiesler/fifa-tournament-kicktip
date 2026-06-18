import { NumberField } from "@heroui/react";

// A single 0–99 score box. The surrounding app keeps scores as strings
// ("" = empty) to match the API payload shape; React Aria's NumberField
// represents "empty" with NaN, so we bridge between the two here.
export default function ScoreInput({ value, onChange, isDisabled, label }) {
  const num = value === "" || value === undefined || value === null ? NaN : Number(value);
  return (
    <NumberField
      aria-label={label}
      value={num}
      onChange={(v) =>
        onChange(v == null || Number.isNaN(v) ? "" : String(Math.max(0, Math.min(99, Math.trunc(v)))))
      }
      minValue={0}
      maxValue={99}
      isDisabled={isDisabled}
    >
      <NumberField.Group className="h-11 w-14 rounded-md border border-border bg-field transition-colors focus-within:border-accent has-[input:disabled]:opacity-40">
        <NumberField.Input
          inputMode="numeric"
          // Keep the field visible above the mobile keyboard (bottom-sheet would hide it).
          onFocus={(e) => { const el = e.target; setTimeout(() => el.scrollIntoView?.({ block: "center", behavior: "smooth" }), 300); }}
          className="h-full w-full bg-transparent text-center text-lg font-bold tabular-nums text-foreground outline-none"
        />
      </NumberField.Group>
    </NumberField>
  );
}
