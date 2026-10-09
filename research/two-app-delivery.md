# Delivering the capture app and the dashboard

Tech note, 9 October 2026. [REVISED_SPEC.md](../REVISED_SPEC.md) splits Dash into a phone capture app and a PC dashboard. This note covers how to serve both from `dash.danielsharp01.com`. It is a design recommendation, not a measured comparison.

## Recommendation: one origin, split by path

```text
dash.danielsharp01.com/           dashboard
dash.danielsharp01.com/capture/   capture PWA
dash.danielsharp01.com/api/       backend, reverse-proxied
```

The capture app has its own web app manifest with `scope` and `start_url` set to `/capture/`. Installed on a phone, it opens straight into capture. Offline is not in the MVP, so the capture app needs no caching service worker; current Chrome and iOS Safari install from the manifest alone. If offline support comes later, its service worker is registered for `/capture/` only, so its caching cannot affect the dashboard.

One origin means one session cookie for both apps, no CORS on the API, one deploy and one certificate.

Both apps share the origin's browser storage. The online-only MVP keeps little there. If offline support adds an IndexedDB database to the capture app, it needs a name the dashboard will not reuse.

## Alternatives

**Separate subdomains**, such as `capture.dash.danielsharp01.com`. Storage, service workers and deploys are fully isolated. Auth then needs a cookie scoped to the parent domain or tokens, and the API needs CORS unless each subdomain proxies `/api`. Worth it only if the apps move to different hosting or teams.

**One URL with device detection.** Serving capture to phones and the dashboard to PCs from the same address guesses wrong on tablets and whenever someone wants the other app for a minute. Avoid it. At most, `/` on a phone can show a link to capture on first visit.

## Code layout

Two shapes fit Vite:

- **One Vite project with two entry pages**, `index.html` and `capture/index.html`, listed in `build.rollupOptions.input`, with shared domain code in `src/core`. Smallest change from the current `frontend/`. Vite's chunk splitting keeps dashboard-only libraries, such as charting, out of the capture bundle.
- **A workspace** with `packages/core`, `apps/capture` and `apps/dashboard`. Cleaner boundaries and separate dependency lists.

Start with the single project; moving to a workspace later is mechanical. A hand-written manifest is enough for the MVP. If offline arrives, `vite-plugin-pwa` can generate the service worker with a custom scope.

## Native limits

Nothing in the MVP needs a native app. Camera scanning works in the browser, with the zxing ponyfill where `BarcodeDetector` is missing, such as iOS Safari. GPX import is a file input.

Health Connect has no web API. The prototype's disabled Health Connect import can only work from a native Android app. If it becomes a goal, wrap the capture app with Capacitor, which keeps the web code and adds native plugins.
