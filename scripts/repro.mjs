// Builds and runs the app in both modes and prints observable evidence.
// Usage: node scripts/repro.mjs [server|iconify ...]
import { spawn, execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const CDN_HOST = 'api.iconify.design'
const modes = process.argv.slice(2).length ? process.argv.slice(2) : ['server', 'iconify']
const root = new URL('..', import.meta.url).pathname

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

function inspectServerBundle() {
  // Which icon collections ended up in the Nitro server output (= `#nuxt-icon-server-bundle`)?
  const server = join(root, '.output/server')
  const found = []
  for (const f of walk(server)) {
    if (!/\.m?js$/.test(f)) continue
    const m = readFileSync(f, 'utf8').match(/^var prefix = "([\w-]+)";/m)
    if (m) found.push(`${m[1]} (${f.replace(root, '')}, ${Math.round(statSync(f).size / 1024)} kB)`)
  }
  return found.length ? found.join(', ') : 'none (server bundle disabled)'
}

async function runMode(mode, port) {
  console.log(`\n================ ICON_MODE=${mode} ================`)
  const env = { ...process.env, ICON_MODE: mode }
  const buildLog = execSync('pnpm nuxt build', { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  for (const line of buildLog.split('\n'))
    if (/\[repro\]/.test(line)) console.log('[build] ' + line.trim())

  console.log('[bundle] collections in .output/server: ' + inspectServerBundle())

  const logs = []
  const srv = spawn('node', ['--import', './scripts/log-outbound.mjs', '.output/server/index.mjs'], {
    cwd: root, env: { ...env, PORT: String(port), NITRO_PORT: String(port) },
  })
  srv.stdout.on('data', d => logs.push(...d.toString().split('\n').filter(Boolean)))
  srv.stderr.on('data', d => logs.push(...d.toString().split('\n').filter(Boolean)))
  const base = `http://localhost:${port}`
  for (let i = 0; i < 100; i++) {
    try { await fetch(base + '/favicon.ico'); break }
    catch { await new Promise(r => setTimeout(r, 100)) }
  }
  const outbound = () => logs.filter(l => l.startsWith('[outbound]'))

  try {
    // 1) Plain SSR request (no browser)
    const before = outbound().length
    const html = await (await fetch(base + '/')).text()
    const ssrOutbound = outbound().slice(before)
    const hasSvg = name => new RegExp(`i-${name.replace(':', '\\\\:')}[^}]*--svg:url\\("data:image/svg`).test(html)
    console.log(`[ssr] SSR HTML has inlined SVG for lucide:house: ${hasSvg('lucide:house')}, mdi:github: ${hasSvg('mdi:github')}`)
    console.log(`[ssr] outbound requests made by Nitro during SSR: ${ssrOutbound.length}`)
    ssrOutbound.forEach(l => console.log('      ' + l))

    // 2) Is the local endpoint there?
    const api = await fetch(base + '/api/_nuxt_icon/lucide.json?icons=house')
    const apiBody = await api.text()
    console.log(`[api] GET /api/_nuxt_icon/lucide.json?icons=house -> ${api.status} ${apiBody.slice(0, 80).replace(/\s+/g, ' ')}${apiBody.length > 80 ? '...' : ''}`)

    // 3) Browser: where do client-side icons come from?
    const browser = await chromium.launch()
    const page = await browser.newPage()
    const iconRequests = []
    page.on('request', (req) => {
      const u = new URL(req.url())
      if (u.pathname.startsWith('/api/_nuxt_icon') || u.host === CDN_HOST)
        iconRequests.push(`${req.method()} ${u.host === CDN_HOST ? u.origin : ''}${u.pathname}${u.search}`)
    })
    await page.goto(base + '/', { waitUntil: 'networkidle' })
    await page.click('#toggle')
    await page.waitForSelector('#toggled')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    const rendered = await page.$$eval('#client .iconify, #toggled .iconify', els =>
      els.map(e => `${[...e.classList].find(c => c.startsWith('i-'))}=${getComputedStyle(e).getPropertyValue('--svg') ? 'svg' : 'EMPTY'}`))
    await browser.close()
    console.log(`[browser] client-side icon requests (${iconRequests.length}):`)
    iconRequests.forEach(r => console.log('      ' + r))
    console.log(`[browser] client-only icons rendered: ${rendered.join(', ')}`)
  }
  finally {
    srv.kill()
  }
}

let port = 3456
for (const mode of modes)
  await runMode(mode, port++)
