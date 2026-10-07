#!/usr/bin/env node
// Manage `npm run tunnel` (Vite dev server + Cloudflare tunnel) as a
// background process across agent turns.
//
//   node scripts/tunnel-ctl.mjs start [--port 5173] [--timeout 45]
//   node scripts/tunnel-ctl.mjs status [--json]
//   node scripts/tunnel-ctl.mjs stop
//   node scripts/tunnel-ctl.mjs logs [--tail 50]
//
// Runtime state lives in `.tunnel/` (gitignored): `tunnel.json` + `tunnel.log`.
// The state file is what lets a later turn find and stop the process.

import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DIR = join(ROOT, '.tunnel')
const DEFAULT_STATE = join(DIR, 'tunnel.json')
const DEFAULT_LOG = join(DIR, 'tunnel.log')
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/

function flag(argv, name, fallback = null) {
  const idx = argv.indexOf(`--${name}`)
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1]
  }
  const eq = argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.slice(name.length + 3)
  return fallback
}

function readState(statePath) {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return null
  }
}

function isAlive(pid) {
  if (!Number.isInteger(pid)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(port) })
    socket.setTimeout(1000)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
  })
}

function findPidsByPattern(pattern) {
  try {
    const out = spawnSync('pgrep', ['-f', pattern], { encoding: 'utf8' })
    if (out.status !== 0) return []
    return out.stdout
      .split('\n')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n !== process.pid)
  } catch {
    return []
  }
}

function tailFile(path, n) {
  try {
    const text = readFileSync(path, 'utf8')
    const lines = text.split('\n')
    return lines.slice(Math.max(0, lines.length - n - 1)).join('\n')
  } catch {
    return ''
  }
}

function scanLogForUrl(logPath) {
  try {
    const text = readFileSync(logPath, 'utf8')
    const match = text.match(URL_RE)
    return match ? match[0] : null
  } catch {
    return null
  }
}

function killTree(pid, signal = 'SIGTERM') {
  // Detached child is a process-group leader, so a negative pid kills the
  // whole group (tunnel.mjs + vite + cloudflared). Fall back to single pid.
  try {
    process.kill(-pid, signal)
    return true
  } catch {
    try {
      process.kill(pid, signal)
      return true
    } catch {
      return false
    }
  }
}

async function waitForExit(pid, ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return !isAlive(pid)
}

async function cmdStatus(statePath, asJson) {
  const state = readState(statePath)
  const alive = state ? isAlive(state.pid) : false
  const url = state?.url ?? (state ? scanLogForUrl(state.log ?? DEFAULT_LOG) : null)
  const port = state?.port ?? 5173
  const listening = await portInUse(port)
  const running = alive || listening
  if (asJson) {
    console.log(
      JSON.stringify(
        { running, pid: state?.pid ?? null, url, port, log: state?.log ?? null },
        null,
        2,
      ),
    )
  } else if (running) {
    console.log(`Tunnel running (pid ${state?.pid ?? 'unknown'}, port ${port}).`)
    console.log(url ? `URL: ${url}` : 'URL not published yet — check logs.')
    console.log(`Log: ${state?.log ?? DEFAULT_LOG}`)
  } else {
    console.log('Tunnel not running.')
  }
  process.exit(running ? 0 : 1)
}

