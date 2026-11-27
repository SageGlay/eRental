import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

// This harness can address only its own temporary container's Unix socket.
// It has no inputs for hosted project URLs, connection strings or API keys.
const docker = (args, options) =>
  promisify(execFile)('docker', args, {
    timeout: 30_000,
    ...options,
  })
export const read = (path) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
export const literal = (value) =>
  value === null ? 'null' : "'" + value.replaceAll("'", "''") + "'"
export const uuid = (number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
export const asUser = (id, sql, role = 'authenticated') =>
  `SET ROLE ${role}; SET request.jwt.claim.sub = ${literal(id || '')}; ${sql};`

async function until(check, description, milliseconds = 8000) {
  const deadline = Date.now() + milliseconds
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(50)
  }
  assert.fail(description)
}

export function disposableDatabase(database) {
  let container
  const psql = [
    'psql',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    '/var/run/postgresql',
    '-U',
    'postgres',
    '-d',
    database,
  ]

  async function query(sql) {
    const { stdout } = await docker(['exec', container, ...psql, '-c', sql], {
      timeout: 20_000,
    })
    return stdout.trim()
  }

  async function withHeldTransaction(firstSql, run) {
    const first = spawn('docker', ['exec', '-i', container, ...psql], {
      stdio: 'pipe',
    })
    let output = ''
    let errors = ''
    const exit = new Promise((resolve, reject) => {
      first.once('error', reject)
      first.once('close', resolve)
    })
    first.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    first.stderr.on('data', (chunk) => {
      errors += chunk.toString()
    })
    first.stdin.on('error', () => {}) // A terminated child closes the input pipe.
    first.stdin.write(
      `SET application_name = 'erental_first'; BEGIN; ${firstSql}\n\\echo first-ready\n`,
    )
    try {
      await until(
        () => output.includes('first-ready'),
        'First transaction did not reach its held lock',
      )
      return await run(async (command = 'COMMIT') => {
        first.stdin.end(command + ';\n')
        assert.equal(await exit, 0, errors)
      })
    } finally {
      if (!first.stdin.destroyed && !first.stdin.writableEnded)
        first.stdin.end('ROLLBACK;\n')
      await exit
    }
  }

  async function race(firstSql, secondSql, { commitFirst = true } = {}) {
    return withHeldTransaction(firstSql, async (release) => {
      const second = query(
        `SET application_name = 'erental_second'; SET lock_timeout = '12s'; ${secondSql}`,
      ).then(
        () => null,
        (error) => error,
      )
      await until(
        async () =>
          (await query(`
        SELECT EXISTS (
          SELECT FROM pg_stat_activity contender
          JOIN pg_stat_activity holder ON holder.pid = ANY(pg_blocking_pids(contender.pid))
          WHERE contender.application_name = 'erental_second'
            AND holder.application_name = 'erental_first'
        )`)) === 't',
        'Second transaction did not wait on the first transaction',
      )
      await release(commitFirst ? 'COMMIT' : 'ROLLBACK')
      return second
    })
  }

  async function start() {
    const name = `${database}-${randomUUID()}`
    const result = await docker(
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        name,
        '--network',
        'none',
        '--tmpfs',
        '/var/lib/postgresql/data',
        '--env',
        `POSTGRES_DB=${database}`,
        '--env',
        'POSTGRES_PASSWORD=erental-fixture-only',
        'postgres:17-bookworm',
        '-c',
        'listen_addresses=',
      ],
      { timeout: 120_000 },
    )
    container = result.stdout.trim()

    await until(
      async () => {
        try {
          // The image starts a short-lived setup server before its final process.
          const { stdout } = await docker([
            'exec',
            container,
            'cat',
            '/proc/1/comm',
          ])
          return stdout.trim() === 'postgres' && (await query('SELECT 1')) === '1'
        } catch {
          return false
        }
      },
      'Disposable PostgreSQL did not start',
      20_000,
    )
    console.log('Database fixture:', await query('SHOW server_version'))
  }

  async function stop() {
    if (container) await docker(['rm', '-f', container])
  }

  return { start, stop, query, race, withHeldTransaction }
}
