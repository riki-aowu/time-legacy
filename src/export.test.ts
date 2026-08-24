import { describe, expect, it } from 'vitest'
import { conversationText } from './export'

describe('conversationText', () => {
  const date = () => '2026-08-25 12:00'
  it('keeps genuine newlines for plain text, markdown and code', () => {
    const output = conversationText('Archive', [{ role: 'human', createdAt: 'x', text: 'single line' }, { role: 'assistant', text: 'first paragraph\n\nsecond paragraph\n\n```ts\nconst value = 1\n```\n\n\nlast line' }], date)
    expect(output).toContain('## 你\n*2026-08-25 12:00*\nsingle line')
    expect(output).toContain('first paragraph\n\nsecond paragraph')
    expect(output).toContain('```ts\nconst value = 1\n```')
    expect(output).toContain('```\n\n\nlast line')
    expect(output).not.toContain('\\\\n')
  })
})
