# Packaging Arc Spirits as a native app (Capacitor)

This repo is scaffolded to ship the 2D play game to the **App Store** and **Google Play**
via [Capacitor](https://capacitorjs.com/), while the web app keeps running as-is (SSR on Vercel).

## Architecture

Two build targets, one codebase:

- **Web** (`npm run build`) → `adapter-vercel`, SSR + serverless API + SSE. Unchanged.
- **App** (`npm run build:app`) → `adapter-static` (SPA), a static client bundle that
  Capacitor wraps in a native iOS/Android shell. The shell talks to the **same Vercel
  backend** over HTTPS for all `/api/play/*` calls and the SSE stream.

```
┌─────────────── Native app (Capacitor) ───────────────┐      ┌──── Vercel ────┐
│  WKWebView / Android WebView                          │      │                │
│   • static SPA bundle (build/)                        │ ───▶ │  /api/play/*   │
│   • PUBLIC_API_BASE_URL = https://<your-app>.vercel…  │ HTTPS│  SSE stream    │
│   • member id in X-Play-Member header / ?member=      │      │  (authority)   │
└───────────────────────────────────────────────────────┘      └────────────────┘
```

## What's already done (in this repo)

- **`capacitor.config.ts`** — appId `com.arcspirits.app`, `webDir: build`, splash/status-bar (`#050310`).
- **`svelte.config.js`** — env-gated adapter: `BUILD_TARGET=capacitor` switches to `adapter-static`.
- **`src/hooks.server.ts`** — CORS for `/api/play/*` from Capacitor origins (`capacitor://localhost`, etc.) incl. OPTIONS preflight. Web requests are same-origin so they're unaffected.
- **`src/lib/play/apiBase.ts`** — every API/SSE call is prefixed by `PUBLIC_API_BASE_URL` (empty on web). Set it for the app build.
- **Cross-origin auth prep** — `playStore` sends the member id via `X-Play-Member` header (fetch) and `?member=` query (EventSource); the events route already reads cookie **or** query param.
- **Scripts** — `build:app`, `cap:sync`, `cap:ios`, `cap:android`.
- **Plugins installed** — `@capacitor/{core,cli,ios,android,status-bar,splash-screen,app,screen-orientation}`.
- **PWA shell** (manifest, icons, service worker, install prompt) — already shipped for the web/installable path.

## ⚠️ Required before the static build will succeed

`adapter-static` cannot run server code, but the play route currently loads its initial
state in **`src/routes/play/[roomCode]/+page.server.ts`** (and `+page.server.ts` in the
lobby). For the app build these must become **client-side** loads:

1. Replace the play `+page.server.ts` with a universal `+page.ts` that, in the browser,
   fetches the room view from the API (`apiUrl('/api/play/sessions/<code>')` style) using
   the stored member id — instead of calling the server-only `loadRoomView`.
2. Persist the member id in `localStorage` (keyed by room) so a relaunched app re-auths
   without the cookie. (Today it lives only in `playStore` memory for the session.)
3. Either add `export const ssr = false` to the play routes for the app build, or guard
   the server load so it's skipped when prerendering.
4. The `/api/play/*` **endpoints stay on Vercel** — they are NOT part of the static
   bundle. The shell calls them via `PUBLIC_API_BASE_URL`.

Until step 1–3 are done, `npm run build:app` will fail on the SSR routes. The web build
(`npm run build`) is unaffected.

## Setup steps (on a machine with the native toolchains)

> Requires: macOS + Xcode (for iOS), Android Studio (for Android), CocoaPods.

```bash
# 1. Point the app at your deployed backend (create .env.production or set in the build env)
echo 'PUBLIC_API_BASE_URL=https://<your-app>.vercel.app' >> .env

# 2. Do the SSR→client-load refactor above, then build the static bundle
npm run build:app            # writes build/

# 3. Initialise native platforms (one-time)
npx cap init "Arc Spirits" com.arcspirits.app --web-dir build
npx cap add ios
npx cap add android

# 4. Each iteration: rebuild + copy web assets into the native projects
npm run cap:sync             # build:app + cap sync
npm run cap:ios              # opens Xcode
npm run cap:android          # opens Android Studio
```

Wire the installed plugins in the app entry (status bar color, splash hide on ready,
optional `ScreenOrientation`): call them inside `if (Capacitor.isNativePlatform())`.

## Store submission notes

- **Apple Developer Program** ($99/yr) + code signing in Xcode; **Google Play Console**
  ($25 one-time).
- Apple rejects "just a website" wrappers — the native shell + standalone UX (already
  responsive/touch-hardened) should clear this, but ensure it feels app-native (splash,
  status bar, no browser chrome, offline-friendly shell).
- Review any reward/loot mechanics for gambling-adjacent policy flags; declare data use.
- No push notifications are wired (product decision — players actively watch the game). If
  that changes, add `@capacitor/push-notifications` + APNs/FCM + a server turn-change trigger.

## Don't cache heavy media on device

The service worker already excludes `/music`, `/splats`, `/sfx`. Keep it that way — iOS
PWA/WebView storage is ~50MB and would evict a bloated cache. These stream from the network.
