export type ExportMessage = { role: string; createdAt?: string; text: string }

const roleName = (role: string) => role === 'user' || role === 'human' ? '你' : role === 'assistant' ? 'Claude' : role

export function conversationText(title: string, messages: ExportMessage[], formatDate: (value: string) => string): string {
  const body = messages.map(message => `## ${roleName(message.role)}\n${message.createdAt ? `*${formatDate(message.createdAt)}*\n` : ''}${message.text}`).join('\n\n')
  return `# ${title}\n\n${body}`
}
