import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type CDPSession } from 'playwright'
import type { BenchmarkOptions, RunningServer } from './types.ts'
import { createBenchmarkTest } from './benchmarkTest.ts'
import { startCpuProfile, stopCpuProfile } from './cpuProfile.ts'
import { prepareRepository, resolveBenchmarkFile } from './repository.ts'
import { startServer } from './server.ts'

const root = resolve(import.meta.dirname, '../../..')

// cspell:ignore backgrounding domcontentloaded

const ignoreError = async (
  operation: () => Promise<unknown>,
): Promise<void> => {
  try {
    await operation()
  } catch {
    // Best-effort cleanup must not hide the benchmark result.
  }
}

export const runBenchmark = async (
  options: BenchmarkOptions,
): Promise<void> => {
  const output = resolve(options.output)
  const profilePath = join(output, 'cpu-profile.json')
  await mkdir(output, { recursive: true })
  await mkdir(join(root, '.tmp'), { recursive: true })

  const repository = await prepareRepository(options.repo)
  const testDirectory = await mkdtemp(
    join(root, '.tmp', 'eslint-benchmark-test-'),
  )
  let browser: Browser | undefined
  let cdp: CDPSession | undefined
  let server: RunningServer | undefined
  let profiling = false
  const browserErrors: string[] = []
  try {
    const filePath = await resolveBenchmarkFile(repository.path, options.file)
    await createBenchmarkTest(testDirectory, repository.path, filePath)

    browser = await chromium.launch({
      args: [
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
      ],
      headless: !options.headed,
    })
    cdp = await browser.newBrowserCDPSession()

    server = await startServer({
      extensionPath: join(root, 'packages', 'extension'),
      serverPath: fileURLToPath(
        import.meta.resolve('@lvce-editor/server/bin/server.js'),
      ),
      testPath: testDirectory,
      timeout: options.timeout,
      workspace: repository.path,
    })

    const context = await browser.newContext({
      viewport: { height: 720, width: 1280 },
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => {
      browserErrors.push(error.stack || error.message)
    })
    const benchmarkUrl = new URL('/tests/eslint.benchmark.html', server.url)

    let warmupDurationMs: number | undefined
    if (options.reload) {
      const warmupStartedAt = performance.now()
      await page.goto(benchmarkUrl.href, {
        timeout: options.timeout,
        waitUntil: 'domcontentloaded',
      })
      const warmupOverlay = page.locator('#TestOverlay')
      await warmupOverlay.waitFor({
        state: 'visible',
        timeout: options.timeout,
      })
      const warmupState = await warmupOverlay.getAttribute('data-state')
      if (warmupState !== 'pass') {
        throw new Error(
          (await warmupOverlay.textContent()) ||
            `Benchmark warmup finished with unexpected state ${warmupState}`,
        )
      }
      warmupDurationMs = performance.now() - warmupStartedAt
    }

    await startCpuProfile(cdp)
    profiling = true
    const startedAt = performance.now()
    if (options.reload) {
      await page.reload({
        timeout: options.timeout,
        waitUntil: 'domcontentloaded',
      })
    } else {
      await page.goto(benchmarkUrl.href, {
        timeout: options.timeout,
        waitUntil: 'domcontentloaded',
      })
    }
    const overlay = page.locator('#TestOverlay')
    await overlay.waitFor({ state: 'visible', timeout: options.timeout })
    const durationMs = performance.now() - startedAt
    const state = await overlay.getAttribute('data-state')
    const error = (await overlay.textContent()) || ''
    if (state !== 'pass') {
      throw new Error(
        error || `Benchmark finished with unexpected state ${state}`,
      )
    }

    const lintDurationMs = await stopCpuProfile(cdp, profilePath)
    profiling = false
    const metadata = {
      browserErrors,
      durationMs,
      file: options.file,
      lintDurationMs,
      profile: 'cpu-profile.json',
      reload: options.reload,
      repo: options.repo,
      repositoryPath: repository.path,
      url: benchmarkUrl.href,
      warmupDurationMs,
    }
    await writeFile(
      join(output, 'benchmark.json'),
      `${JSON.stringify(metadata, undefined, 2)}\n`,
    )
    process.stdout.write(
      `ESLint benchmark completed in ${(durationMs / 1000).toFixed(2)}s\n`,
    )
    if (lintDurationMs !== undefined) {
      process.stdout.write(
        `ESLint lint completed in ${lintDurationMs.toFixed(2)}ms\n`,
      )
    }
    if (warmupDurationMs !== undefined) {
      process.stdout.write(
        `ESLint benchmark warmup completed in ${(warmupDurationMs / 1000).toFixed(2)}s\n`,
      )
    }
    process.stdout.write(
      `Wrote results to ${relative(process.cwd(), output) || output}\n`,
    )
  } finally {
    if (cdp && profiling) {
      const activeCdp = cdp
      await ignoreError(() => stopCpuProfile(activeCdp, profilePath))
    }
    if (cdp) {
      const activeCdp = cdp
      await ignoreError(() => activeCdp.detach())
    }
    if (browser) {
      const activeBrowser = browser
      await ignoreError(() => activeBrowser.close())
    }
    if (server) {
      const activeServer = server
      await ignoreError(() => activeServer.close())
    }
    await rm(testDirectory, { force: true, recursive: true })
    await repository.cleanup()
  }
}
