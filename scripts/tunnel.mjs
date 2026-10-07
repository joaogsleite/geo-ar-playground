import { spawn } from 'node:child_process'

const PORT = process.env.PORT ?? '5173'
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
