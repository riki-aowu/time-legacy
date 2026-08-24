import { conversationText } from './export'
import { openDatabase } from './data/db'

/* Phase 3 Step 3 分类导出 —— 只读取标准化数据层，本地生成下载文件。
   sensitive 仅在用户单独确认后导出（任务书 §23/§31）。 */

type Row = Record<string, unknown>
const str = (v: unknown) => typeof v === 'string' ? v : ''
const fmtDate = (v?: string) => v ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)) : ''
const download = (name: string, data: string, type: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0) }

const getAll = (store: IDBObjectStore) => new Promise<Row[]>(resolve => { const r = store.getAll() as IDBRequest<Row[]>; r.onsuccess = () => resolve(r.result ?? []); r.onerror = () => resolve([]) })

async function readStores(names: string[]): Promise<Record<string, Row[]>> {
  const db = await openDatabase()
  try { const tx = db.transaction(names, 'readonly'); const out: Record<string, Row[]> = {}; await Promise.all(names.map(async n => { out[n] = await getAll(tx.objectStore(n)) })); return out }
  finally { db.close() }
}

export async function exportArchiveSet(picked: string[], sensitiveConfirmed: boolean): Promise<string[]> {
  const stamp = new Date().toISOString().slice(0, 10)
  const done: string[] = []

  if (picked.includes('conversations')) {
    const d = await readStores(['conversations', 'messages', 'conversation_blocks'])
    const byConversation = new Map<string, Row[]>()
    for (const m of d.messages) { const k = str(m.conversationUuid); byConversation.set(k, [...(byConversation.get(k) ?? []), m]) }
    const blocksByMessage = new Map<string, Row[]>()
    for (const b of d.conversation_blocks) { const k = str(b.messageUuid); blocksByMessage.set(k, [...(blocksByMessage.get(k) ?? []), b]) }
    const parts = [...d.conversations].sort((a, b) => str(a.updatedAt).localeCompare(str(b.updatedAt))).map(c => conversationText(
      str(c.name) || '未命名对话',
      (byConversation.get(str(c.uuid)) ?? []).sort((a, b) => str(a.createdAt).localeCompare(str(b.createdAt))).map(m => ({
        role: str(m.sender),
        createdAt: str(m.createdAt) || undefined,
        text: (blocksByMessage.get(str(m.uuid)) ?? []).sort((a, b) => Number(a.blockIndex) - Number(b.blockIndex)).map(b => str(b.normalizedContent)).filter(Boolean).join('\n'),
      })),
      fmtDate,
    ))
    download(`time-legacy-conversations-${stamp}.md`, parts.join('\n\n---\n\n'), 'text/markdown')
    done.push('Conversations')
  }

  if (picked.includes('memories')) {
    const d = await readStores(['global_memories', 'memory_files'])
    let md = '# Claude 记忆导出\n\n'
    const g = d.global_memories[0]
    if (g && str(g.content)) md += `## 总记忆\n\n${str(g.content)}\n\n`
    for (const f of d.memory_files) md += `## ${str(f.path)}\n\n${str(f.content)}\n\n`
    download(`time-legacy-memories-${stamp}.md`, md, 'text/markdown')
    done.push('Memories')
  }

  if (picked.includes('projects')) {
    const d = await readStores(['projects', 'project_docs', 'project_memories'])
    let md = '# Projects 导出\n'
    for (const p of d.projects) {
      md += `\n---\n\n# ${str(p.name) || '未命名项目'}\n\n- UUID：${str(p.uuid)}\n${str(p.description) ? `- 描述：${str(p.description)}\n` : ''}`
      if (str(p.promptTemplate)) md += `\n## Instructions\n\n${str(p.promptTemplate)}\n`
      for (const doc of d.project_docs.filter(x => str(x.projectUuid) === str(p.uuid))) md += `\n## Doc · ${str(doc.filename)}\n\n${str(doc.content)}\n`
      const mem = d.project_memories.find(x => str(x.projectUuid) === str(p.uuid))
      if (mem && str(mem.content)) md += `\n## Project Memory\n\n${str(mem.content)}\n`
    }
    download(`time-legacy-projects-${stamp}.md`, md, 'text/markdown')
    done.push('Projects')
  }

  if (picked.includes('reflections')) {
    const d = await readStores(['reflections'])
    const md = d.reflections.map(r => `# ${str(r.period) || '回顾'}\n\n\`\`\`json\n${JSON.stringify(r.content ?? {}, null, 2)}\n\`\`\``).join('\n\n---\n\n')
    download(`time-legacy-reflections-${stamp}.md`, `# 官方回顾（原文 JSON）\n\n${md}`, 'text/markdown')
    done.push('Reflections')
  }

  if (picked.includes('raw')) {
    const d = await readStores(['manifests', 'conversations', 'messages', 'conversation_blocks', 'attachments', 'files', 'projects', 'project_docs', 'project_memories', 'global_memories', 'memory_files', 'design_chats', 'feedback', 'reflections', 'unknown_files'])
    download(`time-legacy-raw-${stamp}.json`, JSON.stringify(d, null, 2), 'application/json')
    done.push('Raw')
  }

  if (picked.includes('sensitive') && sensitiveConfirmed) {
    const d = await readStores(['users_metadata', 'login_history'])
    download(`time-legacy-sensitive-${stamp}.json`, JSON.stringify(d, null, 2), 'application/json')
    done.push('Sensitive Metadata')
  }

  return done
}

export type ExportOption = { key: string; label: string; note: string }
export const exportOptions: ExportOption[] = [
  { key: 'conversations', label: 'Conversations', note: '全部对话的 Markdown 归档' },
  { key: 'memories', label: 'Memories', note: '总记忆 + Memory Files' },
  { key: 'projects', label: 'Projects', note: '项目 + Instructions + Docs' },
  { key: 'reflections', label: 'Reflections', note: '官方回顾原文' },
  { key: 'raw', label: 'Raw', note: '标准化后的原始 JSON' },
]
