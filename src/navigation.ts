import type { SearchResult } from './data/queries'

export type SearchNavigation = { page: 'archive'; conversationUuid: string; messageUuid?: string } | { page: 'memories'; memoryPath: string } | { page: 'projects'; projectUuid: string; docUuid?: string } | { page: 'reflections'; reflectionId: string }

export function resolveSearchNavigation(result: SearchResult): SearchNavigation {
  if (result.kind === 'memory_file') return { page: 'memories', memoryPath: result.memoryPath ?? '' }
  if (result.kind === 'project' || result.kind === 'project_doc' || result.kind === 'project_memory') return { page: 'projects', projectUuid: result.projectUuid ?? result.entityId, docUuid: result.docUuid }
  if (result.kind === 'reflection') return { page: 'reflections', reflectionId: result.reflectionId ?? result.entityId }
  return { page: 'archive', conversationUuid: result.conversationUuid ?? result.entityId, messageUuid: result.messageUuid }
}
