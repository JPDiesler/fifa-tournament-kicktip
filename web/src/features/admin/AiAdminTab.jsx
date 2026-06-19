import { useEffect, useState } from "react";
import { Tabs, Table, Button, Switch, Chip, Spinner, Select, ListBox, AlertDialog } from "@heroui/react";
import { Bot, Pencil, Trash2, KeyRound, Users } from "lucide-react";
import Notice from "@/components/Notice.jsx";
import ProviderLogo from "@/components/ProviderLogo.jsx";
import DataTable from "@/components/DataTable.jsx";
import AiPlayerModal from "./AiPlayerModal.jsx";
import ProvidersPanel from "./ProvidersPanel.jsx";
import { listAiPlayers, patchAiPlayer, deleteUser, setAiConfig, getAiRanking } from "./admin.js";

// "KI"-Admin tab, split into two sub-tabs: Provider (one API key per provider + status/
// usage/cost/error log) and Player (AI-player management + calibration ranking).
export default function AiAdminTab({ onFlash }) {
  const [tab, setTab] = useState("provider");
  const [data, setData] = useState(null); // { providers, players, config }
  const [ranking, setRanking] = useState([]);
  const [reasoningMode, setReasoningMode] = useState("kickoff");
  const [aiTarget, setAiTarget] = useState(undefined); // undefined=closed | null=create | player=edit
  const [err, setErr] = useState("");

  const load = async () => {
    try { const d = await listAiPlayers(); setData(d); setReasoningMode(d.config?.reasoningVisibleAfter || "kickoff"); setErr(""); }
    catch (e) { setErr(e.message); }
    getAiRanking().then((r) => setRanking(r.ranking || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const flash = (m) => onFlash?.(m);
  const toggleActive = async (p, v) => { try { await patchAiPlayer(p.id, { isActive: v }); load(); } catch (e) { setErr(e.message); load(); } };
  const doDelete = async (p) => { try { await deleteUser(p.id); flash("KI-Spieler gelöscht"); load(); } catch (e) { setErr(e.message); } };

  const players = data?.players || [];
  const providerOpts = (data?.providers || []).map((p) => ({ value: p.id, label: p.name }));

  const playerColumns = [
    { key: "kuerzel", header: "Kürzel", isRowHeader: true, sortable: true, sort: (p) => p.kuerzel || "", render: (p) => (<><Chip size="sm" variant="soft">{p.kuerzel}</Chip>{p.name && <div className="mt-0.5 text-xs text-muted">{p.name}</div>}</>) },
    {
      key: "provider", header: "Provider · Modell", sortable: true, sort: (p) => p.provider || "",
      filter: { label: "Provider", options: providerOpts, match: (p, v) => p.provider === v },
      render: (p) => <span className="flex items-center gap-1 text-xs text-muted"><ProviderLogo provider={p.provider} size={14} /> {p.provider}{p.model ? ` · ${p.model}` : ""}{!p.hasKey && <span className="text-danger" title="Provider hat keinen Key">· kein Key</span>}</span>,
    },
    {
      key: "status", header: "Status · Tipps", sortable: true, sort: (p) => p.done,
      render: (p) => (
        <span className="flex items-center gap-1.5 text-xs" title={p.testOk === true ? "Verbindung ok" : p.testOk === false ? "Verbindung fehlgeschlagen" : "ungetestet"}>
          <span className={`size-2 rounded-full ${p.testOk === true ? "bg-success" : p.testOk === false ? "bg-danger" : "bg-muted/40"}`} />
          <span className="tabular-nums text-muted">{p.done}/{p.total}</span>
        </span>
      ),
    },
    { key: "active", header: "Aktiv", render: (p) => <Switch size="sm" aria-label="Aktiv" isSelected={p.isActive} onChange={(v) => toggleActive(p, v)}><Switch.Control><Switch.Thumb /></Switch.Control></Switch> },
    {
      key: "actions", header: "", render: (p) => (
        <div className="flex items-center gap-1">
          <Button aria-label="Bearbeiten" variant="tertiary" size="sm" isIconOnly onPress={() => setAiTarget(p)}><Pencil size={14} /></Button>
          <AlertDialog>
            <Button aria-label="Löschen" variant="tertiary" size="sm" isIconOnly><Trash2 size={14} /></Button>
            <AlertDialog.Backdrop><AlertDialog.Container><AlertDialog.Dialog className="sm:max-w-[400px]">
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header><AlertDialog.Icon status="danger" /><AlertDialog.Heading>KI-Spieler löschen?</AlertDialog.Heading></AlertDialog.Header>
              <AlertDialog.Body><p>„{p.kuerzel}" wird dauerhaft gelöscht (inkl. aller Tipps).</p></AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">Abbrechen</Button>
                <Button slot="close" variant="danger" onPress={() => doDelete(p)}>Löschen</Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog></AlertDialog.Container></AlertDialog.Backdrop>
          </AlertDialog>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Notice>{err}</Notice>
      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))}>
        <Tabs.ListContainer>
          <Tabs.List aria-label="KI" className="w-full">
            <Tabs.Tab id="provider" className="flex flex-1 items-center justify-center gap-1.5"><KeyRound size={15} /> Provider <Tabs.Indicator /></Tabs.Tab>
            <Tabs.Tab id="player" className="flex flex-1 items-center justify-center gap-1.5"><Users size={15} /> Spieler <Tabs.Indicator /></Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="provider" className="pt-4">
          <ProvidersPanel onFlash={onFlash} />
        </Tabs.Panel>

        <Tabs.Panel id="player" className="flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-sm font-bold uppercase tracking-wider text-muted">KI-Spieler</h2>
            <Button variant="primary" size="sm" onPress={() => setAiTarget(null)}><Bot size={15} /> KI-Spieler hinzufügen</Button>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              Begründung ab
              <Select aria-label="KI-Begründung sichtbar ab" className="w-32" value={reasoningMode}
                onChange={async (v) => { const m = String(v); setReasoningMode(m); try { await setAiConfig({ reasoningVisibleAfter: m }); } catch (e) { setErr(e.message); } }}>
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover><ListBox>
                  <ListBox.Item id="kickoff" textValue="Anpfiff">Anpfiff<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item id="lock" textValue="Tipp-Sperre">Tipp-Sperre<ListBox.ItemIndicator /></ListBox.Item>
                </ListBox></Select.Popover>
              </Select>
            </div>
          </div>

          {!data ? <div className="flex justify-center py-8"><Spinner /></div> : players.length === 0 ? (
            <p className="rounded-lg border border-border bg-overlay p-4 text-center text-sm text-muted">Noch keine KI-Spieler. Über „KI-Spieler hinzufügen" anlegen.</p>
          ) : (
            <DataTable columns={playerColumns} rows={players} rowKey={(p) => String(p.id)}
              search={(p) => `${p.kuerzel || ""} ${p.name || ""} ${p.provider || ""} ${p.model || ""}`}
              searchPlaceholder="KI-Spieler suchen …" ariaLabel="KI-Spieler" empty="Keine KI-Spieler." />
          )}

          <div>
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Kalibrierungs-Ranking</div>
            <p className="mb-1.5 text-[11px] text-muted">Brier-Score: wie gut die 1X2-Wahrscheinlichkeiten zu den Ergebnissen passen (niedriger = besser). Treffer = wahrscheinlichster Ausgang traf ein.</p>
            {ranking.length === 0 ? (
              <p className="rounded-lg border border-border bg-overlay p-3 text-center text-xs text-muted">Noch keine gewerteten KI-Tipps.</p>
            ) : (
              <Table variant="primary" aria-label="Kalibrierungs-Ranking">
                <Table.ScrollContainer>
                  <Table.Content aria-label="Kalibrierungs-Ranking">
                    <Table.Header>
                      <Table.Column isRowHeader>#</Table.Column>
                      <Table.Column>KI</Table.Column>
                      <Table.Column>Brier ↓</Table.Column>
                      <Table.Column>Treffer</Table.Column>
                      <Table.Column>Ø Pkt</Table.Column>
                      <Table.Column>n</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {ranking.map((r, i) => (
                        <Table.Row key={r.kuerzel} id={r.kuerzel}>
                          <Table.Cell className="font-bold text-muted">{i + 1}</Table.Cell>
                          <Table.Cell><span className="flex items-center gap-1.5"><ProviderLogo provider={r.provider} size={13} /> <span className="font-semibold">{r.kuerzel}</span></span></Table.Cell>
                          <Table.Cell className="tabular-nums">{r.brier ?? "—"}</Table.Cell>
                          <Table.Cell className="tabular-nums">{r.hitRate != null ? `${r.hitRate}%` : "—"}</Table.Cell>
                          <Table.Cell className="tabular-nums">{r.avgPoints ?? "—"}</Table.Cell>
                          <Table.Cell className="tabular-nums text-muted">{r.n}</Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            )}
          </div>
        </Tabs.Panel>
      </Tabs>

      <AiPlayerModal open={aiTarget !== undefined} player={aiTarget || null} providers={data?.providers || []}
        onOpenChange={(o) => !o && setAiTarget(undefined)} onSaved={load} />
    </div>
  );
}
