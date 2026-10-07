---
name: tunnel
description: Start, stop, and check the Cloudflare tunnel + Vite dev server. Use when the user says tunnel, share link, public URL, trycloudflare, start/stop sharing, or asks whether the dev server is running.
---

# Tunnel

Manage `npm run tunnel` (Vite on port 5173 + `cloudflared`) as a background
process that survives across turns. State lives in `.tunnel/tunnel.json`
(pid, port, URL); logs in `.tunnel/tunnel.log`.

Never run `npm run tunnel` directly in the foreground — it blocks. Always go
through `scripts/tunnel-ctl.mjs` (or the `tunnel:*` npm scripts).

## Start

```
node scripts/tunnel-ctl.mjs start [--port 5173] [--timeout 45]
```

- If it reports "Already running", do not start a second one. Report the
  existing pid and URL instead.
- If it reports the port is in use by an untracked process, stop that process
  first or ask the user for another port. Do not kill unknown processes
  without asking.
- Success criterion: output contains a `https://…trycloudflare.com` URL.
  Report that URL to the user. If the URL is not published yet when the
  command times out, run `status` once before giving up.

## Status

```
node scripts/tunnel-ctl.mjs status
```

- Exit 0 = running, exit 1 = not running. Report pid, port, and URL when
  running.

## Stop

```
node scripts/tunnel-ctl.mjs stop
```

- Stops the tracked `tunnel.mjs` process group (Vite + cloudflared) with
  SIGTERM, escalates to SIGKILL, and removes the state file.
- Success criterion: output says "Tunnel stopped." or "Tunnel not running."
  Verify with `status` if unsure.

## Logs

```
node scripts/tunnel-ctl.mjs logs [--tail 50]
```

- Use when start/status reports no URL yet, or the user reports the link is
  broken. The public URL also appears in the log as
  `https://…trycloudflare.com`.
