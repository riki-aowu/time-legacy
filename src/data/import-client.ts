import type { ImportSession } from './types'
type Progress = { phase: string; percent: number }
export async function importClaudeFiles(files: File[], onProgress: (progress: Progress) => void): Promise<ImportSession> {
  const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' })
  const buffers = await Promise.all(files.map(async file => ({ name: file.name, buffer: await file.arrayBuffer() })))
  return new Promise((resolve, reject) => { worker.onmessage = event => { const message = event.data as { type: string; phase?: string; percent?: number; session?: ImportSession; error?: string }; if (message.type === 'progress') onProgress({ phase: message.phase ?? '正在处理', percent: message.percent ?? 0 }); if (message.type === 'complete' && message.session) { worker.terminate(); resolve(message.session) } if (message.type === 'failed') { worker.terminate(); reject(Error(message.error)) } }; worker.onerror = () => { worker.terminate(); reject(Error('导入 Worker 无法运行')) }; worker.postMessage({ type: 'import', sessionId: crypto.randomUUID(), files: buffers }, buffers.map(item => item.buffer)) })
}
