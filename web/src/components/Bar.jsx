import { Meter } from "@heroui/react";

// Thin coloured bar built on the HeroUI Meter component (a fractional value in 0–100).
// `fill` sets the filled portion's colour, `track` the remainder — pass both for a
// two-tone home/away bar, or only `fill` for a single value on the neutral track.
export default function Bar({ value, fill, track, size = "sm", className = "", label = "Wert" }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <Meter aria-label={label} value={v} size={size} className={`w-full ${className}`}>
      <Meter.Track style={track ? { background: track } : undefined}>
        <Meter.Fill style={fill ? { background: fill } : undefined} />
      </Meter.Track>
    </Meter>
  );
}
