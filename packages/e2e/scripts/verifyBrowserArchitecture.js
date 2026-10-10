import { readFile } from 'node:fs/promises'
import os from 'node:os'
import { chromium } from 'playwright-core'

const getBinaryArchitecture = async (path) => {
  const binary = await readFile(path)

  if (binary.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    const machine = binary.readUInt16LE(18)
    if (machine === 0x3e) return 'x64'
    if (machine === 0xb7) return 'arm64'
  }

  if (binary.subarray(0, 2).toString() === 'MZ') {
    const peOffset = binary.readUInt32LE(0x3c)
    if (binary.toString('ascii', peOffset, peOffset + 4) === 'PE\0\0') {
      const machine = binary.readUInt16LE(peOffset + 4)
      if (machine === 0x8664) return 'x64'
      if (machine === 0xaa64) return 'arm64'
      if (machine === 0x14c) return 'x86'
    }
  }

  const magic = binary.readUInt32BE(0)
  const isFatBinary = magic === 0xcafebabe || magic === 0xcafebabf
  const cpuOffset = isFatBinary ? 8 : 4
  const cpuType = binary.readUInt32BE(cpuOffset)
  if (cpuType === 0x01000007 || cpuType === 7) return 'x64'
  if (cpuType === 0x0100000c || cpuType === 12) return 'arm64'

  return 'unknown'
}

const browser = await chromium.launch({ headless: true })

try {
  const executablePath = chromium.executablePath()
  const page = await browser.newPage()
  const browserInfo = await page.evaluate(async () => {
    if (!navigator.userAgentData) {
      return { userAgent: navigator.userAgent }
    }
    const { architecture, bitness } =
      await navigator.userAgentData.getHighEntropyValues([
        'architecture',
        'bitness',
      ])
    return { architecture, bitness }
  })

  console.log(
    JSON.stringify({
      runnerPlatform: process.platform,
      runnerArchitecture: os.arch(),
      nodeArchitecture: process.arch,
      chromiumVersion: browser.version(),
      chromiumExecutable: executablePath,
      chromiumExecutableArchitecture:
        await getBinaryArchitecture(executablePath),
      chromiumArchitecture: browserInfo,
    }),
  )
} finally {
  await browser.close()
}
