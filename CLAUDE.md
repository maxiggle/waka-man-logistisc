# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Package manager is **pnpm** (see `pnpm-workspace.yaml`) — never use npm/yarn.

```bash
pnpm dev            # start Next.js dev server
pnpm build           # production build
pnpm start           # run a production build
pnpm lint            # eslint (flat config, eslint-config-next core-web-vitals + typescript)
```

There is no test suite configured in this repo yet.

Android shell (Capacitor):
```bash
CAP_SERVER_URL=http://<lan-ip>:3000 pnpm exec cap sync android   # point native shell at local dev server
pnpm exec cap sync android                                        # otherwise loads the deployed Vercel URL
```
The Capacitor app is not a bundled static build — its WebView loads `server.url` from `capacitor.config.ts` (the deployed origin by default), so most web changes don't require a native rebuild.

## Architecture

**Waka Man**: a Next.js (App Router) delivery-dispatch app with a thin Capacitor Android shell for riders. Firebase is the backend (Auth, Firestore, Admin SDK); Mapbox handles geocoding/maps.

### Client vs. server trust boundary

This is the load-bearing design decision in the codebase. Matching/claiming and delivery-lifecycle writes were moved server-side (the code comments call this "Wave 2") because the browser cannot be trusted to run logic that assigns paid work:

- `src/lib/dispatch.ts` / `src/lib/deliveryLifecycle.ts` — thin client-side `fetch` wrappers. They attach the caller's Firebase ID token and shape the response; they contain **no matching logic**.
- `src/app/api/dispatch/*/route.ts`, `src/app/api/deliveries/*/route.ts` — API routes. Verify the bearer token via `getUidFromRequest`, re-check authorization/state from Firestore (never from the request body), then delegate to the real logic in `src/server/`.
- `src/server/dispatch.ts` / `src/server/deliveryLifecycle.ts` — the actual matching/claim/lifecycle logic, running on the Admin SDK (`src/server/firebaseAdmin.ts`), which bypasses Firestore security rules entirely. Every route handler using it must declare `export const runtime = "nodejs"` (Admin SDK needs Node built-ins, doesn't run on Edge).
- A rider's `vehicle` is resolved from the server-trusted `users/{uid}` document during matching, never from the client-writable `riderAvailability` doc — otherwise a rider could self-declare a higher vehicle tier to claim jobs they're not eligible for.
- The delivery confirmation code lives at `deliveries/{id}/private/code`, a separate document from the one the assigned rider's own query reads, so it's never in the rider's memory before the recipient tells them.

When adding a new mutation, follow this pattern: client wrapper → API route (auth + state re-check) → `src/server/*` (Admin SDK, transactional). Don't let client code write dispatch/lifecycle state directly to Firestore.

### Shared config as drift prevention

`src/lib/dispatchConfig.ts` and `src/lib/schemas.ts` are the single source of truth for constants and enums that both client and server logic depend on (`VEHICLE_ELIGIBILITY`, `DELIVERY_STATUS_TRANSITIONS`, TTLs, search radius, rate limits). `schemas.ts` even asserts at compile time that `serviceLevelSchema` and `dispatchConfig.ServiceLevel` can't drift apart. Don't re-declare these values locally in a new file — import from here.

### Matching (`src/server/dispatch.ts`)

Geohash-based proximity search using `geofire-common`, in two directions:
- `matchNearestRider(deliveryId, pickup, serviceLevel)` — called right after a delivery is created, searches `riderAvailability` for online, non-stale, vehicle-eligible riders.
- `matchNearestDelivery(rider)` — called when a rider comes online, scans pending deliveries (no geo index of its own; capped, oldest-first).

Both funnel into `tryClaimDelivery`, a single Firestore transaction that re-asserts delivery/rider state before writing (reads before writes, existence checked before data access — see comments there for the exact ordering rationale). Capped by `MAX_CLAIM_ATTEMPTS` to avoid unbounded retry storms.

### Delivery lifecycle

Status transitions are a linear state machine defined once in `DELIVERY_STATUS_TRANSITIONS` (`src/lib/schemas.ts`): `pending → assigned → picked_up → in_transit → arrived → delivered`, plus a rider-initiated `assigned → pending` release (distinct from `cancelled`, which has no endpoint yet). The transition map drives both client button visibility and the server's authorization check — they can't drift because it's the same object.

### Auth (`src/context/AuthContext.tsx`)

Google Sign-In only, but two different flows depending on platform:
- Web: `signInWithPopup`.
- Native (Capacitor): `@capacitor-firebase/authentication`'s native picker with `skipNativeAuth: true`, then the returned credential is exchanged via `signInWithCredential` — this keeps the Firebase JS SDK (`onAuthStateChanged`) as the single source of auth truth instead of maintaining two separate native/web sessions that can drift.

Roles are `client | rider | admin`. Admin is never client-selectable — it's granted by an `adminInvites/{email}` Firestore doc, checked and promoted on every sign-in and via `refreshUserProfile` (`src/lib/admin.ts`, `isEmailInvited`).

### Environment variables (see `.env.example`)

- `NEXT_PUBLIC_FIREBASE_*` — Firebase client SDK config, safe to expose.
- `NEXT_PUBLIC_MAPBOX_TOKEN` — geocoding/autocomplete (`src/lib/geocode.ts`).
- `FIREBASE_SERVICE_ACCOUNT_B64` — base64-encoded Admin SDK service account. Root access to the whole Firebase project, bypasses every security rule. Never prefix with `NEXT_PUBLIC_`, never commit a real value. Must be set on Vercel for both Preview and Production.

### Path alias

`@/*` maps to `./src/*` (`tsconfig.json`).
