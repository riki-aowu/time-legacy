/// <reference lib="webworker" />
import { normalizeFiles, readFiles } from './claude'
import { persistImport } from './db'
import type { ExportCategory, ImportSession } from './types'

type Request = { type: 'import'; sessionId: string; files: Array<{ name: string; buffer: ArrayBuffer }> }
type Progress = { type: 'progress'; phase: string; percent: number }
type Completed = { type: 'complete'; session: ImportSession }
type Failed = { type: 'failed'; error: string }
const send = (message: Progress | Completed | Failed) => self.postMessage(message)

self.onmessage = async (event: MessageEvent<Request>) => {
  if (event.data.type !== 'import') return
  try {
    send({ type: 'progress', phase: '正在扫描文件', percent: 10 })
    const raw = readFiles(event.data.files.map(file => ({ name: file.name, bytes: new Uint8Array(file.buffer) })))
    raw.forEach(file => { file.sessionId = event.data.sessionId })
    send({ type: 'progress', phase: '正在分析 Schema', percent: 35 })
    const normalized = normalizeFiles(raw)
    const categories = [...new Set(raw.map(file => file.category))] as ExportCategory[]
    const session: ImportSession = { id: event.data.sessionId, startedAt: new Date().toISOString(), categories, parts: [...new Map(raw.map(file => [`${file.category}:${file.part}`, { category: file.category, part: file.part }])).values()], filesTotal: raw.length, filesSuccess: 0, filesFailed: 0, filesUnknown: 0, counts: { inserted: 0, updated: 0, unchanged: 0, conflicted: 0 }, records: {}, errors: [], conflicts: [] }
    send({ type: 'progress', phase: '正在写入本地档案', percent: 65 })
    const persisted = await persistImport(normalized, session)
    send({ type: 'progress', phase: '正在建立本地索引', percent: 95 })
    send({ type: 'complete', session: persisted })
  } catch (error) { send({ type: 'failed', error: error instanceof Error ? error.message : '导入失败' }) }
}
