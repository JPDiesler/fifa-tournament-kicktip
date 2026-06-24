import { useState } from "react";
import { Accordion, Modal, Meter } from "@heroui/react";
import {
  Target, Crosshair, Sparkles, Flame, Zap, Trophy, Crown, Star, Gem, Swords, Wind, CalendarCheck,
  Frown, CloudRain, Snowflake, XCircle, CircleOff, CloudLightning, PowerOff, CalendarX, ThumbsDown, Footprints, TriangleAlert, Bomb,
  Lock, Check, Award,
} from "lucide-react";

// id → lucide icon (the server owns kind/label/description/points; the web only maps the glyph).
const ICONS = {
  // wins
  first_exact: Target, sharpshooter: Crosshair, clairvoyant: Sparkles,
  hot_streak: Flame, unstoppable: Zap, hattrick: Trophy,
  matchday_winner: Crown, perfect_day: Star, big_day: Gem,
  lone_wolf: Swords, against_the_grain: Wind, regular: CalendarCheck,
  // fails
  first_zero: Frown, cold_streak: CloudRain, ice_cold: Snowflake,
  zero_collector: XCircle, black_hole: CircleOff, washout: CloudLightning,
  total_blackout: PowerOff, cellar_regular: CalendarX, lone_loser: ThumbsDown,
  herd: Footprints, false_start: TriangleAlert, anti_talent: Bomb,
};
const iconOf = (id) => ICONS[id] || Award;
// tint per kind: wins = accent, fails = amber (the "Trostpreis" equalizer)
const TONE = {
  win: { border: "border-app-accent/40 bg-app-accent/5", icon: "text-app-accent", meter: "success", pts: "text-success" },
  fail: { border: "border-amber-500/40 bg-amber-500/5", icon: "text-amber-400", meter: "warning", pts: "text-amber-400" },
};
const toneOf = (k) => TONE[k] || TONE.win;
const GROUPS = [["win", "Erfolge"], ["fail", "Pleiten & Pannen"]];

// Achievements & Streaks for the current player (st.achievements, server-computed). Two grouped
// badge grids (Erfolge / Pleiten) with a "Meter bis zum Erreichen"; tap a badge for the full
// explanation + reward. Achievement points are points-relevant (folded into the leaderboard).
export default function AchievementsList({ achievements = [] }) {
  const [openId, setOpenId] = useState(null);
  if (!achievements.length) return null;
  const open = achievements.find((a) => a.id === openId);
  const total = achievements.length, got = achievements.filter((a) => a.unlocked).length;
  const pct = total ? (got / total) * 100 : 0;

  return (
    <>
      {/* collapsed by default — a compact summary row with a progress bar (e.g. 15/24) */}
      <Accordion variant="surface" className="rounded-2xl">
        <Accordion.Item id="achievements">
          <Accordion.Heading>
            <Accordion.Trigger>
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className="shrink-0 text-sm font-semibold">Abzeichen</span>
                <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-overlay" aria-hidden>
                  <span className="absolute inset-y-0 left-0 rounded-full bg-app-accent" style={{ width: `${pct}%` }} />
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{got}/{total}</span>
              </span>
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body className="space-y-4">
              {GROUPS.map(([kind, title]) => {
                const items = achievements.filter((a) => (a.kind || "win") === kind);
                if (!items.length) return null;
                const unlocked = items.filter((a) => a.unlocked);
                const pts = unlocked.reduce((s, a) => s + a.points, 0);
                const tone = toneOf(kind);
                return (
                  <div key={kind}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[11px] uppercase tracking-wider text-muted">{title}</div>
                      <div className="text-xs text-muted">
                        <span className="font-semibold text-foreground">{unlocked.length}</span>/{items.length} · <span className={`font-semibold ${tone.pts}`}>+{pts}</span> Punkte
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {items.map((a) => {
                        const I = iconOf(a.id), done = a.unlocked;
                        return (
                          <button key={a.id} type="button" onClick={() => setOpenId(a.id)}
                            className={`flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition hover:border-app-accent/60 ${done ? tone.border : "border-border bg-overlay opacity-60"}`}>
                            <div className="flex items-center justify-between">
                              <I size={20} className={done ? tone.icon : "text-muted"} />
                              {done ? <Check size={14} className={tone.pts} /> : <Lock size={12} className="text-muted" />}
                            </div>
                            <div className="truncate text-xs font-semibold">{a.label}</div>
                            <div className="flex items-center gap-1.5">
                              <Meter aria-label={a.label} value={a.progress.current} maxValue={a.progress.target} size="sm" color={done ? tone.meter : "accent"} className="min-w-0 flex-1">
                                <Meter.Track><Meter.Fill /></Meter.Track>
                              </Meter>
                              <span className="shrink-0 text-[10px] tabular-nums text-muted">{a.progress.current}/{a.progress.target}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Modal.Backdrop isOpen={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <Modal.Container placement="center">
          <Modal.Dialog className="w-full sm:max-w-[360px]">
            <Modal.CloseTrigger />
            {open && (() => {
              const I = iconOf(open.id), done = open.unlocked, tone = toneOf(open.kind);
              return (
                <>
                  <Modal.Header>
                    <Modal.Heading className="flex items-center gap-2">
                      <I size={20} className={done ? tone.icon : "text-muted"} /> {open.label}
                    </Modal.Heading>
                  </Modal.Header>
                  <Modal.Body>
                    <div className="flex flex-col gap-3 text-sm">
                      <p className="text-muted">{open.description}</p>
                      {open.streak && (
                        <p className="text-xs text-muted">
                          {open.unlocked
                            ? "🔒 Serien-Erfolg — geschafft und dauerhaft gesichert."
                            : `🔥 Serien-Erfolg: zählt nur in Folge — reißt die Serie, beginnt die Zählung neu. Aktuell: ${open.current}/${open.progress.target}.`}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <Meter aria-label={open.label} value={open.progress.current} maxValue={open.progress.target} size="md" color={done ? tone.meter : "accent"} className="min-w-0 flex-1">
                          <Meter.Track><Meter.Fill /></Meter.Track>
                        </Meter>
                        <span className="shrink-0 text-xs tabular-nums">{open.progress.current} / {open.progress.target}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-overlay p-2 text-xs">
                        <span className="text-muted">{open.kind === "fail" ? "Trostpreis" : "Belohnung"}</span>
                        <span className={`font-semibold ${tone.pts}`}>+{open.points} {open.points === 1 ? "Punkt" : "Punkte"}</span>
                      </div>
                      <div className={`text-center text-xs font-semibold ${done ? tone.pts : "text-muted"}`}>
                        {done ? "✓ Freigeschaltet" : "Noch nicht freigeschaltet"}
                      </div>
                    </div>
                  </Modal.Body>
                </>
              );
            })()}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
