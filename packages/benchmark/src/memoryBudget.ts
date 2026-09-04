import { readFile } from 'node:fs/promises'
import type { HeapSummary } from './heapSnapshot.ts'

const BudgetKeys = [
  'evaluatorScriptSource',
  'retainedGraphSource',
  'stringShallowSize',
  'totalHeap',
  'typeScriptCatalogs',
] as const

type BudgetKey = (typeof BudgetKeys)[number]

export type MemoryBudget = Readonly<Record<BudgetKey, number>>

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const parseMemoryBudget = (value: unknown): MemoryBudget => {
  if (!isRecord(value)) {
    throw new Error('Memory budget must be a JSON object')
  }
  const unknownKeys = Object.keys(value).filter(
    (key) => !BudgetKeys.includes(key as BudgetKey),
  )
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown memory budget key ${unknownKeys[0]}`)
  }
  const budget = Object.fromEntries(
    BudgetKeys.map((key) => {
      const limit = value[key]
      if (
        typeof limit !== 'number' ||
        !Number.isSafeInteger(limit) ||
        limit < 0
      ) {
        throw new Error(`Memory budget ${key} must be a non-negative integer`)
      }
      return [key, limit]
    }),
  )
  return budget as MemoryBudget
}

export const loadMemoryBudget = async (path: string): Promise<MemoryBudget> => {
  const value = JSON.parse(await readFile(path, 'utf8')) as unknown
  return parseMemoryBudget(value)
}

export const assertMemoryBudget = (
  summary: HeapSummary,
  budget: MemoryBudget,
): void => {
  const exceeded = BudgetKeys.filter((key) => summary[key] > budget[key])
  if (exceeded.length === 0) {
    return
  }
  const details = exceeded
    .map(
      (key) =>
        `- ${key}: ${summary[key].toLocaleString('en-US')} > ${budget[key].toLocaleString('en-US')} bytes`,
    )
    .join('\n')
  throw new Error(`ESLint memory budget exceeded:\n${details}`)
}
