import { useEffect, useState } from "react";
import { Card, Button, TextField, Label, Input, Spinner, Separator } from "@heroui/react";
import { getConfig, loginBasic } from "./auth.js";
import { initMsal, loginRedirect } from "./msal.js";
import Logo from "@/components/Logo.jsx";
import Notice from "@/components/Notice.jsx";

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export default function LoginScreen({ onLoggedIn, initialError }) {
  const [config, setConfig] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    getConfig().then((c) => { setConfig(c); if (c?.entra) initMsal(c.entra).catch(() => {}); }).catch(() => setConfig({}));
  }, []);
  useEffect(() => { if (initialError) setError(initialError); }, [initialError]);

  const submitBasic = async (e) => {
    e?.preventDefault?.();
    if (!username || !password) return;
    setError(""); setBusy("basic");
    try { onLoggedIn(await loginBasic(username, password)); }
    catch (err) { setError(err.message); setBusy(""); }
  };

  const doEntra = async () => {
    setError(""); setBusy("entra");
    try {
      await initMsal(config.entra);
      await loginRedirect(); // navigates away to Microsoft; returns to the app origin
    } catch (err) {
      setError(err.message || "Microsoft-Login fehlgeschlagen");
      setBusy("");
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card variant="default" className="w-full max-w-sm">
        <Card.Content className="p-6">
          <div className="mb-5 flex flex-col items-center gap-3 text-center">
            <Logo h={52} />
            <h1 className="text-lg font-bold">WM 2026 · Tippspiel</h1>
            <p className="text-xs text-muted">Bitte anmelden, um zu tippen.</p>
          </div>

          <form onSubmit={submitBasic} className="flex flex-col gap-3">
            <TextField aria-label="Benutzername" value={username} onChange={setUsername} autoComplete="username">
              <Label className="text-xs text-muted">Benutzername</Label>
              <Input placeholder="Benutzername" />
            </TextField>
            <TextField aria-label="Passwort" type="password" value={password} onChange={setPassword} autoComplete="current-password">
              <Label className="text-xs text-muted">Passwort</Label>
              <Input placeholder="Passwort" />
            </TextField>

            <Notice>{error}</Notice>

            <Button type="submit" variant="primary" onPress={submitBasic} isPending={busy === "basic"} className="w-full">
              Anmelden
            </Button>
          </form>

          {config === null ? (
            <div className="mt-4 flex justify-center"><Spinner size="sm" /></div>
          ) : config.entra ? (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-muted">
                <Separator className="flex-1" /> oder <Separator className="flex-1" />
              </div>
              <Button variant="secondary" onPress={doEntra} isPending={busy === "entra"} className="w-full">
                <MicrosoftLogo /> Mit Microsoft anmelden
              </Button>
            </>
          ) : null}
        </Card.Content>
      </Card>
    </div>
  );
}
