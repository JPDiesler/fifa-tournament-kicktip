// Express app: session, JSON, API routers, and serving the built SPA.
import express from "express";
import session from "express-session";
import SqliteStoreFactory from "better-sqlite3-session-store";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "./db.js";
import { SESSION_SECRET, COOKIE_SECURE } from "./config.js";
import authRoutes from "./routes/auth.routes.js";
import stateRoutes from "./routes/state.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import pushRoutes from "./routes/push.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const SqliteStore = SqliteStoreFactory(session);
app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: COOKIE_SECURE, maxAge: 30 * 24 * 60 * 60 * 1000 },
}));

// ---------- API ----------
app.use("/api", authRoutes);
app.use("/api", stateRoutes);
app.use("/api", adminRoutes);
app.use("/api", pushRoutes);

// ---------- built frontend ----------
// hashed assets cache forever, but the index.html shell is always revalidated so
// a rebuilt bundle is picked up immediately.
const PUBLIC = path.join(__dirname, "public");
app.use(express.static(PUBLIC, {
  setHeaders: (res, p) => {
    if (p.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
    else if (p.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));
app.get("*", (req, res) =>
  res.sendFile(path.join(PUBLIC, "index.html"), { headers: { "Cache-Control": "no-cache" } }));

export default app;
