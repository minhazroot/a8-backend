import { MongoClient } from "mongodb";

let client;
let database;

export async function connectDB() {
  if (database) return database;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required in .env");

  // Keep TLS certificate validation enabled. Never disable TLS to work around
  // an Atlas handshake failure; check Atlas IP access, DNS, and port 27017.
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 12000,
    connectTimeoutMS: 10000,
    maxPoolSize: 20,
  });
  try {
    await client.connect();
    database = client.db(process.env.MONGODB_DB || "studiospace");
    await Promise.all([
      database.collection("users").createIndex({ email: 1 }, { unique: true }),
      database.collection("studios").createIndex({ ownerEmail: 1 }),
      database.collection("studios").createIndex({ createdAt: -1 }),
      database.collection("studios").createIndex({ seedId: 1 }, { unique: true, partialFilterExpression: { seedId: { $type: "string" } } }),
      database.collection("bookings").createIndex({ userEmail: 1, createdAt: -1 }),
      database.collection("bookings").createIndex({ studioId: 1, date: 1, status: 1 }),
      database.collection("confirmedSlots").createIndex({ studioId: 1, date: 1, slot: 1 }, { unique: true }),
      database.collection("wishlists").createIndex({ userEmail: 1, studioId: 1 }, { unique: true }),
      database.collection("reviews").createIndex({ studioId: 1, userEmail: 1 }, { unique: true }),
    ]);
    return database;
  } catch (error) {
    database = undefined;
    await client.close().catch(() => {});
    client = undefined;
    throw error;
  }
}

export function db() {
  if (!database) throw new Error("MongoDB not connected");
  return database;
}

export function mongoClient() {
  if (!client || !database) throw new Error("MongoDB not connected");
  return client;
}

export async function closeDB() {
  await client?.close();
  client = undefined;
  database = undefined;
}
