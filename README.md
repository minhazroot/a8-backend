# StudioSpace backend — corrected implementation

This is the Express/MongoDB API for the supplied Next.js StudioSpace frontend. The `seed.js` stays separate from `index.js` by design. This version uses custom JWT cookies; **BetterAuth and Google OAuth are not implemented**, and image upload to imgbb/postimage is not implemented (image URL input is supported). The optional invoice generator is not implemented.

## Installation

```bash
cd studiospace-server
npm install
cp .env.example .env  # Windows PowerShell: Copy-Item .env.example .env
# Edit .env with REAL values, never commit it.
npm run check
npm run seed  # once or whenever you need demo records
npm run dev
```

Frontend `.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:5000/api` and `NEXT_PUBLIC_USE_API=true`. Use `http://localhost:3000` for the frontend matching `CLIENT_ORIGIN`. Cookies require `credentials: include` (already in supplied frontend API client). Every mutation requires an `Origin` header matching CLIENT_ORIGIN. Browser sends it automatically; curl/Postman users must supply it.

## API routes

`GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/studios`, `GET /api/studios?limit=6`, `GET /api/studios/:id`, `GET /api/studios/mine`, `POST /api/studios`, `PATCH /api/studios/:id`, `DELETE /api/studios/:id`, `GET /api/bookings`, `GET /api/bookings/host`, `POST /api/bookings`, `PATCH /api/bookings/:id/cancel`, `PATCH /api/bookings/:id/confirm`, `GET /api/wishlist`, `PUT /api/wishlist/:studioId`, `DELETE /api/wishlist/:studioId`.

## Booking design

New bookings are `Pending`. Bookings colliding with **Confirmed** time slots return 409. Only an owner can confirm. Confirmation uses a MongoDB transaction and a unique `(studioId, date, slot)` index, avoiding partial reservations on conflicting confirmations. Transactions require an Atlas replica set (or another transaction-capable MongoDB deployment). Dates use UTC for validation; for a global booking marketplace, production should normalize dates to the studio's local timezone and add explicit timezone fields.

## Troubleshooting MongoDB TLS

`ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR` occurs before authentication/seeding and **cannot be fixed by moving seed code into index.js**. Check Atlas Network Access (allow your current IP), cluster status, DNS SRV resolution, and ability to reach Atlas port 27017. Use Atlas Drivers connection string. Do not use `tls=false`, skip certificate verification, or print URI/password. In PowerShell: `nslookup -type=SRV _mongodb._tcp.YOUR-CLUSTER.mongodb.net`, followed by `Test-NetConnection ACTUAL-SRV-HOST -Port 27017`.

## Security

Never commit `.env`. Change any password previously pasted in a chat or shared. Use a fresh 32+ character JWT_SECRET. Production requires HTTPS, `COOKIE_SECURE=true`, appropriate SameSite settings, and configured hosting CORS/origin. Note cookie-based JWT session is a temporary alternative; assignment specifies **BetterAuth with MongoDB adapter**, which still needs implementation.

## Known remaining work

Full end-to-end testing against a real MongoDB deployment, BetterAuth/Google OAuth, imgbb/postimage image uploads, responsive/browser QA, and production deployment. `npm run check` validates JavaScript syntax; it is not a runtime/DB integration test.
