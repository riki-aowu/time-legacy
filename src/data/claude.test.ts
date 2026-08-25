import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import 'fake-indexeddb/auto'
import { normalizeFiles, readFiles, resolveManifest } from './claude'
import { clearAllData, persistImport } from './db'

const bytes = (name: string, content: string) => ({ name, bytes: new TextEncoder().encode(content) })

describe('Claude export resolver and normalizer', () => {
  it('uses manifest category and part over a ZIP entry path', () => {
    const files = readFiles([
      bytes('manifest-x.json', JSON.stringify({ version: '1.0', data_files: [{ category: 'conversations', part: 2, filename: 'conversations-002.zip' }] })),
      bytes('conversations-002.zip', 'not a zip'),
    ])
    expect(resolveManifest(files[0].json)?.version).toBe('1.0')
    expect(files[1].category).toBe('unknown')
  })

  it('keeps all known and unknown conversation blocks in source order', () => {
    const source = [{ sessionId: 's', category: 'conversations' as const, part: 0, relativePath: 'conversations.json', bytes: 1, json: [{ uuid: 'c', name: 'C', summary: '', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', account: { uuid: 'a' }, chat_messages: [{ uuid: 'm', parent_message_uuid: '', sender: 'human', text: 'plain', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', attachments: [], files: [{ file_uuid: 'f', file_name: null }], content: [{ type: 'text', text: 'plain' }, { type: 'surprise', payload: 1 }] }] }] }]
    const data = normalizeFiles(source)
    expect(data.messages[0].parentMessageUuid).toBeUndefined()
    expect(data.blocks.map(block => block.type)).toEqual(['text', 'unknown:surprise'])
    expect(data.files[0].fileName).toBeNull()
  })

  it('does not guess a Design Chat project association', () => {
    const data = normalizeFiles([{ sessionId: 's', category: 'design_chats', part: 0, relativePath: 'design_chats/x.json', bytes: 1, json: { uuid: 'd', title: 'D', project: { uuid: 'missing', name: 'same title' }, messages: [] } }])
    expect(data.designChats[0].projectResolution).toBe('unresolved')
    expect(data.designChats[0].messagesRaw).toEqual([])
  })

  it('keeps sensitive metadata outside ordinary records', () => {
    const data = normalizeFiles([{ sessionId: 's', category: 'light_metadata', part: 0, relativePath: 'users.json', bytes: 1, json: [{ uuid: 'u', email_address: 'private@example.com', verified_phone_number: null }] }])
    expect(data.usersMetadata).toHaveLength(1)
    expect(data.usersMetadata[0].sensitive).toBe(true)
    expect(data.conversations).toHaveLength(0)
  })
})

const realExportRoot = process.env.CLAUDE_EXPORT_FIXTURE ?? 'E:/1-codex/claude记忆'
// The real private export is intentionally absent from clones and CI.
describe.skipIf(!existsSync(realExportRoot))('real Claude export discovery regression', () => {
  const root = realExportRoot
  it('normalizes the complete real export without dropping observed categories', () => {
    const files = readdirSync(root).filter(name => /\.(zip|json)$/i.test(name)).map(name => ({ name, bytes: new Uint8Array(readFileSync(join(root, name))) }))
    const data = normalizeFiles(readFiles(files))
    expect(data.conversations).toHaveLength(362)
    expect(data.messages).toHaveLength(17_363)
    expect(data.blocks).toHaveLength(28_755)
    expect(data.projects).toHaveLength(8)
    expect(data.projectDocs).toHaveLength(9)
    expect(data.memoryFiles).toHaveLength(6)
    expect(data.projectMemories).toHaveLength(6)
    expect(data.designChats).toHaveLength(1)
    expect(data.reflections).toHaveLength(1)
    expect(data.usersMetadata).toHaveLength(1)
    expect(data.loginHistory).toHaveLength(5)
    expect(data.unknown).toHaveLength(0)
    expect(data.errors).toHaveLength(0)
  })

  it('persists the complete real export and makes repeat import idempotent', async () => {
    await clearAllData()
    const files = readdirSync(root).filter(name => /\.(zip|json)$/i.test(name)).map(name => ({ name, bytes: new Uint8Array(readFileSync(join(root, name))) }))
    const data = normalizeFiles(readFiles(files)); const create = (id: string) => ({ id, startedAt: new Date().toISOString(), categories: [...new Set(data.conversations.map(() => 'conversations' as const))], parts: [{ category: 'conversations' as const, part: 0 }], filesTotal: 13, filesSuccess: 0, filesFailed: 0, filesUnknown: 0, counts: { inserted: 0, updated: 0, unchanged: 0, conflicted: 0 }, records: {}, errors: [], conflicts: [] })
    const first = await persistImport(data, create('real-one'))
    const second = await persistImport(data, create('real-two'))
    expect(first.records.conversations).toBe(362)
    expect(first.records.messages).toBe(17_363)
    expect(first.records.conversation_blocks).toBe(28_755)
    expect(first.counts.conflicted).toBe(0)
    expect(second.counts.inserted).toBe(0)
    expect(second.counts.conflicted).toBe(0)
    expect(second.counts.unchanged).toBeGreaterThan(40_000)
  }, 20_000)
})
