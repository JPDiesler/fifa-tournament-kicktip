import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
createRoot(document.getElementById("root")).render(<App />);

// Register the service worker only in production (avoids interfering with the dev HMR).
// When a new build's SW takes control (skipWaiting + clients.claim), reload once so the
// fresh bundle is shown automatically — no manual cache-clearing after a deploy.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded || !hadController) return; // skip the very first install (nothing stale yet)
      reloaded = true;
      window.location.reload();
    });
    try { await navigator.serviceWorker.register("/sw.js"); } catch { /* ignore */ }
  });
}
