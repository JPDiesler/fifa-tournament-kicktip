import { useState, useEffect, useRef, useMemo } from "react";
import { CalendarDays, CalendarClock, GitBranch, ListOrdered } from "lucide-react";
import { Tabs, Spinner, Toast, toast } from "@heroui/react";
import { TEAMS, MATCHES, CHAMP_BONUS } from "@/data";
import { api } from "@/lib/api.js";
import { score, known } from "@/lib/scoring.js";
import { getMe, getConfig, loginEntra, logout as apiLogout } from "@/features/auth/auth.js";
import { initMsal, handleRedirect, RESUME_PICKER_KEY } from "@/features/auth/msal.js";
import LoginScreen from "@/features/auth/LoginScreen.jsx";
import Navbar from "@/components/Navbar.jsx";
import AdminModal from "@/features/admin/AdminModal.jsx";
import HelpModal from "@/components/HelpModal.jsx";
import ChampionBar from "@/features/champion/ChampionBar.jsx";
import OpenTipsBanner from "@/features/matches/OpenTipsBanner.jsx";
import UpcomingTab from "@/features/matches/UpcomingTab.jsx";
import GroupStage from "@/features/matches/GroupStage.jsx";
import Bracket from "@/features/matches/Bracket.jsx";
import MatchDetail from "@/features/matches/MatchDetail.jsx";
import BroadcastDrawer from "@/features/broadcasts/BroadcastDrawer.jsx";
import LeaderboardTab from "@/features/leaderboard/LeaderboardTab.jsx";
import { PlayersContext } from "@/components/PlayerName.jsx";

const EMPTY_STATE = { tips: {}, champs: {}, results: {}, resolved: {}, live: {}, broadcasts: {}, details: {}, players: {}, championActual: "", capabilities: null, meta: {}, locks: {} };
const GROUP_PHASES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

