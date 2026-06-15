// Light/dark theme toggle. Applies a class + data-theme on <html> (HeroUI reads
// both) and persists the choice. The initial theme is set by an inline script in
// index.html before paint (no flash); this keeps the toggle in sync at runtime.
// Default is dark — the app's primary identity.

export const getTheme = () => {
  try { return localStorage.getItem("theme") === "light" ? "light" : "dark"; } catch { return "dark"; }
};

export function applyTheme(theme) {
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.setAttribute("data-theme", theme);
  try { localStorage.setItem("theme", theme); } catch { /* ignore */ }
}

export function toggleTheme() {
  const next = getTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
