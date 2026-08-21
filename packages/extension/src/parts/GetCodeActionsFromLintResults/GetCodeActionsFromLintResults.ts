import type { LintResult } from '../EslintEvaluationWorker/EslintEvaluationWorker.ts'

interface Edit {
  readonly endOffset: number
  readonly inserted: string
  readonly startOffset: number
}

interface CommentConfig {
  readonly blockEnd: string
  readonly blockStart: string
  readonly line: string
  readonly useBlockForLine: boolean
}

export interface CodeAction {
  readonly edits: readonly Edit[]
  readonly kind: 'quickfix'
  readonly name: string
}

const getCommentConfig = (languageId: string): CommentConfig => {
  if (languageId === 'yaml') {
    return {
      blockEnd: '',
      blockStart: '#',
      line: '#',
      useBlockForLine: false,
    }
  }
  if (languageId === 'css' || languageId === 'json') {
    return {
      blockEnd: '*/',
      blockStart: '/*',
      line: '//',
      useBlockForLine: true,
    }
  }
  return {
    blockEnd: '*/',
    blockStart: '/*',
    line: '//',
    useBlockForLine: false,
  }
}

const getLineStart = (text: string, line: number): number => {
  let offset = 0
  for (let currentLine = 1; currentLine < line; currentLine++) {
    const nextLine = text.indexOf('\n', offset)
    if (nextLine === -1) {
      return text.length
    }
    offset = nextLine + 1
  }
  return offset
}

const getLineEnd = (text: string, lineStart: number): number => {
  const newLine = text.indexOf('\n', lineStart)
  const lineEnd = newLine === -1 ? text.length : newLine
  return lineEnd > lineStart && text[lineEnd - 1] === '\r'
    ? lineEnd - 1
    : lineEnd
}

const getResultStart = (text: string, result: LintResult): number => {
  return Math.min(
    getLineStart(text, result.line) + Math.max(result.column - 1, 0),
    text.length,
  )
}

const getResultEnd = (text: string, result: LintResult): number => {
  if (result.endLine && result.endColumn) {
    return Math.min(
      getLineStart(text, result.endLine) + Math.max(result.endColumn - 1, 0),
      text.length,
    )
  }
  const lineStart = getLineStart(text, result.line)
  return getLineEnd(text, lineStart)
}

const resultContainsOffset = (
  text: string,
  result: LintResult,
  offset: number,
): boolean => {
  return (
    offset >= getResultStart(text, result) &&
    offset <= getResultEnd(text, result)
  )
}

const getEol = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n')

const formatBlockDirective = (
  config: CommentConfig,
  directive: string,
): string => {
  return config.blockEnd
    ? `${config.blockStart} ${directive} ${config.blockEnd}`
    : `${config.blockStart} ${directive}`
}

const getDirectiveInsertionOffset = (
  line: string,
  config: CommentConfig,
): number => {
  if (!config.blockEnd) {
    return line.length
  }
  const closingTag = line.indexOf(config.blockEnd)
  if (closingTag === -1) {
    return line.length
  }
  let offset = closingTag
  while (offset > 0 && line[offset - 1] === ' ') {
    offset--
  }
  return offset
}

const getDisableLineEdit = (
  text: string,
  line: number,
  ruleId: string,
  languageId: string,
): Edit => {
  const config = getCommentConfig(languageId)
  const lineStart = getLineStart(text, line)
  if (line > 1) {
    const previousLineStart = getLineStart(text, line - 1)
    const previousLineEnd = getLineEnd(text, previousLineStart)
    const previousLine = text.slice(previousLineStart, previousLineEnd)
    if (
      previousLine.includes(`${config.line} eslint-disable-next-line`) ||
      previousLine.includes(`${config.blockStart} eslint-disable-next-line`)
    ) {
      const insertionOffset = getDirectiveInsertionOffset(previousLine, config)
      return {
        endOffset: previousLineStart + insertionOffset,
        inserted: `, ${ruleId}`,
        startOffset: previousLineStart + insertionOffset,
      }
    }
  }
  const lineEnd = getLineEnd(text, lineStart)
  const lineText = text.slice(lineStart, lineEnd)
  const indentation = /^[\t ]*/.exec(lineText)?.[0] ?? ''
  const directive = `eslint-disable-next-line ${ruleId}`
  const comment = config.useBlockForLine
    ? formatBlockDirective(config, directive)
    : `${config.line} ${directive}`
  return {
    endOffset: lineStart,
    inserted: `${indentation}${comment}${getEol(text)}`,
    startOffset: lineStart,
  }
}

const getDisableFileEdit = (
  text: string,
  ruleId: string,
  languageId: string,
): Edit => {
  const config = getCommentConfig(languageId)
  const directive = formatBlockDirective(config, `eslint-disable ${ruleId}`)
  const eol = getEol(text)
  // eslint-disable-next-line e18e/prefer-string-fromcharcode
  const byteOrderMark = String.fromCodePoint(65_279)
  const bomLength = text.startsWith(byteOrderMark) ? 1 : 0
  if (text.startsWith('#!', bomLength)) {
    const firstNewLine = text.indexOf('\n', bomLength)
    if (firstNewLine === -1) {
      return {
        endOffset: text.length,
        inserted: `${eol}${directive}${eol}`,
        startOffset: text.length,
      }
    }
    return {
      endOffset: firstNewLine + 1,
      inserted: `${directive}${eol}`,
      startOffset: firstNewLine + 1,
    }
  }
  return {
    endOffset: bomLength,
    inserted: `${directive}${eol}`,
    startOffset: bomLength,
  }
}

const addAction = (
  actions: CodeAction[],
  names: Set<string>,
  name: string,
  edit: Edit,
): void => {
  if (names.has(name)) {
    return
  }
  names.add(name)
  actions.push({ edits: [edit], kind: 'quickfix', name })
}

export const getCodeActionsFromLintResults = (
  results: readonly LintResult[],
  offset: number,
  text = '',
  languageId = 'javascript',
): readonly CodeAction[] => {
  const actions: CodeAction[] = []
  const names = new Set<string>()
  for (const result of results) {
    const { fix, ruleId } = result
    if (!resultContainsOffset(text, result, offset)) {
      continue
    }
    if (fix) {
      addAction(
        actions,
        names,
        ruleId ? `Fix '${ruleId}' problem` : 'Fix ESLint problem',
        {
          endOffset: fix.range[1],
          inserted: fix.text,
          startOffset: fix.range[0],
        },
      )
    }
    if (ruleId) {
      addAction(
        actions,
        names,
        `Disable ${ruleId} for this line`,
        getDisableLineEdit(text, result.line, ruleId, languageId),
      )
      addAction(
        actions,
        names,
        `Disable ${ruleId} for the entire file`,
        getDisableFileEdit(text, ruleId, languageId),
      )
    }
  }
  return actions
}
