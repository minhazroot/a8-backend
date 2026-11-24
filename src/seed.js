import "dotenv/config";
import fs from "node:fs";
import bcrypt from "bcryptjs";
import { connectDB, db, closeDB } from "./db.js";

const password = process.env.SEED_HOST_PASSWORD;
if (!password || password.length < 8 || password.startsWith("replace-")) {
  throw new Error("Set a real SEED_HOST_PASSWORD (8+ chars) in .env first");
}
const email = (process.env.SEED_HOST_EMAIL || "host@studiospace.com").toLowerCase();

try {
  await connectDB();
  const users = db().collection("users");
  const studios = db().collection("studios");
  await users.updateOne({ email }, { $setOnInsert: {
    name: "Studio Host", email, photo: "",
    passwordHash: await bcrypt.hash(password, 12), createdAt: new Date(),
  } }, { upsert: true });

  // In Better Auth mode, also create the host in Better Auth's separate
  // account/session collections; the legacy users document powers studio ownership.
  if (process.env.AUTH_PROVIDER === "better-auth") {
    const { getBetterAuth } = await import("./better-auth.js");
    const existingAuthUser = await db().collection("user").findOne({ email });
    if (!existingAuthUser) {
      await getBetterAuth().api.signUpEmail({ body: { name: "Studio Host", email, password } });
    }
  }

  const entries = JSON.parse(fs.readFileSync(new URL("./seed-studios.json", import.meta.url), "utf8"));
  if (!Array.isArray(entries)) throw new Error("seed-studios.json must contain an array");
  for (const entry of entries) {
    const { id, ...studio } = entry;
    if (typeof id !== "string") throw new Error("Each seed studio needs a string id");
    await studios.updateOne({ seedId: id }, { $setOnInsert: {
      ...studio, ownerEmail: email, ownerName: "Studio Host",
      seedId: id, createdAt: new Date(),
    } }, { upsert: true });
  }
  console.log(`Seed complete: ${entries.length} studios; host ${email}`);
} finally {
  await closeDB();
}
