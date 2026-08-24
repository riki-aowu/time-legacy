import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllData, DB_NAME, legacyArchiveSnapshot, openDatabase, persistImport } from './db'
import { emptyImport } from './types'

const erase = () => new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); request.onblocked = () => reject(Error('database remained open')) })
const session = (id: string) => ({ id, startedAt: new Date().toISOString(), categories: ['conversations' as const], parts: [{ category: 'conversations' as const, part: 0 }], filesTotal: 1, filesSuccess: 0, filesFailed: 0, filesUnknown: 0, counts: { inserted: 0, updated: 0, unchanged: 0, conflicted: 0 }, records: {}, errors: [], conflicts: [] })

beforeEach(async () => { await erase() })

describe('IndexedDB V2 persistence', () => {
  it('upserts a stable UUID without duplicate records on repeat import', async () => {
    const data = emptyImport(); data.conversations.push({ sessionId: 's', category: 'conversations', part: 0, relativePath: 'conversations.json', uuid: 'conversation-1', name: 'first', summary: '', raw: { uuid: 'conversation-1', revision: 1 } })
    data.messages.push({ sessionId: 's', category: 'conversations', part: 0, relativePath: 'conversations.json', uuid: 'message-1', conversationUuid: 'conversation-1', sender: 'human', text: 'hello', raw: { uuid: 'message-1' } })
    const first = await persistImport(data, session('one'))
    const second = await persistImport(data, session('two'))
    expect(first.counts.inserted).toBe(2)
    expect(second.counts.unchanged).toBe(2)
    const snapshot = await legacyArchiveSnapshot()
    expect(snapshot.conversations).toHaveLength(1)
    expect(snapshot.conversations[0].messages).toHaveLength(1)
  })

  it('migrates a V0.1 archive without deleting its conversations', async () => {
    await new Promise<void>((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore('archives'); request.onsuccess = () => { const db = request.result; const tx = db.transaction('archives', 'readwrite'); tx.objectStore('archives').put({ conversations: [{ id: 'old-c', title: 'old', messages: [{ id: 'old-m', role: 'user', blocks: [{ type: 'text', text: 'kept' }] }] }] }, 'archive-v1'); tx.oncomplete = () => { db.close(); resolve() }; tx.onerror = () => reject(tx.error) }; request.onerror = () => reject(request.error) })
    const db = await openDatabase(); db.close()
    const snapshot = await legacyArchiveSnapshot()
    expect(snapshot.conversations).toHaveLength(1)
    expect(snapshot.conversations[0].messages[0].id).toBe('old-m')
    await clearAllData()
    expect((await legacyArchiveSnapshot()).conversations).toHaveLength(0)
  })
})
