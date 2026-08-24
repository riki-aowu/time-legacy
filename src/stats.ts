import { openDatabase } from './data/db'

/* Phase 3 Step 3 统计聚合 —— 只读派生层，不写库、不改 schema。
   仅统计真实存在、能可靠识别的字段（任务书 §19：不猜工具名/来源）。 */

type Row = Record<string, unknown>
const str = (v: unknown) => typeof v === 'string' ? v : ''

function request<T>(value: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error) }) }
async function read<T>(names: string[], get: (tx: IDBTransaction) => Promise<T>): Promise<T> { const db = await openDatabase(); try { return await get(db.transaction(names, 'readonly')) } finally { db.close() } }
const rows = <T extends Row = Row>(store: IDBObjectStore) => request(store.getAll() as IDBRequest<T[]>)

export type BlockTypeCounts = { text: number; thinking: number; tool_use: number; tool_result: number; token_budget: number; flag: number; unknown: number }
export type ToolStats = { total: number; byName: Array<{ name: string; count: number }>; mcpCount: number }
export type MemoryStats = { files: number; projectMemories: number; lastUpdated?: string }
export type ProjectStats = { projects: number; docs: number; withMemory: number }
export type ArchiveStats = { blocks: BlockTypeCounts; tools: ToolStats; memories: MemoryStats; projects: ProjectStats }

export async function collectArchiveStats(): Promise<ArchiveStats> {
  return read(['conversation_blocks', 'memory_files', 'project_memories', 'projects', 'project_docs'], async tx => {
    const [blocks, memoryFiles, projectMemories, projects, projectDocs] = await Promise.all([rows(tx.objectStore('conversation_blocks')), rows(tx.objectStore('memory_files')), rows(tx.objectStore('project_memories')), rows(tx.objectStore('projects')), rows(tx.objectStore('project_docs'))])
    const counts: BlockTypeCounts = { text: 0, thinking: 0, tool_use: 0, tool_result: 0, token_budget: 0, flag: 0, unknown: 0 }
    const toolNames = new Map<string, number>()
    let mcpCount = 0
    for (const block of blocks) {
      const type = str(block.type)
      if (type === 'text') counts.text += 1
      else if (type === 'thinking') counts.thinking += 1
      else if (type === 'tool_use') { counts.tool_use += 1; const raw = block.raw as Row | undefined; const name = str(raw?.name) || '未知工具'; toolNames.set(name, (toolNames.get(name) ?? 0) + 1); if (str(raw?.mcp_server_url)) mcpCount += 1 }
      else if (type === 'tool_result') counts.tool_result += 1
      else if (type === 'token_budget') counts.token_budget += 1
      else if (type === 'flag') counts.flag += 1
      else counts.unknown += 1
    }
    const lastUpdated = [...memoryFiles].map(f => str(f.updatedAt)).filter(Boolean).sort().pop()
    return {
      blocks: counts,
      tools: { total: counts.tool_use, byName: [...toolNames.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count), mcpCount },
      memories: { files: memoryFiles.length, projectMemories: projectMemories.length, lastUpdated },
      projects: { projects: projects.length, docs: projectDocs.length, withMemory: projectMemories.length },
    } as ArchiveStats
  })
}
