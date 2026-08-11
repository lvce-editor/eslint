import type { Linter } from 'eslint'
import * as Path from '../Path/Path.ts'

type LintMessage = ReturnType<Linter['verify']>[number]

interface Suppressions {
  readonly [filePath: string]: {
    readonly [ruleId: string]: {
      readonly count: number
    }
  }
}

export interface LoadedSuppressions {
  readonly baseDirectory: string
  readonly suppressions: Suppressions
}

const countErrorViolationsByRule = (
  messages: readonly LintMessage[],
): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = Object.create(null)
  for (const message of messages) {
    if (message.severity !== 2 || !message.ruleId) {
      continue
    }
    counts[message.ruleId] = (counts[message.ruleId] ?? 0) + 1
  }
  return counts
}

export const applySuppressions = (
  messages: readonly LintMessage[],
  filePath: string,
  loadedSuppressions: LoadedSuppressions | undefined,
): readonly LintMessage[] => {
  if (!loadedSuppressions) {
    return messages
  }
  const baseDirectory = Path.toFileSystemPath(loadedSuppressions.baseDirectory)
  const relativeFilePath = Path.relative(baseDirectory, filePath)
  const fileSuppressions = loadedSuppressions.suppressions[relativeFilePath]
  if (!fileSuppressions) {
    return messages
  }
  const violationCounts = countErrorViolationsByRule(messages)
  const suppressedRules = new Set<string>()
  for (const [ruleId, violationsCount] of Object.entries(violationCounts)) {
    const suppressionsCount = fileSuppressions[ruleId]?.count
    if (
      typeof suppressionsCount === 'number' &&
      violationsCount <= suppressionsCount
    ) {
      suppressedRules.add(ruleId)
    }
  }
  if (suppressedRules.size === 0) {
    return messages
  }
  return messages.filter(
    (message) => !message.ruleId || !suppressedRules.has(message.ruleId),
  )
}
