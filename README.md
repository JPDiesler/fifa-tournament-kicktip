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
- **Ergebnisquelle:** API-Football (api-sports.io) — einzige Quelle; Season 2026
  erfordert einen kostenpflichtigen Plan.

## Schnellstart (Docker)

```bash
cp .env.example .env     # SESSION_SECRET, ADMIN_PASSWORD und API_FOOTBALL_KEY setzen
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
- API-Sports-Key bei <https://dashboard.api-football.com> anlegen, in `.env` als
  `API_FOOTBALL_KEY` setzen (`API_LEAGUE=1`, `API_SEASON=2026`) — auch im Web-Admin
  setzbar. Rate-/Tageslimit (`API_RATE_LIMIT`/`API_DAILY_LIMIT`) an den Plan anpassen.
- Der Sync holt **alle** Fixtures in **einem** Request. Gepollt wird, solange ein Spiel
  läuft (Anpfiff → erwartetes Ende inkl. Halbzeit, Nachspielzeit, Verlängerung,
  Elfmeterschießen). Der Live-Takt skaliert dynamisch mit dem Tagesbudget (`coordinator.js`).
- **Endergebnisse, K.o.-Paarungen und der Weltmeister** werden automatisch gesetzt
  (kein Admin nötig). Zuordnung API-Spiel ↔ internes Spiel: Gruppenspiele über die
  (ungeordnete) Team-Paarung, K.o.-Spiele über die Anstoßzeit.
- **Live-Anzeige:** Während des Spiels zeigt die App Zwischenstand, Spielminute,
  Torschützen, Karten, Aufstellung, Statistik und (optional) In-Play-Quoten — reine
  Anzeige, getrennt von der Punktewertung. Detail-Calls (Torschützen/Karten/…) laufen nur
  für laufende/gerade beendete Spiele (Cap via `DETAIL_MAX_PER_SYNC`). Verwaltung im
  **Web-Admin → „API & Ergebnisse"**: Key + Test (zeigt das Live-Kontingent), Budget,
  Live-Takt, „Details neu laden".

## KI-Spieler (LLM-Tipper)
KI-Spieler nehmen wie menschliche Spieler am Tippspiel teil — sie werden regulär
gewertet und erscheinen überall mit **Kürzel + „KI"-Badge + Provider-Logo**.

- **Anlegen:** Web-Admin → **Nutzer → „KI-Spieler"**: Kürzel, Provider (Claude, OpenAI,
  Gemini, Mistral), Modell (sinnvoller Default) und **API-Key**. Der Key wird
  **verschlüsselt** gespeichert (`AI_KEY_SECRET`, Fallback `SESSION_SECRET`), **nie** ans
  Frontend ausgeliefert und **nie** geloggt. Optionaler **Verbindungstest** beim Anlegen.
- **Tippen:** ein Scheduler (`AI_TIP_CRON`, jede Minute) legt pro Spiel **genau einen**
  Tipp ab — getriggert bei **Anpfiff − 10 min**, garantiert vor der 5-min-Sperre. Pro
  (KI-Spieler, Spiel) gibt es **höchstens einen LLM-Call** (DB-Unique-Constraint +
  „attempted"-Status). Bei Fehlschlag: kein Tipp (deterministischer Fallback optional via
  `AI_FALLBACK`). Zusätzlich ein einmaliger **Weltmeister-Tipp** vor K.o.-Start.
- **Modell:** je Spiel ein Daten-Bundle aus api-football (Predictions/Poisson/Form/
  Comparison/Lineups/Injuries/Quoten) → System-Prompt →
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
