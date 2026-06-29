import { ComboBox, Input, ListBox } from "@heroui/react";

const NONE = "__none__";

// Searchable single-player picker (HeroUI ComboBox, filters by name). `players` = [{ p, name, … }].
// `noneLabel` adds a leading clear entry (→ onChange("")); `renderItem(p)` overrides the default
// name + Kürzel row (the ScoreTrend highlight picker passes coloured pills + AI badges).
export default function PlayerSelect({
  players, value, onChange, ariaLabel, placeholder = "Spieler …",
  noneLabel, renderItem, className = "w-full",
}) {
  return (
    <ComboBox
      aria-label={ariaLabel}
      selectedKey={value || null}
      onSelectionChange={(k) => onChange(k === NONE || k == null ? "" : String(k))}
      className={className}
    >
      <ComboBox.InputGroup>
        <Input placeholder={placeholder} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox>
          {noneLabel && <ListBox.Item id={NONE} textValue={noneLabel}>{noneLabel}<ListBox.ItemIndicator /></ListBox.Item>}
          {players.map((p) => (
            <ListBox.Item key={p.p} id={p.p} textValue={p.name}>
              {renderItem ? renderItem(p) : <>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-[10px] text-muted">{p.p}</span>
              </>}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