// --- Debug-only: preview the penalty-shootout display without a real K.o. match. Open the
// app with ?debugpen=1 (persisted in localStorage; ?debugpen=0 turns it off). It fakes a LIVE
// shootout on the next unplayed match + a finished shootout on the last played one, purely for
// rendering — never touches the server, so the sync can't overwrite it. Off by default (no-op).
const DEBUG_PEN = (() => {
  try {
    const v = new URLSearchParams(window.location.search).get("debugpen");
    if (v != null) localStorage.setItem("debugpen", v === "0" ? "0" : "1");
    return localStorage.getItem("debugpen") === "1";
  } catch { return false; }
})();
const O = (s) => ({ scored: s }); // debug-kick helper: O(true)=scored, O(false)=missed
function withDebugPen(st) {
  if (!DEBUG_PEN) return st;
  const played = (n) => { const r = st.results?.[n]; return !!(r && r.h !== "" && r.a !== ""); };
  const next = MATCHES.find((m) => !played(m.n));     // → fake an IN-PROGRESS shootout
  const done = [...MATCHES].reverse().find((m) => played(m.n)); // → fake a FINISHED shootout
  const live = { ...st.live }, details = { ...st.details };
  if (next) {
    details[next.n] = { ...(details[next.n] || {}), shootout: { home: [O(true), O(true), O(false), O(true)], away: [O(true), O(false), O(true)] } };
    live[next.n] = { h: "1", a: "1", phase: "PEN", minute: 120, injury: null, asOf: Date.now(), pen: { home: "3", away: "2" } };
  }
  if (done) {
    details[done.n] = { ...(details[done.n] || {}), shootout: { home: [O(true), O(true), O(true), O(false), O(true)], away: [O(true), O(false), O(true), O(true), O(false)] }, pen: { home: "4", away: "3" } };
  }
  return { ...st, live, details };
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tab, setTab] = useState("anstehend");
  const [st, setSt] = useState(EMPTY_STATE);
  const stView = useMemo(() => withDebugPen(st), [st]); // debug-pen overlay (no-op unless ?debugpen=1)
  const [board, setBoard] = useState([]);
  const [matchdays, setMatchdays] = useState([]);
  const [entra, setEntra] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [autoOpenEntra, setAutoOpenEntra] = useState(0);
  const [openMatchN, setOpenMatchN] = useState(null);
  const [broadcastN, setBroadcastN] = useState(null);
  const saveTimer = useRef({});

  const me = user?.kuerzel || null;
  const hasLive = Object.keys(st.live || {}).length > 0; // any match currently in play?

  const load = async (keepMine = true) => {
    try {
      const r = await fetch("/api/state");
      if (r.status === 401) { setUser(null); setAdminOpen(false); return; }
      if (!r.ok) return;
      const s = await r.json();
      setSt((prev) => {
        const next = { ...EMPTY_STATE, ...(s && typeof s === "object" ? s : {}) };
        next.tips = { ...(next.tips || {}) };
        if (keepMine && me && prev.tips[me]) next.tips[me] = prev.tips[me];
        return next;
      });
      const lb = await fetch("/api/leaderboard");
      if (lb.ok) setBoard(await lb.json());
      const md = await fetch("/api/matchdays");
      if (md.ok) setMatchdays(await md.json());
    } catch {}
  };

  // Initial auth check + runtime config + Microsoft redirect handling.
  useEffect(() => {
    (async () => {
      let cfg = null;
      try { cfg = await getConfig(); } catch {}
      setEntra(cfg?.entra || null);
      if (cfg?.accent) document.documentElement.style.setProperty("--app-accent", cfg.accent);

      let signedIn = null;
      if (cfg?.entra) {
        try {
          await initMsal(cfg.entra);
          const res = await handleRedirect();
          if (res?.kind === "login" && res.idToken) signedIn = await loginEntra(res.idToken);
          // res.kind === "graph": token is cached by MSAL; the picker resumes below.
        } catch (e) { console.error("Microsoft-Login:", e.message); setLoginError(e.message); }
      }

      const u = signedIn || (await getMe());
      setUser(u);
      if (u) await load(false);
      if (u?.isAdmin && sessionStorage.getItem(RESUME_PICKER_KEY)) {
        sessionStorage.removeItem(RESUME_PICKER_KEY);
        setAdminOpen(true); setAutoOpenEntra(Date.now()); // resume the Entra picker after the MSAL redirect
      }
      setAuthChecked(true);
    })();
  }, []);
  // Background refresh while logged in (fallback / live-minute ticking).
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [user, me]);
  // Near-real-time: a Web Push (goal/kickoff/final) makes the service worker tell
  // open windows to refresh immediately — no waiting for the 30s poll.
  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return;
    const onMsg = (e) => { if (e.data?.type === "wm-refresh") load(true); };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [user, me]);
  // Live sync: while a match runs, subscribe to the SSE stream (scores/minute/phase/
  // odds + serverNow) so the local match clock re-anchors continuously and stays
  // drift-free across devices. Falls back to polling /api/live every 5s if the stream
  // can't be established (e.g. a buffering proxy). Only active while something is live.
  useEffect(() => {
    if (!user || !hasLive) return;
    const applyLive = (p) => { if (p?.live) setSt((prev) => ({ ...prev, live: p.live, locks: { ...prev.locks, serverNow: p.serverNow ?? prev.locks?.serverNow } })); };
    let es = null, pollTimer = null, openTimer = null, opened = false, stopped = false;
    const startPoll = () => {
      if (pollTimer || stopped) return;
      const tick = async () => { try { const r = await fetch("/api/live"); if (r.ok) applyLive(await r.json()); } catch {} };
      tick();
      pollTimer = setInterval(tick, 5000);
    };
    try {
      es = new EventSource("/api/live/stream");
      es.onopen = () => { opened = true; };
      es.onmessage = (e) => { try { applyLive(JSON.parse(e.data)); } catch {} };
      es.onerror = () => { if (!opened) { try { es.close(); } catch {} es = null; startPoll(); } }; // never connected → poll
      openTimer = setTimeout(() => { if (!opened) { try { es?.close(); } catch {} es = null; startPoll(); } }, 8000);
    } catch { startPoll(); }
    return () => { stopped = true; clearTimeout(openTimer); try { es?.close(); } catch {} clearInterval(pollTimer); };
  }, [user, hasLive]);

  const flash = (m) => toast(m, { variant: "success" }); // action-completed confirmation

  const handleLoggedIn = async (u) => { setUser(u); await load(false); };
  const handleLogout = async () => { await apiLogout(); setUser(null); setAdminOpen(false); setSt(EMPTY_STATE); setBoard([]); setMatchdays([]); };

  // Effective team code / label per match side. K.o. sides are filled by api-football
  // (st.resolved); until then the slot shows its placeholder ("Sieger Gruppe A").
  const teamCode = (m, side) => {
    const r = st.resolved[m.n];
    const rc = r && (side === "h" ? r.homeCode : r.awayCode);
    if (rc) return rc;
    const own = side === "h" ? m.h : m.a;
    return known(own) ? own : null;
  };
  const teamLabel = (m, side) => {
    const code = teamCode(m, side);
    if (code) return TEAMS[code].name;
    const r = st.resolved[m.n];
    const rn = r && (side === "h" ? r.homeName : r.awayName);
    return rn || (side === "h" ? m.h : m.a);
  };
  // A pairing is fixed (tippable) only when BOTH sides are known.
  const isConfirmed = (m) => !!(teamCode(m, "h") && teamCode(m, "a"));

  const setTip = (n, side, val) => {
    setSt((prev) => {
      const mine = { ...(prev.tips[me] || {}) };
      mine[n] = { h: "", a: "", ...(mine[n] || {}), [side]: val };
      const tips = { ...prev.tips, [me]: mine };
      clearTimeout(saveTimer.current.tips);
      saveTimer.current.tips = setTimeout(() => {
        api("/tips", { method: "POST", body: JSON.stringify({ tips: mine }) }).then(() => flash("Tipp gespeichert"));
      }, 500);
      return { ...prev, tips };
    });
  };
  const setChamp = (code) => {
    setSt((prev) => ({ ...prev, champs: { ...prev.champs, [me]: code } }));
    api("/champ", { method: "POST", body: JSON.stringify({ code }) }).then(() => flash("Weltmeister-Tipp gespeichert"));
  };
  const doSync = async () => {
    try {
      await toast.promise(
        (async () => { const r = await api("/sync", { method: "POST" }); if (r?.error) throw new Error(r.error); await load(true); })(),
        { loading: "Synchronisiere …", success: "Synchronisiert", error: (e) => e?.message || "Sync fehlgeschlagen" },
      );
    } catch { /* the error toast already surfaced it */ }
  };

  if (!authChecked) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 text-muted">
        <Spinner size="lg" />
        <span className="text-sm">Lade Tippspiel …</span>
      </div>
    );
  }
  if (!user) return <LoginScreen onLoggedIn={handleLoggedIn} initialError={loginError} />;

  const TABS = [
    ["anstehend", "Chronologisch", CalendarClock],
    ["gruppen", "Gruppenphase", CalendarDays],
    ["ko", "K.O.", GitBranch],
    ["rang", "Punktstand", ListOrdered],
  ];

  return (
    <PlayersContext.Provider value={st.players || {}}>
    <div className="min-h-dvh">
      <Navbar
        user={user}
        onLogout={handleLogout}
        isAdmin={user.isAdmin}
        onOpenAdmin={() => setAdminOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        onFlash={flash}
      />

      <main className="mx-auto max-w-3xl px-3 pb-16">
        {!me && !user.isAdmin && (
          <div className="mt-3 rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
            Dir ist noch kein Kürzel zugewiesen – bitte den Admin kontaktieren, dann kannst du tippen.
          </div>
        )}

        {me && (
          <div className="mt-3">
            <OpenTipsBanner me={me} st={stView} matches={MATCHES} isConfirmed={isConfirmed} onGoToUpcoming={() => setTab("anstehend")} />
          </div>
        )}

        <div className="mt-3">
          <ChampionBar
            me={me}
            teams={TEAMS}
            champ={me ? (st.champs[me] || "") : ""}
            onSetChamp={setChamp}
            championActual={st.championActual}
            champBonus={CHAMP_BONUS}
            champLocked={!!st.locks?.champLocked}
            champs={st.champs}
            board={board}
          />
        </div>

        <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(String(k))} className="mt-3">
          <Tabs.ListContainer className="top-safe-nav sticky z-20 -mx-3 bg-background/90 px-3 py-2 backdrop-blur">
            <Tabs.List aria-label="Ansicht" className="w-full">
              {TABS.map(([id, label, Icon]) => (
                <Tabs.Tab key={id} id={id} className="flex flex-1 items-center justify-center gap-1.5">
                  <Icon size={16} />
                  <span className="hidden sm:inline">{label}</span>
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="anstehend" className="pt-3">
            <UpcomingTab
              matches={MATCHES}
              me={me}
              st={stView}
              teamLabel={teamLabel}
              teamCode={teamCode}
              isConfirmed={isConfirmed}
              score={score}
              onOpenMatch={setOpenMatchN}
              onOpenBroadcasts={setBroadcastN}
            />
          </Tabs.Panel>

          <Tabs.Panel id="gruppen" className="pt-3">
            <GroupStage
              groupCodes={GROUP_PHASES}
              matches={MATCHES}
              teams={TEAMS}
              me={me}
              st={stView}
              teamLabel={teamLabel}
              teamCode={teamCode}
              score={score}
              onOpenMatch={setOpenMatchN}
              onOpenBroadcasts={setBroadcastN}
            />
          </Tabs.Panel>

          <Tabs.Panel id="ko" className="pt-3">
            <Bracket
              matches={MATCHES}
              me={me}
              st={stView}
              teamLabel={teamLabel}
              teamCode={teamCode}
              isConfirmed={isConfirmed}
              score={score}
              onOpenMatch={setOpenMatchN}
            />
          </Tabs.Panel>

          <Tabs.Panel id="rang" className="pt-3">
            <LeaderboardTab totals={board} matchdays={matchdays} me={me} st={stView} teams={TEAMS} championActual={st.championActual} teamLabel={teamLabel} />
          </Tabs.Panel>
        </Tabs>
      </main>

      <MatchDetail
        match={openMatchN != null ? MATCHES.find((m) => m.n === openMatchN) : null}
        isOpen={openMatchN != null}
        onClose={() => setOpenMatchN(null)}
        st={stView}
        board={board}
        me={me}
        teamLabel={teamLabel}
        teamCode={teamCode}
        isConfirmed={isConfirmed}
        score={score}
        onTip={setTip}
      />

      <BroadcastDrawer
        isOpen={broadcastN != null}
        onClose={() => setBroadcastN(null)}
        keys={broadcastN != null ? (st.broadcasts?.[broadcastN] || []) : []}
        title={broadcastN != null ? `Spiel ${broadcastN}` : ""}
      />

      {user.isAdmin && (
        <AdminModal
          isOpen={adminOpen}
          onClose={() => setAdminOpen(false)}
          onSync={doSync}
          syncMsg={st.meta.lastSyncMsg}
          lastSync={st.meta.lastSync}
          entra={entra}
          meId={user.id}
          onFlash={flash}
          autoOpenEntra={autoOpenEntra}
        />
      )}

      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        champBonus={CHAMP_BONUS}
        lockOffsetMin={st.locks?.offsetMin || 5}
        isAdmin={user.isAdmin}
      />

      <Toast.Provider placement="bottom" />
    </div>
    </PlayersContext.Provider>
  );
}
