import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { DB_NAME, persistImport } from './data/db'
import { emptyImport } from './data/types'
import { collectArchiveStats } from './stats'

const erase = () => new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(DB_NAME); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
beforeEach(erase)
it('counts only distinct project memories linked to real projects', async () => { const data = emptyImport(); const source = { sessionId: 's', category: 'projects' as const, part: 0, relativePath: 'projects/a.json' }; data.projects.push({ ...source, uuid: 'p', name: 'P', description: '', promptTemplate: '', isPrivate: false, isStarterProject: false, raw: {} }); data.projectMemories.push({ ...source, category: 'memories', id: 'one', projectUuid: 'p', content: '', raw: {} }, { ...source, category: 'memories', id: 'two', projectUuid: 'p', content: '', raw: {} }, { ...source, category: 'memories', id: 'orphan', projectUuid: 'missing', content: '', raw: {} }); await persistImport(data, { id: 's', startedAt: new Date().toISOString(), categories: ['projects'], parts: [], filesTotal: 1, filesSuccess: 0, filesFailed: 0, filesUnknown: 0, counts: { inserted: 0, updated: 0, unchanged: 0, conflicted: 0 }, records: {}, errors: [], conflicts: [] }); expect((await collectArchiveStats()).projects.withMemory).toBe(1) })
