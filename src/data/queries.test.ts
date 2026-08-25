import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllData, DB_NAME, persistImport } from './db'
import { emptyImport } from './types'
import { getConversationDetail, getDataPage, getDesignChatDetail, getMemories, getProject, listArchive, listProjects, listRawRecords, searchArchive } from './queries'

const erase = () => new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
const session = () => ({ id: crypto.randomUUID(), startedAt: new Date().toISOString(), categories: ['conversations' as const], parts: [{ category: 'conversations' as const, part: 0 }], filesTotal: 1, filesSuccess: 0, filesFailed: 0, filesUnknown: 0, counts: { inserted: 0, updated: 0, unchanged: 0, conflicted: 0 }, records: {}, errors: [], conflicts: [] })
beforeEach(async () => { await erase() })

describe('Phase 3A query contracts', () => {
  it('supplies stable archive, detail, memory, project and safe search data', async () => {
    const data = emptyImport(); const source = { sessionId: 's', category: 'conversations' as const, part: 0, relativePath: 'conversations.json' }
    data.conversations.push({ ...source, uuid: 'c', name: 'Claude archive', summary: 'summary', updatedAt: '2026-01-02T00:00:00Z', raw: { uuid: 'c' } }); data.messages.push({ ...source, uuid: 'm', conversationUuid: 'c', sender: 'assistant', text: 'needle message', createdAt: '2026-01-01T00:00:00Z', raw: { uuid: 'm' } }, { ...source, uuid: 'late', conversationUuid: 'c', sender: 'human', text: '', createdAt: '2026-01-02T00:00:00Z', raw: { uuid: 'late' } }); data.blocks.push({ ...source, id: 'm:0', messageUuid: 'm', conversationUuid: 'c', blockIndex: 0, type: 'thinking', normalizedContent: 'private thought', raw: {} }, { ...source, id: 'late:0', messageUuid: 'late', conversationUuid: 'c', blockIndex: 0, type: 'text', normalizedContent: 'block needle', raw: {} }); data.designChats.push({ ...source, category: 'design_chats', uuid: 'dc', title: 'Design', projectUuid: 'missing', projectName: 'Not guessed', projectResolution: 'unresolved', messagesRaw: [], raw: { uuid: 'dc', messages: [] } }); data.projects.push({ ...source, category: 'projects', uuid: 'p', name: 'Project needle', description: '', promptTemplate: 'instruction', isPrivate: true, isStarterProject: false, raw: {} }); data.projectDocs.push({ ...source, category: 'projects', uuid: 'd', projectUuid: 'p', filename: 'guide.md', content: 'guide content', raw: {} }); data.projectMemories.push({ ...source, category: 'memories', id: 'pm', projectUuid: 'p', content: 'memory body', raw: {} }); data.globalMemories.push({ ...source, category: 'memories', id: 'gm', content: 'global', raw: {} }); data.memoryFiles.push({ ...source, category: 'memories', id: 'mf', path: '/nested/file.md', content: 'file content', raw: {} }); data.usersMetadata.push({ ...source, category: 'light_metadata', uuid: 'u', raw: { email: 'do-not-search' }, sensitive: true }); await persistImport(data, session())
    expect((await listArchive({ filter: 'thinking' })).map(item => item.id)).toEqual(['c'])
    expect((await getConversationDetail('c'))?.messages[0].blocks[0].type).toBe('thinking')
    expect((await getMemories()).files[0].path).toBe('/nested/file.md')
    expect((await listProjects()).projects[0].docsCount).toBe(1)
    expect((await getProject('p')).memory?.id).toBe('pm')
    expect((await searchArchive('needle')).map(result => result.source)).toContain('Conversation')
    expect((await searchArchive('Claude archive', { scope: 'conversations' }))[0]).toMatchObject({ match: 'title', conversationUuid: 'c' })
    expect((await searchArchive('needle message', { scope: 'conversations' }))[0]).toMatchObject({ match: 'message', conversationUuid: 'c', messageUuid: 'm', sender: 'assistant', messageIndex: 0 })
    expect((await searchArchive('block needle', { scope: 'conversations' }))[0]).toMatchObject({ match: 'block', conversationUuid: 'c', messageUuid: 'late', sender: 'human', messageIndex: 1 })
    expect(await searchArchive('private thought')).toHaveLength(0)
    expect(await searchArchive('private thought', { includeThinking: true })).toHaveLength(1)
    expect((await getDataPage()).sensitiveCounts.users).toBe(1)
    expect(await getDesignChatDetail('dc')).toMatchObject({ designChat: { title: 'Design', projectResolution: 'unresolved' }, project: undefined })
    expect(await listRawRecords()).toContainEqual(expect.objectContaining({ store: 'conversations', relativePath: 'conversations.json', category: 'conversations', part: 0, sessionId: 's', schemaSummary: 'object:uuid', raw: { uuid: 'c' } }))
    await clearAllData()
  })
})
