export type BlockPresentation = 'direct' | 'collapsed'
export function blockPresentation(type: string): BlockPresentation { return type === 'text' || type === 'code' ? 'direct' : 'collapsed' }
