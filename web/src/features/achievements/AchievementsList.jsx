import { useState } from "react";
import { Modal, Meter } from "@heroui/react";
import { Target, Crosshair, Sparkles, Flame, Zap, Trophy, Crown, Star, Gem, Swords, Wind, CalendarCheck, Lock, Check, Award } from "lucide-react";

// id → lucide icon (the server owns label/description/points; the web only maps the glyph).
const ICONS = {
  first_exact: Target, sharpshooter: Crosshair, clairvoyant: Sparkles,
  hot_streak: Flame, unstoppable: Zap, hattrick: Trophy,
  matchday_winner: Crown, perfect_day: Star, big_day: Gem,
  lone_wolf: Swords, against_the_grain: Wind, regular: CalendarCheck,
};
const iconOf = (id) => ICONS[id] || Award;

// Achievements & Streaks for the current player (st.achievements, server-computed). Badge
// grid with a "Meter bis zum Erreichen"; tap a badge for the full explanation + reward.
// Achievement points are points-relevant (folded into the leaderboard total).
export default function AchievementsList({ achievements = [] }) {
  const [openId, setOpenId] = useState(null);
  if (!achievements.length) return null;
  const unlocked = achievements.filter((a) => a.unlocked);
  const pts = unlocked.reduce((s, a) => s + a.points, 0);
  const open = achievements.find((a) => a.id === openId);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-muted">Erfolge</div>
        <div className="text-xs text-muted">
          <span className="font-semibold text-foreground">{unlocked.length}</span>/{achievements.length} · <span className="font-semibold text-success">+{pts}</span> Punkte
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {achievements.map((a) => {
          const I = iconOf(a.id), done = a.unlocked;
          return (
            <button key={a.id} type="button" onClick={() => setOpenId(a.id)}
              className={`flex flex-col gap-1.5 rounded-lg border p-2.5 text-left transition hover:border-app-accent/60 ${done ? "border-app-accent/40 bg-app-accent/5" : "border-border bg-overlay opacity-60"}`}>
              <div className="flex items-center justify-between">
                <I size={20} className={done ? "text-app-accent" : "text-muted"} />
                {done ? <Check size={14} className="text-success" /> : <Lock size={12} className="text-muted" />}
              </div>
              <div className="truncate text-xs font-semibold">{a.label}</div>
              <div className="flex items-center gap-1.5">
                <Meter aria-label={a.label} value={a.progress.current} maxValue={a.progress.target} size="sm" color={done ? "success" : "accent"} className="min-w-0 flex-1">
                  <Meter.Track><Meter.Fill /></Meter.Track>
                </Meter>
                <span className="shrink-0 text-[10px] tabular-nums text-muted">{a.progress.current}/{a.progress.target}</span>
              </div>
            </button>
          );
        })}
      </div>

      <Modal.Backdrop isOpen={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <Modal.Container placement="center">
          <Modal.Dialog className="w-full sm:max-w-[360px]">
            <Modal.CloseTrigger />
            {open && (() => {
              const I = iconOf(open.id), done = open.unlocked;
              return (
                <>
                  <Modal.Header>
                    <Modal.Heading className="flex items-center gap-2">
                      <I size={20} className={done ? "text-app-accent" : "text-muted"} /> {open.label}
                    </Modal.Heading>
                  </Modal.Header>
                  <Modal.Body>
                    <div className="flex flex-col gap-3 text-sm">
                      <p className="text-muted">{open.description}</p>
                      <div className="flex items-center gap-2">
                        <Meter aria-label={open.label} value={open.progress.current} maxValue={open.progress.target} size="md" color={done ? "success" : "accent"} className="min-w-0 flex-1">
                          <Meter.Track><Meter.Fill /></Meter.Track>
                        </Meter>
                        <span className="shrink-0 text-xs tabular-nums">{open.progress.current} / {open.progress.target}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border bg-overlay p-2 text-xs">
                        <span className="text-muted">Belohnung</span>
                        <span className="font-semibold text-success">+{open.points} {open.points === 1 ? "Punkt" : "Punkte"}</span>
                      </div>
                      <div className={`text-center text-xs font-semibold ${done ? "text-success" : "text-muted"}`}>
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
    </div>
  );
}
