import { expect, it } from 'vitest'
import { serializeRawJson } from './raw'

it('never truncates large raw JSON values', () => {
  const content = 'x'.repeat(25001)
  const output = serializeRawJson({ content })
  expect(output).toContain(content)
  expect(output.length).toBeGreaterThan(25001)
})
