import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllData, DB_NAME, persistImport } from './db'
import { emptyImport } from './types'
import { getConversationDetail, getDataPage, getMemories, getProject, listArchive, listProjects, searchArchive } from './queries'

const erase = () => new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
const session = () => ({ id: crypto.randomUUID(), startedAt: new Date().toISOString(), categories: ['conversations' as const], parts: [{ category: 'conversations' as const, part: 0 }], filesTotal: 1, filesSuccess: 0, filesFailed: 0, filesUnknown: 0, counts: { inserted: 0, updated: 0, unchanged: 0, conflicted: 0 }, records: {}, errors: [], conflicts: [] })
beforeEach(async () => { await erase() })

describe('Phase 3A query contracts', () => {
  it('supplies stable archive, detail, memory, project and safe search data', async () => {
    const data = emptyImport(); const source = { sessionId: 's', category: 'conversations' as const, part: 0, relativePath: 'conversations.json' }
    data.conversations.push({ ...source, uuid: 'c', name: 'Claude archive', summary: 'summary', updatedAt: '2026-01-02T00:00:00Z', raw: { uuid: 'c' } }); data.messages.push({ ...source, uuid: 'm', conversationUuid: 'c', sender: 'assistant', text: 'needle message', raw: { uuid: 'm' } }); data.blocks.push({ ...source, id: 'm:0', messageUuid: 'm', conversationUuid: 'c', blockIndex: 0, type: 'thinking', normalizedContent: 'private thought', raw: {} }); data.projects.push({ ...source, category: 'projects', uuid: 'p', name: 'Project needle', description: '', promptTemplate: 'instruction', isPrivate: true, isStarterProject: false, raw: {} }); data.projectDocs.push({ ...source, category: 'projects', uuid: 'd', projectUuid: 'p', filename: 'guide.md', content: 'guide content', raw: {} }); data.projectMemories.push({ ...source, category: 'memories', id: 'pm', projectUuid: 'p', content: 'memory body', raw: {} }); data.globalMemories.push({ ...source, category: 'memories', id: 'gm', content: 'global', raw: {} }); data.memoryFiles.push({ ...source, category: 'memories', id: 'mf', path: '/nested/file.md', content: 'file content', raw: {} }); data.usersMetadata.push({ ...source, category: 'light_metadata', uuid: 'u', raw: { email: 'do-not-search' }, sensitive: true }); await persistImport(data, session())
    expect((await listArchive({ filter: 'thinking' })).map(item => item.id)).toEqual(['c'])
    expect((await getConversationDetail('c'))?.messages[0].blocks[0].type).toBe('thinking')
    expect((await getMemories()).files[0].path).toBe('/nested/file.md')
    expect((await listProjects()).projects[0].docsCount).toBe(1)
    expect((await getProject('p')).memory?.id).toBe('pm')
    expect((await searchArchive('needle')).map(result => result.source)).toContain('Conversation')
    expect(await searchArchive('private thought')).toHaveLength(0)
    expect(await searchArchive('private thought', { includeThinking: true })).toHaveLength(1)
    expect((await getDataPage()).sensitiveCounts.users).toBe(1)
    await clearAllData()
  })
})
