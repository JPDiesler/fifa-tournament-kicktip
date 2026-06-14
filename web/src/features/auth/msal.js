import { PublicClientApplication, InteractionRequiredAuthError } from "@azure/msal-browser";

// Redirect-based MSAL flow (popup flow is intentionally not used — it's often
// blocked / unreliable). The auth response comes back to the app origin and is
// processed by handleRedirect() at startup.
const LOGIN_SCOPES = ["openid", "profile", "email"];
const GRAPH_SCOPES = ["User.ReadBasic.All"];
const INTENT_KEY = "wm_msal_intent";
export const RESUME_PICKER_KEY = "wm_resume_entra_picker";

let pca = null;

export async function initMsal(entra) {
  if (pca || !entra) return pca;
  pca = new PublicClientApplication({
    auth: { clientId: entra.clientId, authority: entra.authority, redirectUri: window.location.origin },
    cache: { cacheLocation: "sessionStorage" },
  });
  await pca.initialize();
  return pca;
}

// Call once at startup. Returns { kind: "login", idToken } | { kind: "graph" } | null.
export async function handleRedirect() {
  if (!pca) return null;
  const result = await pca.handleRedirectPromise();
  if (!result) return null;
  const intent = sessionStorage.getItem(INTENT_KEY);
  sessionStorage.removeItem(INTENT_KEY);
  if (intent === "graph") return { kind: "graph" }; // token is now in MSAL's cache
  return { kind: "login", idToken: result.idToken };
}

export function loginRedirect() {
  sessionStorage.setItem(INTENT_KEY, "login");
  return pca.loginRedirect({ scopes: LOGIN_SCOPES });
}

const firstAccount = () => pca?.getAllAccounts()[0] || null;

// Returns a Graph access token, or null when an interactive redirect was started
// (the page then navigates away and resumes after returning).
async function getGraphToken() {
  if (!pca) throw new Error("Microsoft ist nicht konfiguriert");
  const account = firstAccount();
  if (account) {
    try { return (await pca.acquireTokenSilent({ scopes: GRAPH_SCOPES, account })).accessToken; }
    catch (e) { if (!(e instanceof InteractionRequiredAuthError)) throw e; }
  }
  sessionStorage.setItem(INTENT_KEY, "graph");
  sessionStorage.setItem(RESUME_PICKER_KEY, "1");
  await pca.acquireTokenRedirect({ scopes: GRAPH_SCOPES, account: account || undefined });
  return null;
}

// Fetch directory users via delegated Graph. Returns null if a redirect was
// triggered (caller should show "Weiterleitung …"; the picker resumes on return).
export async function fetchEntraUsers() {
  const token = await getGraphToken();
  if (!token) return null;
  const users = [];
  let url = "https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail&$top=999";
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error("Microsoft Graph: HTTP " + r.status);
    const data = await r.json();
    users.push(...(data.value || []));
    url = data["@odata.nextLink"];
  }
  return users.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
}