async function cmdStart(argv) {
  const port = flag(argv, 'port', '5173')
  const timeoutSec = Number(flag(argv, 'timeout', '45'))
  const statePath = flag(argv, 'state', DEFAULT_STATE)
  const logPath = flag(argv, 'log', DEFAULT_LOG)
  mkdirSync(dirname(statePath), { recursive: true })
  mkdirSync(dirname(logPath), { recursive: true })

  const existing = readState(statePath)
  if (existing && isAlive(existing.pid)) {
    const url = existing.url ?? scanLogForUrl(existing.log ?? logPath)
    console.log(`Already running (pid ${existing.pid}, port ${existing.port}).`)
    if (url) console.log(`URL: ${url}`)
    else console.log('URL not published yet — run `status` or `logs` to check.')
    return
  }
  if (existing && !isAlive(existing.pid)) {
    rmSync(statePath, { force: true }) // stale state from a dead process
  }

  if (await portInUse(port)) {
    console.error(
      `Port ${port} is already in use by something tunnel-ctl did not start.\n` +
        `Stop that process first, or start with a different port:\n` +
        `  node scripts/tunnel-ctl.mjs start --port <port>`,
    )
    process.exit(1)
  }

  const logFd = openSync(logPath, 'a')
  const child = spawn(
    process.execPath,
    [join(ROOT, 'scripts', 'tunnel.mjs'), '--port', String(port), '--state', statePath],
    { cwd: ROOT, detached: true, stdio: ['ignore', logFd, logFd], env: process.env },
  )
  closeSync(logFd)
  child.unref()

  const state = {
    pid: child.pid,
    port: Number(port),
    url: null,
    log: logPath,
    startedAt: new Date().toISOString(),
  }
  writeFileSync(statePath, JSON.stringify(state, null, 2))

  const deadline = Date.now() + timeoutSec * 1000
  while (Date.now() < deadline) {
    if (!isAlive(child.pid)) {
      console.error('Tunnel process exited during startup. Last log output:\n')
      console.error(tailFile(logPath, 40))
      rmSync(statePath, { force: true })
      process.exit(1)
    }
    const current = readState(statePath)
    const url = current?.url ?? scanLogForUrl(logPath)
    if (url) {
      if (!current?.url) {
        writeFileSync(statePath, JSON.stringify({ ...current, ...state, url }, null, 2))
      }
      console.log(`Tunnel running (pid ${child.pid}, port ${port}).`)
      console.log(`URL: ${url}`)
      return
    }
    if (/Failed to start cloudflared/i.test(tailFile(logPath, 20))) {
      console.error('cloudflared failed to start. Last log output:\n')
      console.error(tailFile(logPath, 40))
      process.exit(1)
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  console.log(`Tunnel starting (pid ${child.pid}, port ${port}) — URL not published yet.`)
  console.log(`Wait a little, then run: node scripts/tunnel-ctl.mjs status`)
}

async function cmdStop(argv) {
  const statePath = flag(argv, 'state', DEFAULT_STATE)
  const state = readState(statePath)
  const targets = []
  if (state && Number.isInteger(state.pid)) targets.push(state.pid)

  // Fallback: find orphaned tunnel processes by command pattern.
  if (targets.length === 0 || !targets.some(isAlive)) {
    for (const p of findPidsByPattern('scripts/tunnel\\.mjs')) {
      if (!targets.includes(p)) targets.push(p)
    }
  }

  if (targets.length === 0 || !targets.some(isAlive)) {
    rmSync(statePath, { force: true })
    const port = state?.port ?? 5173
    if (await portInUse(port)) {
      console.error(
        `No tracked tunnel process, but port ${port} is still in use.\n` +
          `Something else is bound there — stop it manually (e.g. lsof -ti :${port}).`,
      )
      process.exit(1)
    }
    console.log('Tunnel not running.')
    return
  }

  for (const pid of targets) {
    if (isAlive(pid)) killTree(pid, 'SIGTERM')
  }
  const deadline = Date.now() + 8000
  let alive = targets.filter(isAlive)
  while (alive.length > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300))
    alive = targets.filter(isAlive)
  }
  for (const pid of alive) {
    killTree(pid, 'SIGKILL')
  }
  await waitForExit(targets[0], 3000)
  rmSync(statePath, { force: true })

  const remaining = targets.filter(isAlive)
  if (remaining.length > 0) {
    console.error(`Could not stop pid(s): ${remaining.join(', ')}`)
    process.exit(1)
  }
  console.log('Tunnel stopped.')
}

function cmdLogs(argv) {
  const statePath = flag(argv, 'state', DEFAULT_STATE)
  const state = readState(statePath)
  const logPath = flag(argv, 'log', state?.log ?? DEFAULT_LOG)
  const tail = Number(flag(argv, 'tail', '50'))
  const target = logPath
  if (!existsSync(target)) {
    console.log('No log file yet — the tunnel has not been started.')
    process.exit(1)
  }
  const url = state?.url ?? scanLogForUrl(target)
  if (url) console.log(`URL: ${url}\n`)
  console.log(tailFile(target, tail))
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'start') await cmdStart(rest)
else if (cmd === 'status') await cmdStatus(flag(rest, 'state', DEFAULT_STATE), rest.includes('--json'))
else if (cmd === 'stop') await cmdStop(rest)
else if (cmd === 'logs') cmdLogs(rest)
else {
  console.error('Usage: node scripts/tunnel-ctl.mjs <start|status|stop|logs> [options]')
  process.exit(1)
}
