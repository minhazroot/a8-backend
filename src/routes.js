import { Router } from "express";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { db, mongoClient } from "./db.js";
import { getBetterAuth } from "./better-auth.js";
import { fromNodeHeaders } from "better-auth/node";
import { requireAuth, sessionCookie, clearSession } from "./auth.js";
import {
  registerSchema,
  loginSchema,
  studioSchema,
  bookingSchema,
  parse,
  slots,
} from "./validation.js";
const r = Router();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many attempts; try again later" },
});
const id = (s) =>
  ObjectId.isValid(s) && new ObjectId(s).toString() === s
    ? new ObjectId(s)
    : null;
const publicUser = (u) => ({
  name: u.name,
  email: u.email,
  photo: u.photo || "",
});
const expose = (d) => {
  if (!d) return null;
  const { _id, passwordHash, ...rest } = d;
  return { id: _id.toString(), ...rest };
};
const fail = (res, result) =>
  res
    .status(400)
    .json({ message: "Invalid fields", issues: result.error.flatten() });
const invalidId = (res) =>
  res.status(400).json({ message: "Invalid record ID" });
const validDay = (v) => {
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
function today() {
  return new Date().toISOString().slice(0, 10);
}
r.get("/health", (_req, res) => res.json({ status: "ok" }));

// Exchange a verified Better Auth session for the short-lived HTTPOnly JWT used
// by StudioSpace CRUD/booking routes. Never accept email/userId from the browser.
r.post("/auth/sync", async (req, res) => {
  if (process.env.AUTH_PROVIDER !== "better-auth") return res.status(404).json({ message: "BetterAuth mode is not enabled" });
  const session = await getBetterAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user?.email) return res.status(401).json({ message: "Sign in with BetterAuth first" });
  const email = session.user.email.toLowerCase();
  const name = session.user.name || "StudioSpace Creator";
  const photo = session.user.image || session.user.photo || "";
  await db().collection("users").updateOne(
    { email },
    { $set: { name, photo }, $setOnInsert: { email, createdAt: new Date(), authProvider: "better-auth" } },
    { upsert: true },
  );
  const user = await db().collection("users").findOne({ email });
  sessionCookie(res, user);
  return res.json({ user: publicUser(user) });
});

