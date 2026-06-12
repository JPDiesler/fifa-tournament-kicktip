import { useState, useEffect, useRef } from "react";
import { CalendarDays, CalendarClock, GitBranch, ListOrdered } from "lucide-react";
import { Tabs, Spinner } from "@heroui/react";
import { TEAMS, MATCHES, CHAMP_BONUS } from "./data.js";
import { api } from "./lib/api.js";
import { score, known } from "./lib/scoring.js";
import { getMe, getConfig, loginEntra, logout as apiLogout } from "./lib/auth.js";
import { initMsal, handleRedirect, RESUME_PICKER_KEY } from "./lib/msal.js";
import LoginScreen from "./components/LoginScreen.jsx";
import Navbar from "./components/Navbar.jsx";
import AdminModal from "./components/AdminModal.jsx";
import HelpModal from "./components/HelpModal.jsx";
import ChampionBar from "./components/ChampionBar.jsx";
import OpenTipsBanner from "./components/OpenTipsBanner.jsx";
import UpcomingTab from "./components/UpcomingTab.jsx";
import GroupStage from "./components/GroupStage.jsx";
import Bracket from "./components/Bracket.jsx";
import MatchDetail from "./components/MatchDetail.jsx";
import LeaderboardTab from "./components/LeaderboardTab.jsx";

const EMPTY_STATE = { tips: {}, champs: {}, results: {}, resolved: {}, championActual: "", meta: {}, locks: {} };
const GROUP_PHASES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tab, setTab] = useState("anstehend");
  const [st, setSt] = useState(EMPTY_STATE);
  const [board, setBoard] = useState([]);
  const [matchdays, setMatchdays] = useState([]);
  const [entra, setEntra] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [autoOpenEntra, setAutoOpenEntra] = useState(0);
  const [openMatchN, setOpenMatchN] = useState(null);
  const [toast, setToast] = useState("");
  const saveTimer = useRef({});

  const me = user?.kuerzel || null;

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
  // Background refresh while logged in.
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [user, me]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 1600); };

  const handleLoggedIn = async (u) => { setUser(u); await load(false); };
  const handleLogout = async () => { await apiLogout(); setUser(null); setAdminOpen(false); setSt(EMPTY_STATE); setBoard([]); setMatchdays([]); };

  // Effective team code / label per match side (K.o. sides are resolved by the API).
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
    flash("Sync läuft …");
    const r = await api("/sync", { method: "POST" });
    if (r.error) flash(r.error); else { await load(true); flash("Synchronisiert"); }
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
    ["anstehend", "Anstehend", CalendarClock],
    ["gruppen", "Gruppenphase", CalendarDays],
    ["ko", "K.O.", GitBranch],
    ["rang", "Rangliste", ListOrdered],
  ];

  return (
    <div className="min-h-dvh">
      <Navbar
        user={user}
        onLogout={handleLogout}
        isAdmin={user.isAdmin}
        onOpenAdmin={() => setAdminOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
      />

      <main className="mx-auto max-w-3xl px-3 pb-16">
        {!me && !user.isAdmin && (
          <div className="mt-3 rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
            Dir ist noch kein Kürzel zugewiesen – bitte den Admin kontaktieren, dann kannst du tippen.
          </div>
        )}

        {me && (
          <div className="mt-3">
            <OpenTipsBanner me={me} st={st} matches={MATCHES} teamCode={teamCode} onGoToUpcoming={() => setTab("anstehend")} />
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
          <Tabs.ListContainer className="sticky top-14 z-20 -mx-3 bg-background/90 px-3 py-2 backdrop-blur">
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
              st={st}
              teamLabel={teamLabel}
              teamCode={teamCode}
              score={score}
              onOpenMatch={setOpenMatchN}
            />
          </Tabs.Panel>

          <Tabs.Panel id="gruppen" className="pt-3">
            <GroupStage
              groupCodes={GROUP_PHASES}
              matches={MATCHES}
              teams={TEAMS}
              me={me}
              st={st}
              teamLabel={teamLabel}
              teamCode={teamCode}
              score={score}
              onOpenMatch={setOpenMatchN}
            />
          </Tabs.Panel>

          <Tabs.Panel id="ko" className="pt-3">
            <Bracket
              matches={MATCHES}
              me={me}
              st={st}
              teamLabel={teamLabel}
              teamCode={teamCode}
              score={score}
              onOpenMatch={setOpenMatchN}
            />
          </Tabs.Panel>

          <Tabs.Panel id="rang" className="pt-3">
            <LeaderboardTab totals={board} matchdays={matchdays} me={me} teams={TEAMS} championActual={st.championActual} />
          </Tabs.Panel>
        </Tabs>
      </main>

      <MatchDetail
        match={openMatchN != null ? MATCHES.find((m) => m.n === openMatchN) : null}
        isOpen={openMatchN != null}
        onClose={() => setOpenMatchN(null)}
        st={st}
        board={board}
        me={me}
        teamLabel={teamLabel}
        teamCode={teamCode}
        score={score}
        onTip={setTip}
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

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
