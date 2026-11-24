import jwt from "jsonwebtoken";

export const cookieName = "studiospace_session";
const isProd = process.env.NODE_ENV === "production";
const secure = isProd || process.env.COOKIE_SECURE === "true";
const sameSite = process.env.COOKIE_SAMESITE === "none" ? "none" : "lax";
if (sameSite === "none" && !secure) {
  throw new Error("COOKIE_SAMESITE=none requires COOKIE_SECURE=true (HTTPS)");
}
const cookieOptions = { httpOnly: true, secure, sameSite, path: "/" };

export function tokenFor(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
    issuer: "studiospace",
    audience: "studiospace-web",
  });
}
export function sessionCookie(res, user) {
  res.cookie(cookieName, tokenFor(user), { ...cookieOptions, maxAge: 7 * 86400000 });
}
export function clearSession(res) {
  res.clearCookie(cookieName, cookieOptions);
}
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[cookieName];
    if (!token) return res.status(401).json({ message: "Please sign in" });
    const claims = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "studiospace", audience: "studiospace-web", algorithms: ["HS256"],
    });
    if (process.env.AUTH_PROVIDER === "better-auth") {
      const [{ getBetterAuth }, { fromNodeHeaders }] = await Promise.all([
        import("./better-auth.js"), import("better-auth/node")
      ]);
      const session = await getBetterAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session?.user?.email || session.user.email.toLowerCase() !== claims.email) {
        return res.status(401).json({ message: "Session expired. Please sign in again" });
      }
    }
    req.auth = claims;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Session expired. Please sign in again" });
  }
}
export function csrfGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.headers.origin !== process.env.CLIENT_ORIGIN) {
    return res.status(403).json({ message: "Untrusted request origin" });
  }
  next();
}
