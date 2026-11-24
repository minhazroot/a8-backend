import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import routes from "./routes.js";
import { toNodeHandler } from "better-auth/node";
import { getBetterAuth } from "./better-auth.js";
import { csrfGuard } from "./auth.js";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:3000", credentials: true }));
// Mount Better Auth before Express body parser (required for streamed request bodies).
app.all("/api/better-auth/*", (req, res, next) => {
  if (process.env.AUTH_PROVIDER !== "better-auth") return res.status(404).json({ message: "BetterAuth is disabled" });
  try { return toNodeHandler(getBetterAuth())(req, res); } catch (error) { next(error); }
});
app.use("/api/uploads/image", express.json({ limit: "7mb" }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use("/api", csrfGuard, routes);
app.use((req, res) => res.status(404).json({ message: "API route not found" }));
app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ message: "Invalid JSON body" });
  console.error("API error:", err);
  if (!res.headersSent) res.status(500).json({ message: "Unexpected server error" });
});
