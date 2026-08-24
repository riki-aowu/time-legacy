import { strFromU8, unzipSync } from 'fflate'
import { emptyImport, exportCategories, type ExportCategory, type Manifest, type NormalizedImport, type RawFile, type SourceRef, type UnknownFile } from './types'

const known = new Set<string>(exportCategories)
const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const arr = (v: unknown) => Array.isArray(v) ? v : []
const str = (v: unknown) => typeof v === 'string' ? v : ''
const iso = (v: unknown) => { const d = new Date(String(v)); return v && !Number.isNaN(+d) ? d.toISOString() : undefined }
const id = (value: unknown, fallback: string) => str(value) || fallback
const uid = () => crypto.randomUUID()
export const schemaSummary = (value: unknown) => isObject(value) ? `object:${Object.keys(value).sort().join(',')}` : Array.isArray(value) ? `array:${value.length}:${isObject(value[0]) ? Object.keys(value[0]).sort().join(',') : typeof value[0]}` : typeof value

export function resolveManifest(value: unknown): Manifest | null {
  if (!isObject(value) || !Array.isArray(value.data_files)) return null
  return { version: str(value.version) || undefined, created_at: str(value.created_at) || undefined, total_files: typeof value.total_files === 'number' ? value.total_files : undefined, data_files: value.data_files.filter(isObject).map(item => ({ batch_index: typeof item.batch_index === 'number' ? item.batch_index : undefined, category: str(item.category) || undefined, part: typeof item.part === 'number' ? item.part : undefined, filename: str(item.filename) || undefined })) }
}

function categoryFromPath(path: string): ExportCategory {
  const lower = path.toLowerCase()
  if (/manifest-.*\.json$/.test(lower)) return 'manifest'
  if (/conversations\.json$/.test(lower)) return 'conversations'
  if (lower.includes('design_chats/')) return 'design_chats'
  if (lower.includes('projects/')) return 'projects'
  if (lower.includes('memories/')) return 'memories'
  if (lower.includes('reflections/') || lower.includes('feedback/')) return 'feedback'
  if (/(^|\/)(users|login_history)\.json$/.test(lower)) return 'light_metadata'
  return 'unknown'
}

function categoryFromManifest(path: string, manifest: Manifest | null): { category: ExportCategory; part: number | null } | null {
  const names = [path.split('/')[0], path.split('/').pop()].filter((name): name is string => Boolean(name)).map(name => name.toLowerCase())
  const file = manifest?.data_files?.find(item => names.includes(item.filename?.toLowerCase() ?? ''))
  if (!file || !file.category || !known.has(file.category)) return null
  return { category: file.category as ExportCategory, part: file.part ?? null }
}

export function classify(path: string, value: unknown, manifest: Manifest | null, part: number | null): { category: ExportCategory; part: number | null; mismatch?: string } {
  const byManifest = categoryFromManifest(path, manifest)
  const byPath = categoryFromPath(path)
  if (byManifest && (byPath === 'unknown' || byPath === byManifest.category)) return { ...byManifest }
  if (byManifest) return { category: 'unknown', part: byManifest.part, mismatch: `manifest=${byManifest.category}; path=${byPath}; schema=${schemaSummary(value)}` }
  return { category: byPath, part }
}

export function readFiles(files: Array<{ name: string; bytes: Uint8Array }>): RawFile[] {
  const output: RawFile[] = []
  let manifest: Manifest | null = null
  for (const file of files) if (/manifest-.*\.json$/i.test(file.name)) { try { manifest = resolveManifest(JSON.parse(strFromU8(file.bytes))) } catch { /* handled in second pass */ } }
  for (const file of files) {
    const add = (relativePath: string, bytes: Uint8Array, sourcePart: number | null) => {
      if (!relativePath.toLowerCase().endsWith('.json')) return
      try { const json = JSON.parse(strFromU8(bytes)); const result = classify(relativePath, json, manifest, sourcePart); output.push({ sessionId: '', category: result.category, part: result.part, relativePath, bytes: bytes.byteLength, json: result.mismatch ? { _classifierMismatch: result.mismatch, raw: json } : json }) }
      catch { output.push({ sessionId: '', category: 'unknown', part: sourcePart, relativePath, bytes: bytes.byteLength, json: { _parseError: 'Invalid JSON' } }) }
    }
    if (/\.zip$/i.test(file.name)) {
      const part = Number((file.name.match(/-(\d+)\.zip$/i) ?? [])[1]) || 0
      try { const entries = unzipSync(file.bytes); Object.entries(entries).forEach(([path, bytes]) => add(`${file.name}/${path}`, bytes, part)) }
      catch { output.push({ sessionId: '', category: 'unknown', part, relativePath: file.name, bytes: file.bytes.byteLength, json: { _parseError: 'Unreadable ZIP' } }) }
    } else add(file.name, file.bytes, null)
  }
  return output
}

