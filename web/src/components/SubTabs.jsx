import { Tabs } from "@heroui/react";

// Secondary-level tab strip: more compact than the app's main pill nav and with a
// small-radius rectangular indicator instead of a pill, so a switch inside a view reads
// as one level down. `items` = [[key, label], …]; `onChange(key)` gets the string key.
export default function SubTabs({ items, value, onChange, ariaLabel, className }) {
  return (
    <Tabs selectedKey={value} onSelectionChange={(k) => onChange(String(k))} className={["w-fit", className].filter(Boolean).join(" ")}>
      <Tabs.ListContainer>
        <Tabs.List aria-label={ariaLabel} className="rounded-md p-1 *:h-7 *:rounded-md *:px-3 *:text-xs">
          {items.map(([k, l]) => (
            <Tabs.Tab key={k} id={k}>{l}<Tabs.Indicator className="rounded-md bg-surface" /></Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
