import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { db, mongoClient } from "./db.js";

let authInstance;
export function getBetterAuth() {
  if (process.env.AUTH_PROVIDER !== "better-auth") return null;
  if (!authInstance) {
    if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32 || process.env.BETTER_AUTH_SECRET.startsWith("CHANGE_")) {
      throw new Error("BETTER_AUTH_SECRET must have at least 32 characters");
    }
    const googleReady = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    authInstance = betterAuth({
      appName: "StudioSpace",
      baseURL: process.env.API_ORIGIN || "http://localhost:5000",
      basePath: "/api/better-auth",
      secret: process.env.BETTER_AUTH_SECRET,
      database: mongodbAdapter(db(), { client: mongoClient() }),
      trustedOrigins: [process.env.CLIENT_ORIGIN || "http://localhost:3000"],
      emailAndPassword: { enabled: true, requireEmailVerification: false, minPasswordLength: 6 },
      user: { additionalFields: { photo: { type: "string", required: false, defaultValue: "", input: true } } },
      ...(googleReady ? { socialProviders: { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } } } : {}),
    });
  }
  return authInstance;
}
