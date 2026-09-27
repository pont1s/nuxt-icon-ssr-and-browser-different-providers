// ICON_MODE=server  -> provider: 'server'  (server bundle ON, browser -> /api/_nuxt_icon)
// ICON_MODE=iconify -> provider: 'iconify' (browser -> CDN, but server bundle silently disabled)
//
// Desired (inexpressible today): SSR uses the server bundle, browser uses the CDN.
const mode = process.env.ICON_MODE === 'iconify' ? 'iconify' : 'server'

// Stand-in for a custom Iconify-compatible CDN (e.g. https://icons.example.com)
const CDN = 'https://api.iconify.design'

console.log(`[repro] ICON_MODE=${mode}`)

export default defineNuxtConfig({
  compatibilityDate: '2026-09-01',
  modules: ['@nuxt/icon'],
  icon: {
    provider: mode,
    iconifyApiEndpoint: CDN,
    // Local collections from @iconify-json/*; a `remote` bundle behaves the same way w.r.t. the gate
    serverBundle: {
      collections: ['lucide', 'mdi'],
    },
    // keep the client bundle empty, so every client-side icon has to be fetched
    clientBundle: { scan: false, icons: [] },
  },
})
