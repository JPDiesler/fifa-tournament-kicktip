# WM 2026 Tippspiel — Albert Weil

Selbst gehostetes Tippspiel: Vorrunde + K.o. mit Turnierbaum, Weltmeister-Bonus,
automatische Auswertung (klassisch 3/2/1, Weltmeister +10), **automatischer
Ergebnis- & Weltmeister-Abruf** und **Near-Live-Anzeige** (verzögerter Zwischenstand
+ Spielphase) während laufender Spiele. Dazu „Wo zu sehen" pro Spiel (deutsche Sender).

Ein Container: Express-Backend (API-Token bleibt serverseitig) + gebautes React-Frontend.
Daten liegen in **SQLite** im Volume `/data` — kein externer DB-Server nötig.

## Stack
- **Backend:** Express, better-sqlite3 (SQLite), node-cron; ESM. Session-Login
  (Cookie) für Basic- **und** Microsoft/Entra-Anmeldung.
- **Frontend:** React 19 + Vite 5, Tailwind v4, HeroUI v3 (beta).
- **Ergebnisquelle:** football-data.org (v4, kostenloser Tier) — Default;
  alternativ API-Football (`DATA_SOURCE=apifootball`).

## Schnellstart (Docker)

```bash
cp .env.example .env     # SESSION_SECRET, ADMIN_PASSWORD und FOOTBALL_DATA_TOKEN setzen
docker compose up -d --build
```

Läuft dann auf `http://<host>:5173` (Container-Port 8080 → Host 5173, siehe
`docker-compose.yml`). **Wichtig:** Bei Code-Änderungen immer mit `--build`
deployen — Frontend-Bundle und Backend werden ins Image gebaut; ein reines
`up -d` startet nur das alte Image neu.

Erst-Login als Admin mit `ADMIN_USERNAME` (Default `admin`) + `ADMIN_PASSWORD`.
Der Admin-Account ist Superadmin und **kein** Spieler. Im Admin-Bereich werden
Nutzer angelegt (Basic-Nutzer → Zugangsdaten-PDF, oder aus dem Entra-Verzeichnis
gewählt) und Kürzel vergeben.

## Authentifizierung
- **Basic:** Benutzername + Passwort (vom Admin angelegt, Passwort einmalig als PDF).
- **Microsoft/Entra (optional):** SPA-App-Registrierung (public client, PKCE),
  `ENTRA_TENANT_ID` + `ENTRA_CLIENT_ID` in `.env`. Ohne diese Werte erscheint nur
  der Basic-Login. Kein Client-Secret nötig (Login & Nutzerliste laufen delegiert).

## Ergebnis-Abruf (automatisch)
- Token bei football-data.org anlegen, in `.env` als `FOOTBALL_DATA_TOKEN` setzen
  (`FOOTBALL_DATA_COMPETITION=WC`). Free-Tier-Limit: **10 Calls/min**, kein Tageslimit.
- Der Sync holt **alle** Fixtures in **einem** Request. Gepollt wird **jede Minute**,
  aber nur solange ein Spiel läuft (Anpfiff → erwartetes Ende inkl. Halbzeit,
  Nachspielzeit, Verlängerung, Elfmeterschießen) → ~1 Call/min, weit unter dem Limit.
- **Endergebnisse, K.o.-Paarungen und der Weltmeister** werden automatisch gesetzt
  (kein Admin nötig). Zuordnung API-Spiel ↔ internes Spiel: Gruppenspiele über die
  (ungeordnete) Team-Paarung, K.o.-Spiele über die Anstoßzeit.
- **Near-Live:** Während des Spiels zeigt die App den (im Free-Tier **verzögerten**,
  ~3 Min) Zwischenstand + Phase — reine Anzeige, getrennt von der Punktewertung.

### Mehrere Datenquellen (Multi-Provider)
Pro **Provider** ein Adapter (`server/services/sources/*.adapter.js`), darüber ein
**Koordinations-Layer** (`coordinator.js`), der **pro Feature** (Ergebnisse, Live-Score,
Live-Spielminute, Spielphase, Torschützen, Karten) steuert, welche Quelle es liefert —
mit Priorität + Fallback. So lässt sich eine Quelle nutzen **oder** mehrere kombinieren
(z. B. Ergebnisse/Phase von football-data, Echtzeit-Minute/Torschützen/Karten von
API-Football). Konfiguration im **Web-Admin → „API & Ergebnisse"**: pro Provider Token +
Test, plus eine Feature-Routing-Matrix. Ohne Konfiguration = Einzel-Provider aus
`DATA_SOURCE` (Verhalten wie zuvor). Jeder Provider hat ein eigenes Rate-Budget;
Torschützen/Karten werden nur von einer **fähigen** Quelle und nur für laufende/gerade
beendete Spiele geholt (Cap via `DETAIL_MAX_PER_SYNC`).

## KI-Spieler (LLM-Tipper)
KI-Spieler nehmen wie menschliche Spieler am Tippspiel teil — sie werden regulär
gewertet und erscheinen überall mit **Kürzel + „KI"-Badge + Provider-Logo**.

