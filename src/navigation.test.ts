import { describe, expect, it } from 'vitest'
import { resolveSearchNavigation } from './navigation'
import type { SearchResult } from './data/queries'

const result = (overrides: Partial<SearchResult>): SearchResult => ({ kind: 'conversation', id: 'x', entityId: 'x', title: '', excerpt: '', route: '', source: '', match: 'other', ...overrides })
describe('stable search navigation', () => {
  it('selects the exact memory path', () => expect(resolveSearchNavigation(result({ kind: 'memory_file', memoryPath: '/deep/memory.md' }))).toEqual({ page: 'memories', memoryPath: '/deep/memory.md' }))
  it('opens the exact project doc', () => expect(resolveSearchNavigation(result({ kind: 'project_doc', projectUuid: 'p', docUuid: 'd' }))).toEqual({ page: 'projects', projectUuid: 'p', docUuid: 'd' }))
  it('uses the stable reflection id', () => expect(resolveSearchNavigation(result({ kind: 'reflection', reflectionId: 'r-1' }))).toEqual({ page: 'reflections', reflectionId: 'r-1' }))
})
