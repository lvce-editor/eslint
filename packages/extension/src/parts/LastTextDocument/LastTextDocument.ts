export interface TextDocument {
  readonly text: string
  readonly uri: string
}

const state: {
  lastTextDocument: TextDocument | undefined
} = {
  lastTextDocument: undefined,
}

export const get = (): TextDocument | undefined => {
  return state.lastTextDocument
}

export const set = (textDocument: TextDocument): void => {
  state.lastTextDocument = textDocument
}

export const reset = (): void => {
  state.lastTextDocument = undefined
}