- **Anlegen:** Web-Admin → **Nutzer → „KI-Spieler"**: Kürzel, Provider (Claude/OpenAI;
  Gemini/Mistral folgen), Modell (sinnvoller Default) und **API-Key**. Der Key wird
  **verschlüsselt** gespeichert (`AI_KEY_SECRET`, Fallback `SESSION_SECRET`), **nie** ans
  Frontend ausgeliefert und **nie** geloggt. Optionaler **Verbindungstest** beim Anlegen.
- **Tippen:** ein Scheduler (`AI_TIP_CRON`, jede Minute) legt pro Spiel **genau einen**
  Tipp ab — getriggert bei **Anpfiff − 10 min**, garantiert vor der 5-min-Sperre. Pro
  (KI-Spieler, Spiel) gibt es **höchstens einen LLM-Call** (DB-Unique-Constraint +
  „attempted"-Status). Bei Fehlschlag: kein Tipp (deterministischer Fallback optional via
  `AI_FALLBACK`). Zusätzlich ein einmaliger **Weltmeister-Tipp** vor K.o.-Start.
- **Modell:** je Spiel ein quell-abhängiges Daten-Bundle (api-football: Predictions/
  Poisson/Form/Lineups/Injuries · football-data: Tabellen/Form/H2H) → System-Prompt →
  kanonisches JSON (Dixon-Coles/EV-Maximierung). Prompts liegen extern in
  `server/prompts/*.md` und sind **ohne Rebuild** editierbar (mtime-Reload; per
  Bind-Mount, siehe `docker-compose.yml`).
- **Begründung:** Klick auf einen KI-Tipp öffnet die Analyse (deutsches Reasoning, λ,
  Wahrscheinlichkeiten, Konfidenz). Sichtbar erst **nach Anpfiff**
  (`AI_REASONING_VISIBLE_AFTER=kickoff|lock`), damit kein Tipp-Vorteil entsteht.

## „Wo zu sehen" (Deutschland)
Lineare Sender (ARD/ZDF/RTL/Sky/DAZN/Eurosport) werden aus einem deutschen
TV-Programm (XMLTV/EPG, `EPG_URL`) per Teamname + Anstoßzeit den Spielen zugeordnet;
reine Streaming-Dienste ohne EPG (MagentaTV/Prime/Netflix) regelt der declarative
Rechte-Layer `RIGHTS` in `server/services/broadcasts.js`. Täglicher Abgleich (`EPG_CRON`).

## Reverse Proxy → it.wm.albertweil.de

DNS: A/AAAA-Record `it.wm.albertweil.de` auf den Docker-Host. Dann z. B.:

**Caddy** (automatisches HTTPS):
```
it.wm.albertweil.de {
    reverse_proxy localhost:5173
}
```

**Nginx**:
```nginx
server {
    server_name it.wm.albertweil.de;
    location / { proxy_pass http://127.0.0.1:5173; proxy_set_header Host $host; }
}
```

`COOKIE_SECURE=auto` (Default) setzt das Session-Cookie nur über HTTPS „secure" —
lokal (http) und hinter dem HTTPS-Proxy funktioniert beides.

## Projektstruktur

```
server/
  index.js            Entry: Boot, Cron-Schedules, listen
  app.js              Express-App: Session, API-Router, Static/SPA
  config.js           Env-Konfiguration
  db.js               SQLite-Schema, Migrationen, Queries, Scoring-Aggregate
  data.js             Teams, Spielplan, Aliase (identisch zu web/src/data.js)
  routes/             auth · state · admin (Express-Router)
  middleware/auth.js  requireAuth/requireAdmin, Login-Helfer, Entra-Verify
  services/           sync · broadcasts · epg · poller · sources · locks · scoring · credentials · fixtures
web/
  src/
    app/              App.jsx, main.jsx, index.css
    features/         matches · broadcasts · leaderboard · champion · admin · auth
    components/       geteilte UI (Flag, PointsBadge, Logo, Navbar, HelpModal)
    lib/              api · scoring · matchtime  (cross-cutting; Import-Alias `@/…`)
    data.js, assets/  (Flaggen & Sender-Logos werden beim Build geladen)
  scripts/            download-flags.mjs, download-broadcasters.mjs (prebuild)
```

Frontend-Importe nutzen den `@/`-Alias (= `web/src/`, konfiguriert in `vite.config.js`
+ `jsconfig.json`).

## Spieler / Punkte anpassen
- Spielplan, Teams, Flaggen, Aliase: `server/data.js` **und** `web/src/data.js`
  (müssen identisch bleiben). Weltmeister-Bonus: `CHAMP_BONUS`.
- Punktelogik: `score()` — serverseitig in `server/services/scoring.js` (maßgeblich
  für die Rangliste), spiegelbildlich `web/src/lib/scoring.js` für die Anzeige.

## Lokal entwickeln

```bash
cd server && npm install && DATA_DIR=./data SESSION_SECRET=dev ADMIN_PASSWORD=test npm start  # :8080
cd web && npm install && npm run dev                                                          # :5173, /api → :8080
```

## Flaggen & Sender-Logos
Werden **beim Build** heruntergeladen (`web/scripts/download-flags.mjs` und
`download-broadcasters.mjs`, via `prebuild`) und lokal nach `web/src/assets/`
gelegt — kein Hotlink zur Laufzeit.
