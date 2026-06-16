# KI-Spieler Prompts

Diese Dateien steuern, **wie** die KI-Spieler tippen. Sie werden zur Laufzeit geladen und
**mtime-gecacht** (siehe `server/services/ai/prompt.js`): eine Änderung greift beim nächsten
Tipp-Job automatisch — **kein Code-Rebuild nötig**, im Docker-Betrieb nur per gemountetem Verzeichnis
(siehe `docker-compose.yml`, optionaler Bind-Mount `./server/prompts:/app/prompts`) bzw. Neustart.

- `aiPlayer.system.md` — System-Prompt für den **Spiel-Tipp** (Dixon-Coles/Poisson, EV-Maximierung).
- `champion.system.md` — System-Prompt für den einmaligen **Weltmeister-Tipp**.

Der Ablageort lässt sich per Env `AI_PROMPT_DIR` überschreiben (Default: dieses Verzeichnis).

---

## Input-Bundle (gemeinsam, an das Modell als User-Message)

```jsonc
{
  "source": "api-football" | "football-data",
  "scoring": { "exact": 3, "goal_diff": 2, "tendency": 1 },   // ECHTE Kicktipp-Werte der App
  "context": "optionaler Freitext (dead rubber, Wetter, Höhe, Reise)",
  "calibration": {                 // optional, NUR aggregiert (keine Tipp-Liste)
    "tips_evaluated": 24, "avg_points_per_tip": 2.42,
    "goal_bias_home": 0.2, "goal_bias_away": -0.1, "note": "..."
  }
  // + quell-spezifische Felder:
  //   api-football: fixture, predictions, comparison, teams.last_5, h2h, lineups, injuries
  //   football-data: fixture, standings, recent_home, recent_away, h2h
}
```

Für den Champion-Tipp enthält das Bundle zusätzlich `teams: [{code,name}]` (die einzigen gültigen
Champion-Codes) und `scoring.champion_bonus`.

## Kanonisches Output-Schema (Spiel-Tipp; von allen Adaptern validiert)

```json
{
  "match_id": "string|number",
  "source": "api-football|football-data",
  "tip": { "home": 2, "away": 1 },
  "model": "Dixon-Coles",
  "lambda": { "home": 1.9, "away": 0.8 },
  "expected_points": 2.7,
  "outcome_probabilities": { "home_win": 0.62, "draw": 0.24, "away_win": 0.14 },
  "tip_scoreline_probability": 0.13,
  "confidence": "mittel",
  "calibration_applied": true,
  "risk": "deutscher Satz",
  "reasoning": "max. 2 deutsche Sätze"
}
```

Validierung (`server/services/ai/schema.js`): `outcome_probabilities` summieren ~1; alle
Wahrscheinlichkeiten in [0,1]; `tip.home/away` ganze Zahlen ≥ 0.

## Output-Schema (Champion-Tipp)

```json
{
  "type": "champion",
  "source": "api-football|football-data",
  "champion_code": "GER",
  "champion_name": "Deutschland",
  "win_probability": 0.18,
  "contenders": [{ "code": "BRA", "probability": 0.16 }],
  "confidence": "mittel",
  "reasoning": "max. 2 deutsche Sätze"
}
```

`champion_code` muss einer der `teams`-Codes aus dem Bundle sein.

## Hinweise beim Bearbeiten
- **JSON-only**: Der Prompt MUSS das Modell anweisen, ausschließlich das JSON-Objekt zurückzugeben
  (kein Markdown, keine ```-Fences). Der Parser entfernt Fences defensiv, aber verlasse dich nicht darauf.
- Sprache von `reasoning`/`risk`: **Deutsch**. Der übrige Prompt ist bewusst englisch + zeichenoptimiert.
- Felder im Output-Schema nicht umbenennen/entfernen — sonst schlägt die Validierung fehl und der
  betroffene KI-Spieler bekommt für das Spiel **keinen** Tipp (genau ein Versuch, kein Retry).
