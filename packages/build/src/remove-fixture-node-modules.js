import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

export const removeFixtureNodeModules = async (fixturesPath) => {
  const fixtureEntries = await readdir(fixturesPath, { withFileTypes: true })
  await Promise.all(
    fixtureEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        rm(join(fixturesPath, entry.name, 'node_modules'), {
          force: true,
          recursive: true,
        }),
      ),
  )
}
