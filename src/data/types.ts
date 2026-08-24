export const exportCategories = ['conversations', 'design_chats', 'projects', 'memories', 'feedback', 'light_metadata', 'manifest', 'unknown'] as const
export type ExportCategory = typeof exportCategories[number]
export type ImportCounts = Record<'inserted' | 'updated' | 'unchanged' | 'conflicted', number>

export type SourceRef = { sessionId: string; category: ExportCategory; part: number | null; relativePath: string }
export type RawFile = SourceRef & { bytes: number; json: unknown }
export type ManifestFile = { batch_index?: number; category?: string; part?: number; filename?: string }
export type Manifest = { version?: string; created_at?: string; total_files?: number; data_files?: ManifestFile[] }
export type UnknownFile = SourceRef & { id: string; bytes: number; schemaSummary: string; parseError?: string; raw: unknown; createdAt: string }

export type ConversationRecord = SourceRef & { uuid: string; name: string; summary: string; createdAt?: string; updatedAt?: string; accountUuid?: string; raw: unknown }
export type MessageRecord = SourceRef & { uuid: string; conversationUuid: string; parentMessageUuid?: string; sender: string; text: string; createdAt?: string; updatedAt?: string; raw: unknown }
export type BlockRecord = SourceRef & { id: string; messageUuid: string; conversationUuid: string; blockIndex: number; type: string; normalizedContent?: string; raw: unknown; createdAt?: string }
export type AttachmentRecord = SourceRef & { id: string; messageUuid: string; conversationUuid: string; fileName: string; fileSize: number; fileType: string; extractedContent: string; raw: unknown }
export type FileRecord = SourceRef & { id: string; messageUuid: string; conversationUuid: string; fileUuid: string; fileName: string | null; raw: unknown }
export type ProjectRecord = SourceRef & { uuid: string; name: string; description: string; promptTemplate: string; creatorUuid?: string; creatorName?: string; isPrivate: boolean; isStarterProject: boolean; createdAt?: string; updatedAt?: string; raw: unknown }
export type ProjectDocRecord = SourceRef & { uuid: string; projectUuid: string; filename: string; content: string; createdAt?: string; raw: unknown }
export type ProjectMemoryRecord = SourceRef & { id: string; projectUuid: string; content: string; raw: unknown }
export type GlobalMemoryRecord = SourceRef & { id: string; accountUuid?: string; content: string; raw: unknown }
export type MemoryFileRecord = SourceRef & { id: string; path: string; content: string; updatedAt?: string; raw: unknown }
export type DesignChatRecord = SourceRef & { uuid: string; title: string; projectUuid?: string; projectName?: string; projectResolution: 'resolved' | 'unresolved' | 'absent'; messagesRaw: unknown; createdAt?: string; updatedAt?: string; raw: unknown }
export type ReflectionRecord = SourceRef & { id: string; period: string; content: Record<string, unknown>; createdAt?: string; updatedAt?: string; raw: unknown }
export type SensitiveUserRecord = SourceRef & { uuid: string; fullName?: string; emailAddress?: string; verifiedPhoneNumber?: string | null; raw: unknown; sensitive: true }
export type LoginHistoryRecord = SourceRef & { id: string; accountUuid?: string; timestamp?: string; method?: string; ipAddress?: string; locationInfo?: unknown; userAgent?: unknown; raw: unknown; sensitive: true }

export type NormalizedImport = {
  manifests: Array<Manifest & SourceRef & { id: string }>; conversations: ConversationRecord[]; messages: MessageRecord[]; blocks: BlockRecord[]; attachments: AttachmentRecord[]; files: FileRecord[]
  projects: ProjectRecord[]; projectDocs: ProjectDocRecord[]; projectMemories: ProjectMemoryRecord[]; globalMemories: GlobalMemoryRecord[]; memoryFiles: MemoryFileRecord[]
  designChats: DesignChatRecord[]; feedback: Array<RawFile & { id: string }>; reflections: ReflectionRecord[]; usersMetadata: SensitiveUserRecord[]; loginHistory: LoginHistoryRecord[]; unknown: UnknownFile[]; errors: UnknownFile[]
}

export type ImportSession = { id: string; startedAt: string; completedAt?: string; manifestVersion?: string; categories: ExportCategory[]; parts: Array<{ category: ExportCategory; part: number | null }>; filesTotal: number; filesSuccess: number; filesFailed: number; filesUnknown: number; counts: ImportCounts; records: Record<string, number>; errors: Array<{ path: string; error: string }>; conflicts: Array<{ store: string; id: string; reason: string; existing: unknown; incoming: unknown; at: string }> }

export const emptyImport = (): NormalizedImport => ({ manifests: [], conversations: [], messages: [], blocks: [], attachments: [], files: [], projects: [], projectDocs: [], projectMemories: [], globalMemories: [], memoryFiles: [], designChats: [], feedback: [], reflections: [], usersMetadata: [], loginHistory: [], unknown: [], errors: [] })
