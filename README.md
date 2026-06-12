# WM 2026 Tippspiel — Albert Weil

Selbst gehostetes Tippspiel: Vorrunde + K.o. mit Turnierbaum, Weltmeister-Bonus,
automatische Auswertung (klassisch 3/2/1, Weltmeister +10) und automatischem
Ergebnis-Abruf über **API-Football** (`v3.football.api-sports.io`).

Ein Container: Express-Backend (API-Key bleibt serverseitig) + gebautes React-Frontend.
Daten liegen in einer JSON-Datei im Volume `/data` — kein externer DB-Server nötig.

## Schnellstart (Docker)

```bash
cp .env.example .env          # ADMIN_PIN und API_FOOTBALL_KEY eintragen
docker compose up -d --build
```

Läuft dann auf `http://<host>:8080`. Admin-Funktionen (Ergebnis-Eingabe, Sync,
tatsächlicher Weltmeister) sind hinter dem `ADMIN_PIN` (Reiter „Admin").

## Reverse Proxy → it.wm.albertweil.de

DNS: A/AAAA-Record `it.wm.albertweil.de` auf den Docker-Host. Dann z. B.:

**Caddy** (automatisches HTTPS):
```
it.wm.albertweil.de {
    reverse_proxy localhost:8080
}
```

**Nginx**:
```nginx
server {
    server_name it.wm.albertweil.de;
    location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; }
}
```

Tipp: Wenn echte Authentifizierung gewünscht ist, die Seite am Proxy hinter eure
bestehende Auth hängen (Entra/Authentik etc.) — die App selbst bleibt simpel
(Name-Auswahl + Admin-PIN). Der `/api/sync`-Schreibzugriff ist ohnehin PIN-geschützt.

## API-Football

- Key bei api-sports.io anlegen, in `.env` als `API_FOOTBALL_KEY` setzen.
- **Wichtig:** Liga-ID einmal verifizieren. Default ist `API_LEAGUE=1` (FIFA World Cup).
  Test: `curl -s "https://v3.football.api-sports.io/leagues?search=world%20cup" -H "x-apisports-key: $KEY"`
- Budget: Der Sync holt **alle** Fixtures in **einem** Request. Cron alle 30 Min
  = max. 48 Calls/Tag, plus harter Stopp bei `API_DAILY_LIMIT` (Default 90). Bleibt
  sicher unter dem 100/Tag-Limit.
- Zuordnung API-Spiel ↔ internes Spiel läuft über den **Anstoß-Zeitstempel**
  (±90 Min Toleranz) — robust, auch wenn Teamnamen abweichen. K.o.-Teams werden
  zusätzlich automatisch aufgelöst (Bracket füllt sich von selbst).

## Spieler / Punkte anpassen

- Spieler, Spielplan, Flaggen, Aliase: `server/data.js` **und** `web/src/data.js`
  (identisch). Weltmeister-Bonus: `CHAMP_BONUS`.
- Punktelogik: Funktion `score()` in `web/src/App.jsx`.

## Lokal entwickeln

```bash
cd server && npm install && DATA_DIR=./data ADMIN_PIN=test npm start   # :8080
cd web && npm install && npm run dev                                   # :5173, /api proxyt auf :8080
```

## Flaggen

Werden zur Laufzeit von **Wikimedia Commons** geladen
(`Special:FilePath/Flag of <Land>.svg?width=80`). Möchtest du sie lieber lokal
ausliefern (kein Hotlink), kann ein kleiner Build-Step sie einmalig herunterladen
und nach `web/public/flags/` legen — sag Bescheid.