r.post("/auth/register", authLimit, async (req, res) => {
  if (process.env.AUTH_PROVIDER === "better-auth") return res.status(409).json({ message: "Use Better Auth sign-up endpoint" });
  const p = parse(registerSchema, req.body);
  if (!p.success) return fail(res, p);
  const { password, ...details } = p.data;
  const existing = await db()
    .collection("users")
    .findOne({ email: details.email });
  if (existing)
    return res.status(409).json({ message: "Email already registered" });
  try {
    await db()
      .collection("users")
      .insertOne({
        ...details,
        passwordHash: await bcrypt.hash(password, 12),
        createdAt: new Date(),
      });
    return res
      .status(201)
      .json({ message: "Account registered. Please log in." });
  } catch (e) {
    if (e.code === 11000)
      return res.status(409).json({ message: "Email already registered" });
    throw e;
  }
});
r.post("/auth/login", authLimit, async (req, res) => {
  if (process.env.AUTH_PROVIDER === "better-auth") return res.status(409).json({ message: "Use Better Auth sign-in endpoint" });
  const p = parse(loginSchema, req.body);
  if (!p.success) return fail(res, p);
  const u = await db().collection("users").findOne({ email: p.data.email });
  if (!u || !(await bcrypt.compare(p.data.password, u.passwordHash)))
    return res.status(401).json({ message: "Invalid email or password" });
  sessionCookie(res, u);
  return res.json({ user: publicUser(u) });
});
r.get("/auth/me", requireAuth, async (req, res) => {
  const u = await db()
    .collection("users")
    .findOne({ _id: new ObjectId(req.auth.sub) });
  if (!u) return res.status(401).json({ message: "Account not found" });
  res.json({ user: publicUser(u) });
});
r.post("/auth/logout", requireAuth, (_req, res) => {
  clearSession(res);
  res.json({ success: true });
});
r.get("/studios", async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = String(req.query.category);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100);
  const docs = await db()
    .collection("studios")
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  res.json(docs.map(expose));
});
r.get("/studios/mine", requireAuth, async (req, res) => {
  const docs = await db()
    .collection("studios")
    .find({ ownerEmail: req.auth.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(docs.map(expose));
});
r.get("/studios/:id", async (req, res) => {
  const key = id(req.params.id);
  if (!key) return invalidId(res);
  const doc = await db().collection("studios").findOne({ _id: key });
  if (!doc) return res.status(404).json({ message: "Studio not found" });
  res.json(expose(doc));
});
r.post("/studios", requireAuth, async (req, res) => {
  const p = parse(studioSchema, req.body);
  if (!p.success) return fail(res, p);
  const owner = await db()
    .collection("users")
    .findOne({ _id: new ObjectId(req.auth.sub) });
  if (!owner) return res.status(401).json({ message: "User not found" });
  const doc = {
    ...p.data,
    ownerName: owner.name,
    ownerEmail: owner.email,
    rating: 0,
    reviews: 0,
    createdAt: new Date(),
  };
  const result = await db().collection("studios").insertOne(doc);
  res.status(201).json(expose({ ...doc, _id: result.insertedId }));
});
r.patch("/studios/:id", requireAuth, async (req, res) => {
  const key = id(req.params.id);
  if (!key) return invalidId(res);
  const p = parse(studioSchema, req.body);
  if (!p.success) return fail(res, p);
  const update = await db()
    .collection("studios")
    .findOneAndUpdate(
      { _id: key, ownerEmail: req.auth.email },
      { $set: { ...p.data, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  if (!update)
    return res
      .status(404)
      .json({ message: "Listing not found or not owned by you" });
  res.json(expose(update));
});
r.delete("/studios/:id", requireAuth, async (req, res) => {
  const key = id(req.params.id);
  if (!key) return invalidId(res);
  const owned = await db().collection("studios").findOne({ _id: key, ownerEmail: req.auth.email });
  if (!owned) return res.status(404).json({ message: "Listing not found or not owned by you" });
  const active = await db().collection("bookings").findOne({ studioId: key.toString(), status: { $in: ["Pending", "Confirmed"] } });
  if (active) return res.status(409).json({ message: "Cannot delete a studio with active bookings" });
  const result = await db()
    .collection("studios")
    .deleteOne({ _id: key, ownerEmail: req.auth.email });
  if (!result.deletedCount)
    return res
      .status(404)
      .json({ message: "Listing not found or not owned by you" });
  res.json({ success: true });
});
r.get("/bookings", requireAuth, async (req, res) => {
  const docs = await db()
    .collection("bookings")
    .find({ userEmail: req.auth.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(docs.map(expose));
});
r.get("/bookings/host", requireAuth, async (req, res) => {
  const own = await db()
    .collection("studios")
    .find({ ownerEmail: req.auth.email })
    .project({ _id: 1 })
    .toArray();
  const ids = own.map((x) => x._id.toString());
  const docs = await db()
    .collection("bookings")
    .find({ studioId: { $in: ids } })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(docs.map(expose));
});
r.post("/bookings", requireAuth, async (req, res) => {
  const p = parse(bookingSchema, req.body);
  if (!p.success) return fail(res, p);
  const { studioId, date, start, end } = p.data;
  const key = id(studioId);
  if (!key) return invalidId(res);
  const slotList = slots(start, end);
  if (!slotList || slotList.length > 96)
    return res
      .status(400)
      .json({
        message: "Use valid 15-minute increments, with end after start",
      });
  if (!validDay(date) || date < today())
    return res.status(400).json({ message: "Choose a current or future date" });
  const studio = await db().collection("studios").findOne({ _id: key });
  if (!studio) return res.status(404).json({ message: "Studio unavailable" });
  if (studio.ownerEmail === req.auth.email)
    return res.status(400).json({ message: "You cannot book your own studio" });
  const conflict = await db()
    .collection("confirmedSlots")
    .findOne({ studioId, date, slot: { $in: slotList } });
  if (conflict)
    return res
      .status(409)
      .json({ message: "These hours overlap a confirmed booking" });
  const amount = (slotList.length / 4) * studio.rate;
  const booking = {
    studioId,
    userEmail: req.auth.email,
    date,
    start,
    end,
    amount,
    status: "Pending",
    createdAt: new Date(),
  };
  const result = await db().collection("bookings").insertOne(booking);
  res.status(201).json(expose({ ...booking, _id: result.insertedId }));
});
r.patch("/bookings/:id/cancel", requireAuth, async (req, res) => {
  const key = id(req.params.id);
  if (!key) return invalidId(res);
  const updated = await db()
    .collection("bookings")
    .findOneAndUpdate(
      { _id: key, userEmail: req.auth.email, status: "Pending" },
      { $set: { status: "Cancelled" } },
      { returnDocument: "after" },
    );
  if (!updated)
    return res
      .status(409)
      .json({ message: "Only your pending bookings can be cancelled" });
  res.json(expose(updated));
});
r.patch("/bookings/:id/confirm", requireAuth, async (req, res) => {
  const key = id(req.params.id);
  if (!key) return invalidId(res);
  const b = await db()
    .collection("bookings")
    .findOne({ _id: key, status: "Pending" });
  if (!b) return res.status(409).json({ message: "Pending booking not found" });
  const s = await db()
    .collection("studios")
    .findOne({ _id: id(b.studioId), ownerEmail: req.auth.email });
  if (!s)
    return res
      .status(403)
      .json({ message: "Only the studio owner may confirm" });
  const slotList = slots(b.start, b.end);
  const session = mongoClient().startSession();
  let updated;
  try {
    // Atlas replica sets support transactions. Unique slot index prevents
    // double-booking, and the transaction prevents partial slot insertion.
    await session.withTransaction(async () => {
      const bookings = db().collection("bookings");
      const reservations = db().collection("confirmedSlots");
      const current = await bookings.findOne({ _id: key, status: "Pending" }, { session });
      if (!current) throw Object.assign(new Error("Booking state changed"), { status: 409 });
      await reservations.insertMany(slotList.map((slot) => ({
        studioId: current.studioId, date: current.date, slot, bookingId: key.toString(),
      })), { session });
      updated = await bookings.findOneAndUpdate(
        { _id: key, status: "Pending" },
        { $set: { status: "Confirmed", updatedAt: new Date() } },
        { returnDocument: "after", session },
      );
      if (!updated) throw Object.assign(new Error("Booking state changed"), { status: 409 });
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Time slot already confirmed" });
    if (error.status === 409 || error.hasErrorLabel?.("TransientTransactionError")) {
      return res.status(409).json({ message: "Booking changed or overlaps another reservation. Please retry." });
    }
    throw error;
  } finally {
    await session.endSession();
  }
  res.json(expose(updated));
});
r.get("/wishlist", requireAuth, async (req, res) => {
  const list = await db()
    .collection("wishlists")
    .find({ userEmail: req.auth.email })
    .toArray();
  res.json(list.map((x) => x.studioId));
});
r.put("/wishlist/:studioId", requireAuth, async (req, res) => {
  const key = id(req.params.studioId);
  if (!key) return invalidId(res);
  if (!(await db().collection("studios").findOne({ _id: key })))
    return res.status(404).json({ message: "Studio not found" });
  await db()
    .collection("wishlists")
    .updateOne(
      { userEmail: req.auth.email, studioId: req.params.studioId },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
  res.json({ saved: true });
});
r.delete("/wishlist/:studioId", requireAuth, async (req, res) => {
  await db()
    .collection("wishlists")
    .deleteOne({ userEmail: req.auth.email, studioId: req.params.studioId });
  res.json({ saved: false });
});

// Public studio availability. Confirmed slots are the authoritative source.
r.get("/studios/:id/availability", async (req, res) => {
  const studioKey = id(req.params.id);
  const date = String(req.query.date || "");
  if (!studioKey) return invalidId(res);
  if (!validDay(date)) return res.status(400).json({ message: "Valid date required (YYYY-MM-DD)" });
  if (!(await db().collection("studios").findOne({ _id: studioKey }, { projection: { _id: 1 } }))) {
    return res.status(404).json({ message: "Studio not found" });
  }
  const occupied = await db().collection("confirmedSlots")
    .find({ studioId: studioKey.toString(), date }, { projection: { _id: 0, slot: 1 } }).toArray();
  return res.json({ date, occupiedSlots: occupied.map(s => s.slot).sort((a,b) => a-b) });
});

// Current user can read a confirmed booking invoice payload; no payment is processed.
r.get("/bookings/:id/invoice", requireAuth, async (req, res) => {
  const key = id(req.params.id);
  if (!key) return invalidId(res);
  const booking = await db().collection("bookings").findOne({ _id: key, userEmail: req.auth.email, status: { $in: ["Confirmed", "Completed"] } });
  if (!booking) return res.status(404).json({ message: "Confirmed booking not found" });
  const studio = await db().collection("studios").findOne({ _id: id(booking.studioId) });
  return res.json({ booking: expose(booking), studio: studio ? { title: studio.title, location: studio.location, ownerName: studio.ownerName, deposit: studio.deposit } : null, issuedAt: new Date().toISOString() });
});

// Only the owning host can mark a finished confirmed session Completed.
r.patch("/bookings/:id/complete", requireAuth, async (req, res) => {
  const key = id(req.params.id);
  if (!key) return invalidId(res);
  const booking = await db().collection("bookings").findOne({ _id: key, status: "Confirmed" });
  if (!booking) return res.status(409).json({ message: "Only confirmed bookings can be completed" });
  const studio = await db().collection("studios").findOne({ _id: id(booking.studioId), ownerEmail: req.auth.email });
  if (!studio) return res.status(403).json({ message: "Only the studio owner may complete a booking" });
  const sessionEnd = new Date(`${booking.date}T${booking.end}:00Z`);
  if (sessionEnd > new Date()) return res.status(409).json({ message: "The session has not finished yet" });
  const updated = await db().collection("bookings").findOneAndUpdate(
    { _id: key, status: "Confirmed" },
    { $set: { status: "Completed", updatedAt: new Date() } },
    { returnDocument: "after" }
  );
  if (!updated) return res.status(409).json({ message: "Booking status changed" });
  return res.json(expose(updated));
});

// Reviews are tied to actual completed reservations and cannot be spoofed.
r.get("/studios/:id/reviews", async (req, res) => {
  const studioKey = id(req.params.id);
  if (!studioKey) return invalidId(res);
  const reviews = await db().collection("reviews").find({ studioId: studioKey.toString() }).sort({ createdAt: -1 }).limit(50).toArray();
  return res.json(reviews.map(expose));
});
r.post("/studios/:id/reviews", requireAuth, async (req, res) => {
  const studioKey = id(req.params.id);
  if (!studioKey) return invalidId(res);
  const rating = Number(req.body?.rating);
  const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 10 || comment.length > 1000) {
    return res.status(400).json({ message: "Rating 1–5 and comment of 10–1000 characters required" });
  }
  const studio = await db().collection("studios").findOne({ _id: studioKey });
  if (!studio) return res.status(404).json({ message: "Studio not found" });
  const completed = await db().collection("bookings").findOne({ studioId: studioKey.toString(), userEmail: req.auth.email, status: "Completed" });
  if (!completed) return res.status(403).json({ message: "Complete a studio booking before reviewing" });
  const user = await db().collection("users").findOne({ _id: new ObjectId(req.auth.sub) });
  try {
    await db().collection("reviews").insertOne({ studioId: studioKey.toString(), userEmail: req.auth.email, userName: user?.name || "Creator", rating, comment, createdAt: new Date() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "You already reviewed this studio" });
    throw err;
  }
  const stats = await db().collection("reviews").aggregate([
    { $match: { studioId: studioKey.toString() } },
    { $group: { _id: null, rating: { $avg: "$rating" }, reviews: { $sum: 1 } } }
  ]).toArray();
  await db().collection("studios").updateOne({ _id: studioKey }, { $set: { rating: Number(stats[0].rating.toFixed(1)), reviews: stats[0].reviews } });
  return res.status(201).json({ message: "Review posted" });
});

// Store the ImgBB key on the server, not in NEXT_PUBLIC_* environment variables.
r.post("/uploads/image", requireAuth, async (req, res) => {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) return res.status(503).json({ message: "Image hosting has not been configured" });
  const image = typeof req.body?.image === "string" ? req.body.image : "";
  if (!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(image) || image.length > 7_000_000) {
    return res.status(400).json({ message: "Upload a PNG, JPEG, or WebP image under 5 MB" });
  }
  const body = new URLSearchParams({ image: image.split(",")[1] });
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", body, signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.data?.url) return res.status(502).json({ message: "Image hosting failed" });
  return res.status(201).json({ url: result.data.url });
});

// Express 4 does not forward rejected async handlers automatically.
// Wrap route callbacks so database errors reach the centralized JSON handler.
for (const layer of r.stack) {
  if (!layer.route) continue;
  for (const handler of layer.route.stack) {
    const original = handler.handle;
    handler.handle = function (req, res, next) {
      try { Promise.resolve(original(req, res, next)).catch(next); }
      catch (error) { next(error); }
    };
  }
}
export default r;
