import { ComboBox, Input, ListBox } from "@heroui/react";
import Flag from "./Flag.jsx";

const NONE = "__none__";

// Searchable team picker with flags (HeroUI ComboBox; filters by team name).
export default function TeamSelect({ label, placeholder, value, onChange, isDisabled, teams }) {
  const codes = Object.keys(teams).sort((a, b) => teams[a].name.localeCompare(teams[b].name));
  return (
    <ComboBox
      aria-label={label}
      selectedKey={value || null}
      isDisabled={isDisabled}
      onSelectionChange={(k) => onChange(k === NONE || k == null ? "" : k)}
      className="w-full"
    >
      <ComboBox.InputGroup>
        <Input placeholder={placeholder} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover>
        <ListBox>
          <ListBox.Item id={NONE} textValue={placeholder}>{placeholder}<ListBox.ItemIndicator /></ListBox.Item>
          {codes.map((c) => (
            <ListBox.Item key={c} id={c} textValue={teams[c].name}>
              <Flag code={c} />
              {teams[c].name}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
