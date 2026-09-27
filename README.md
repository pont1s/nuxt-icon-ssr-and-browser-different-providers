# @nuxt/icon: SSR and browser cannot use different providers

Minimal reproduction for `@nuxt/icon@2.5.1` + `nuxt@4.5.2`.

## The problem

`icon.provider` is a single value that drives **both** the SSR side and the browser side
(`src/runtime/plugin.ts` runs on both), and the server bundle / `/api/_nuxt_icon` are only
enabled when `provider === 'server'` (`src/context.ts`, `src/module.ts`).

So this configuration is **inexpressible**:

> SSR resolves icons from the server bundle (in-process, no network),
> while the browser fetches icons directly from an Iconify API / CDN (`iconifyApiEndpoint`).

| `ICON_MODE` | config | SSR | browser |
|---|---|---|---|
| `server`  | `provider: 'server'` + `serverBundle` | server bundle, no network (wanted) | `/api/_nuxt_icon` on the Nuxt server (not wanted) |
| `iconify` | `provider: 'iconify'` + `iconifyApiEndpoint` + `serverBundle` | `serverBundle` silently disabled, SSR fetches from the CDN; `/api/_nuxt_icon` not registered (not wanted) | CDN (wanted) |

`https://api.iconify.design` stands in for a custom CDN. The server bundle uses the local
`@iconify-json/lucide` and `@iconify-json/mdi` collections (a `remote` server bundle is gated the same way).

## Files

- `nuxt.config.ts`: switches `provider` between `'server'` and `'iconify'` via `ICON_MODE`; the rest of the icon config is identical.
- `app/pages/index.vue`: two icons rendered during SSR, two inside `<ClientOnly>`, two behind a `v-if` toggle (the client bundle is empty, so those have to be fetched by the browser).
- `scripts/log-outbound.mjs`: preloaded into the Nitro process (`node --import`), logs every outbound `fetch` via the `undici:request:create` diagnostics channel.
- `scripts/repro.mjs`: for each mode, builds, inspects `.output/server` for bundled collections, starts the server, checks the SSR HTML and outbound requests, probes `/api/_nuxt_icon`, then opens the page in headless Chromium (Playwright) and records where client-side icons are fetched from.

## Run

```sh
pnpm install
pnpm exec playwright install --only-shell chromium   # once
pnpm repro                 # both modes
pnpm repro iconify         # a single mode
```

Manual:

```sh
ICON_MODE=server  pnpm build && pnpm start   # open http://localhost:3000 and watch DevTools > Network
ICON_MODE=iconify pnpm build && pnpm start
```

## Actual output

```
================ ICON_MODE=server ================
[bundle] collections in .output/server: lucide (.output/server/chunks/_/icons.mjs, 584 kB), mdi (.output/server/chunks/_/icons2.mjs, 2951 kB)
[ssr] SSR HTML has inlined SVG for lucide:house: true, mdi:github: true
[ssr] outbound requests made by Nitro during SSR: 0
[api] GET /api/_nuxt_icon/lucide.json?icons=house -> 200 {"prefix":"lucide","icons":{"house":{"body":"<g fill=\"none\" stroke=\"currentCo...
[browser] client-side icon requests (4):
      GET /api/_nuxt_icon/lucide.json?icons=rocket
      GET /api/_nuxt_icon/mdi.json?icons=heart
      GET /api/_nuxt_icon/lucide.json?icons=star
      GET /api/_nuxt_icon/mdi.json?icons=account

================ ICON_MODE=iconify ================
[bundle] collections in .output/server: none (server bundle disabled)
[ssr] SSR HTML has inlined SVG for lucide:house: true, mdi:github: true
[ssr] outbound requests made by Nitro during SSR: 2
      [outbound] GET https://api.iconify.design/lucide.json?icons=house
      [outbound] GET https://api.iconify.design/mdi.json?icons=github
[api] GET /api/_nuxt_icon/lucide.json?icons=house -> 404
[browser] client-side icon requests (4):
      GET https://api.iconify.design/lucide.json?icons=rocket
      GET https://api.iconify.design/mdi.json?icons=heart
      GET https://api.iconify.design/lucide.json?icons=star
      GET https://api.iconify.design/mdi.json?icons=account
```

## Expected

A way to get the SSR half of `ICON_MODE=server` together with the browser half of
`ICON_MODE=iconify`, for example:

```ts
icon: {
  provider: { server: 'server', client: 'iconify' },
  iconifyApiEndpoint: 'https://icons.example.com',
  serverBundle: { collections: ['lucide', 'mdi'] },
}
```

With that config, SSR would use the server bundle (0 outbound requests, `/api/_nuxt_icon` registered for SSR) and
the browser would fetch client-side icons from `iconifyApiEndpoint`, which takes client icon traffic
(and the Nitro cache entries it creates) off the Nuxt servers.
