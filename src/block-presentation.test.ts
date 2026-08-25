import { expect, it } from 'vitest'
import { blockPresentation } from './block-presentation'

it('renders normal text blocks directly and keeps technical blocks collapsed', () => {
  expect(blockPresentation('text')).toBe('direct')
  expect(blockPresentation('code')).toBe('direct')
  expect(blockPresentation('thinking')).toBe('collapsed')
  expect(blockPresentation('tool_use')).toBe('collapsed')
  expect(blockPresentation('tool_result')).toBe('collapsed')
  expect(blockPresentation('token_budget')).toBe('collapsed')
  expect(blockPresentation('flag')).toBe('collapsed')
  expect(blockPresentation('unknown:future')).toBe('collapsed')
})
