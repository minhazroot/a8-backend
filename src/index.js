import "dotenv/config";
import { connectDB, closeDB } from "./db.js";
import { app } from "./app.js";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith("replace-") || process.env.JWT_SECRET.startsWith("GENERATE_")) {
  throw new Error("JWT_SECRET must be at least 32 characters");
}
if (!process.env.CLIENT_ORIGIN) {
  throw new Error("CLIENT_ORIGIN is required (e.g. http://localhost:3000)");
}

let server;
try {
  await connectDB();
  if (process.env.AUTH_PROVIDER === "better-auth") {
    const { getBetterAuth } = await import("./better-auth.js");
    getBetterAuth();
  }
  const port = Number(process.env.PORT || 5000);
  server = app.listen(port, () => {
    console.log(`StudioSpace API at http://localhost:${port}/api`);
  });
} catch (error) {
  console.error("Backend startup failed:", error.message);
  console.error("Check Atlas cluster status, Network Access current IP, DNS SRV records, and outbound port 27017. Do not disable TLS validation.");
  await closeDB().catch(() => {});
  process.exitCode = 1;
}

async function shutdown() {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDB();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