const source = (file: RawFile): SourceRef => ({ sessionId: file.sessionId, category: file.category, part: file.part, relativePath: file.relativePath })
const unknown = (file: RawFile, reason?: string): UnknownFile => ({ ...source(file), id: uid(), bytes: file.bytes, schemaSummary: schemaSummary(file.json), parseError: reason, raw: file.json, createdAt: new Date().toISOString() })
const blockText = (raw: Record<string, unknown>) => str(raw.text) || str(raw.thinking) || str(raw.message)

export function normalizeFiles(files: RawFile[]): NormalizedImport {
  const out = emptyImport(); const projectIds = new Set<string>()
  for (const file of files) {
    if (isObject(file.json) && typeof file.json._parseError === 'string') { out.errors.push(unknown(file, file.json._parseError)); continue }
    if (file.category === 'manifest') { const manifest = resolveManifest(file.json); if (manifest) out.manifests.push({ ...manifest, ...source(file), id: `manifest:${file.relativePath}` }); else out.unknown.push(unknown(file, 'Manifest shape mismatch')); continue }
    if (file.category === 'projects' && isObject(file.json)) { const raw = file.json, projectUuid = str(raw.uuid); if (!projectUuid) { out.unknown.push(unknown(file, 'Project UUID missing')); continue }; projectIds.add(projectUuid); out.projects.push({ ...source(file), uuid: projectUuid, name: str(raw.name), description: str(raw.description), promptTemplate: str(raw.prompt_template), creatorUuid: isObject(raw.creator) ? str(raw.creator.uuid) || undefined : undefined, creatorName: isObject(raw.creator) ? str(raw.creator.full_name) || undefined : undefined, isPrivate: raw.is_private === true, isStarterProject: raw.is_starter_project === true, createdAt: iso(raw.created_at), updatedAt: iso(raw.updated_at), raw }); for (const doc of arr(raw.docs)) if (isObject(doc)) out.projectDocs.push({ ...source(file), uuid: id(doc.uuid, uid()), projectUuid, filename: str(doc.filename), content: str(doc.content), createdAt: iso(doc.created_at), raw: doc }); continue }
  }
  for (const file of files) {
    const ref = source(file)
    if (file.category === 'conversations' && Array.isArray(file.json)) { file.json.forEach((item, ci) => { if (!isObject(item)) { out.unknown.push(unknown(file, `Conversation ${ci} is not object`)); return }; const conversationUuid = id(item.uuid, `unknown-conversation-${ci}`); out.conversations.push({ ...ref, uuid: conversationUuid, name: str(item.name), summary: str(item.summary), createdAt: iso(item.created_at), updatedAt: iso(item.updated_at), accountUuid: isObject(item.account) ? str(item.account.uuid) || undefined : undefined, raw: item }); arr(item.chat_messages).forEach((message, mi) => { if (!isObject(message)) { out.unknown.push(unknown(file, `Message ${ci}:${mi} is not object`)); return }; const messageUuid = id(message.uuid, `${conversationUuid}:message:${mi}`); out.messages.push({ ...ref, uuid: messageUuid, conversationUuid, parentMessageUuid: str(message.parent_message_uuid) || undefined, sender: str(message.sender), text: str(message.text), createdAt: iso(message.created_at), updatedAt: iso(message.updated_at), raw: message }); arr(message.content).forEach((block, bi) => { const raw: Record<string, unknown> = isObject(block) ? block : { value: block }; const originalType = str(raw.type) || 'unknown'; const type = ['text', 'thinking', 'tool_use', 'tool_result', 'token_budget', 'flag'].includes(originalType) ? originalType : `unknown:${originalType}`; out.blocks.push({ ...ref, id: `${messageUuid}:${bi}`, messageUuid, conversationUuid, blockIndex: bi, type, normalizedContent: blockText(raw) || undefined, raw, createdAt: iso(raw.start_timestamp) }); }); arr(message.attachments).forEach((attachment, ai) => { if (isObject(attachment)) out.attachments.push({ ...ref, id: `${messageUuid}:attachment:${ai}`, messageUuid, conversationUuid, fileName: str(attachment.file_name), fileSize: typeof attachment.file_size === 'number' ? attachment.file_size : 0, fileType: str(attachment.file_type), extractedContent: str(attachment.extracted_content), raw: attachment }) }); arr(message.files).forEach((linkedFile, fi) => { if (isObject(linkedFile)) out.files.push({ ...ref, id: `${messageUuid}:file:${fi}`, messageUuid, conversationUuid, fileUuid: id(linkedFile.file_uuid, `${messageUuid}:file-uuid:${fi}`), fileName: typeof linkedFile.file_name === 'string' ? linkedFile.file_name : null, raw: linkedFile }) }) }) }); continue }
    if (file.category === 'memories' && isObject(file.json)) { const raw = file.json; out.globalMemories.push({ ...ref, id: `${str(raw.account_uuid) || 'account'}:global`, accountUuid: str(raw.account_uuid) || undefined, content: str(raw.conversations_memory), raw }); arr(raw.memory_files).forEach((memory, index) => { if (isObject(memory)) out.memoryFiles.push({ ...ref, id: `memory-file:${str(memory.path) || index}`, path: str(memory.path), content: str(memory.content), updatedAt: iso(memory.updated_at), raw: memory }) }); if (isObject(raw.project_memories)) for (const [projectUuid, content] of Object.entries(raw.project_memories)) out.projectMemories.push({ ...ref, id: `project-memory:${projectUuid}`, projectUuid, content: str(content), raw: { projectUuid, content } }); continue }
    if (file.category === 'design_chats' && isObject(file.json)) { const raw = file.json, project = isObject(raw.project) ? raw.project : undefined, projectUuid = project ? str(project.uuid) || undefined : undefined; out.designChats.push({ ...ref, uuid: id(raw.uuid, uid()), title: str(raw.title), projectUuid, projectName: project ? str(project.name) || undefined : undefined, projectResolution: projectUuid ? projectIds.has(projectUuid) ? 'resolved' : 'unresolved' : 'absent', messagesRaw: raw.messages, createdAt: iso(raw.created_at), updatedAt: iso(raw.updated_at), raw }); continue }
    if (file.category === 'feedback' && isObject(file.json)) { const raw = file.json; arr(raw.feedback).forEach((item, index) => out.feedback.push({ ...ref, id: `feedback:${file.part ?? 0}:${index}`, relativePath: `${file.relativePath}#feedback/${index}`, bytes: file.bytes, json: item })); arr(raw.reflections).forEach((reflection, index) => { if (isObject(reflection)) out.reflections.push({ ...ref, id: `reflection:${str(reflection.period) || index}`, period: str(reflection.period), content: isObject(reflection.content) ? reflection.content : {}, createdAt: iso(reflection.created_at), updatedAt: iso(reflection.updated_at), raw: reflection }) }); continue }
    if (file.category === 'light_metadata') { const raw = file.json; if (Array.isArray(raw)) raw.forEach((user, index) => { if (isObject(user)) out.usersMetadata.push({ ...ref, uuid: id(user.uuid, `user:${index}`), fullName: str(user.full_name) || undefined, emailAddress: str(user.email_address) || undefined, verifiedPhoneNumber: typeof user.verified_phone_number === 'string' ? user.verified_phone_number : null, raw: user, sensitive: true }) }); else if (isObject(raw) && Array.isArray(raw.login_events)) raw.login_events.forEach((event, index) => { if (isObject(event)) out.loginHistory.push({ ...ref, id: `login:${str(event.timestamp) || index}`, accountUuid: str(event.account_uuid) || undefined, timestamp: iso(event.timestamp), method: str(event.method) || undefined, ipAddress: str(event.ip_address) || undefined, locationInfo: event.location_info, userAgent: event.user_agent, raw: event, sensitive: true }) }); else out.unknown.push(unknown(file, 'Light metadata shape mismatch')); continue }
    if (file.category === 'unknown') out.unknown.push(unknown(file, isObject(file.json) && typeof file.json._classifierMismatch === 'string' ? file.json._classifierMismatch : undefined))
  }
  return out
}
