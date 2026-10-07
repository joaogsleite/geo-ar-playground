import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

function parseFlag(argv, name) {
  const idx = argv.indexOf(`--${name}`)
  if (idx !== -1 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1]
  }
  const eq = argv.find((a) => a.startsWith(`--${name}=`))
  if (eq) return eq.slice(name.length + 3)
  return null
}

const argv = process.argv.slice(2)
const PORT = parseFlag(argv, 'port') ?? process.env.PORT ?? '5173'
const STATE_PATH = parseFlag(argv, 'state') ?? process.env.TUNNEL_STATE ?? null
const ORIGIN = `http://localhost:${PORT}`

const vite = spawn('npm', ['run', 'dev', '--', '--port', PORT, '--strictPort'], {
  stdio: 'inherit',
})

const tunnel = spawn(
  'cloudflared',
  ['tunnel', '--url', ORIGIN],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)

let printedUrl = false
function sniff(chunk) {
  const text = chunk.toString()
  process.stderr.write(text)
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
  if (match && !printedUrl) {
    printedUrl = true
    console.log(`\nTunnel URL (send it to your friends):\n\n  ${match[0]}\n`)
    if (STATE_PATH) {
      try {
        const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
        state.url = match[0]
        writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
      } catch {
        // Best-effort: the URL is already on stdout/stderr (captured to the log).
      }
    }
  }
}

tunnel.stdout.on('data', sniff)
tunnel.stderr.on('data', sniff)
tunnel.on('error', (err) => {
  console.error(
    '\nFailed to start cloudflared. Install it first: `brew install cloudflared`.\n',
  )
  console.error(err.message)
  vite.kill('SIGINT')
  process.exit(1)
})

function shutdown(signal) {
  tunnel.kill(signal)
  vite.kill(signal)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
vite.on('exit', (code) => process.exit(code ?? 0))
tunnel.on('exit', (code) => {
  if (!printedUrl) console.error('\nTunnel exited before printing a URL.')
  vite.kill('SIGINT')
  process.exit(code ?? 0)
})
