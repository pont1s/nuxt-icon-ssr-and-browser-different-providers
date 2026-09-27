// Preloaded into the Nitro server process (`node --import`).
// Logs every outbound HTTP request made via Node's global fetch (undici),
// regardless of which reference to `fetch` the app captured.
import diagnostics_channel from 'node:diagnostics_channel'

diagnostics_channel.subscribe('undici:request:create', ({ request }) => {
  console.log(`[outbound] ${request.method} ${request.origin}${request.path}`)
})
