import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { build, createServer } from 'vite'
import { categories, json, test } from './fixtures.js'

const fixtureUrl = 'https://config-fixture.supabase.co'
const fixtureKey = 'sb_publishable_configuration_fixture'
const legacyKey = (role) =>
  [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({ role })).toString('base64url'),
    'fixture-signature',
  ].join('.')

async function withFixtureEnvironment({ url, key }, run) {
  const originalUrl = process.env.VITE_SUPABASE_URL
  const originalKey = process.env.VITE_SUPABASE_ANON_KEY
  process.env.VITE_SUPABASE_URL = url ?? ''
  process.env.VITE_SUPABASE_ANON_KEY = key ?? ''
  try {
    return await run()
  } finally {
    if (originalUrl === undefined) delete process.env.VITE_SUPABASE_URL
    else process.env.VITE_SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.VITE_SUPABASE_ANON_KEY
    else process.env.VITE_SUPABASE_ANON_KEY = originalKey
  }
}

const app = test.extend({
  config: [null, { option: true }],
  configuredApp: async ({ config }, use) => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'erental-vite-'))
    let server
    try {
      server = await withFixtureEnvironment(config, () =>
        createServer({
          cacheDir,
          logLevel: 'silent',
          server: { host: '127.0.0.1', port: 0, ws: false },
        }),
      )
      await server.listen()
      await use(`http://127.0.0.1:${server.httpServer.address().port}`)
    } finally {
      await server?.close()
      await rm(cacheDir, { recursive: true, force: true })
    }
  },
})

const malformed = 'not-a-url-config-fixture'
const querySentinel = 'url-query-fixture-sentinel'
const secretLike = ['sb', 'secret', 'fixture', 'sentinel'].join('_')

const invalidCases = [
  ['missing URL', { key: fixtureKey }, /Set VITE_SUPABASE_URL/],
  ['invalid URL', { url: malformed, key: fixtureKey }, /valid HTTP or HTTPS/],
  [
    'URL with a query',
    { url: `${fixtureUrl}?value=${querySentinel}`, key: fixtureKey },
    /without credentials, a query, or a fragment/,
  ],
  ['missing key', { url: fixtureUrl }, /Set VITE_SUPABASE_ANON_KEY/],
  ['secret key', { url: fixtureUrl, key: secretLike }, /must be a public/],
  [
    'privileged legacy key',
    { url: fixtureUrl, key: legacyKey('service_role') },
    /must be a public/,
  ],
]

for (const [name, config, expected] of invalidCases) {
  app.describe(name, () => {
    app.use({ config })
    app(
      'shows a safe setup error before the route or client starts',
      async ({ page, configuredApp }) => {
        const requests = []
        const consoleMessages = []
        page.on('console', (message) => consoleMessages.push(message.text()))
        await page.route('**/*', async (route) => {
          if (new URL(route.request().url()).origin === configuredApp)
            return route.continue()
          requests.push(route.request().url())
          await route.abort()
        })

        await page.goto(`${configuredApp}/profile`)
        await expect(
          page.getByRole('heading', { name: 'Supabase setup required' }),
        ).toBeVisible()
        await expect(page.getByRole('alert')).toHaveText(expected)
        await expect(page).toHaveTitle('Supabase setup required · eRental')
        await expect(page).toHaveURL(`${configuredApp}/profile`)
        const display = [
          await page.locator('body').innerText(),
          ...consoleMessages,
        ].join('\n')
        for (const value of [
          fixtureUrl,
          fixtureKey,
          malformed,
          querySentinel,
          config.key,
        ].filter(Boolean)) {
          expect(display).not.toContain(value)
        }
        expect(requests).toEqual([])
      },
    )
  })
}

test('a rejected configuration does not ship its raw URL or key in production assets', async () => {
  const output = await withFixtureEnvironment(
    { url: fixtureUrl, key: secretLike },
    () => build({ logLevel: 'silent', build: { write: false } }),
  )
  const files = [output]
    .flatMap((bundle) => bundle)
    .flatMap((bundle) => bundle.output)
  const text = files
    .map((file) => (file.type === 'chunk' ? file.code : file.source))
    .join('\n')
  expect(text).toContain('VITE_SUPABASE_ANON_KEY must be a public')
  expect(text).not.toContain(secretLike)
  expect(text).not.toContain(fixtureUrl)
})

for (const [name, url, key] of [
  ['HTTPS with a publishable key', fixtureUrl, fixtureKey],
  [
    'local HTTP with a legacy anon key',
    'http://127.0.0.1:54321',
    legacyKey('anon'),
  ],
]) {
  app.describe(name, () => {
    app.use({ config: { url, key } })
    app(
      'starts the normal app with the configured public client',
      async ({ page, configuredApp }) => {
        await page.route(`${url}/rest/v1/**`, async (route) => {
          expect(route.request().headers().apikey).toBe(key)
          await json(
            route,
            route.request().url().includes('/categories?') ? categories : [],
          )
        })
        await page.goto(configuredApp)
        await expect(
          page.getByRole('heading', { name: /Rent almost anything/ }),
        ).toBeVisible()
        await expect(
          page.getByRole('link', { name: /Electronics and Gadgets/ }),
        ).toBeVisible()
        await expect(
          page.getByRole('heading', { name: 'Supabase setup required' }),
        ).toHaveCount(0)
      },
    )
  })
}
