import type { UIMessage } from 'ai';

export const MODEL_ID = 'gemini-3.1-flash-lite';
export const MODEL_LABEL = 'Gemini 3.1 Flash-Lite';
export const STORAGE_KEY = 'echo-chat:v1';

export function messageText(message: UIMessage) {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n');
}

export function isChatHistory(value: unknown): value is UIMessage[] {
  return Array.isArray(value) && value.every(message =>
    message && typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    Array.isArray(message.parts) && message.parts.every((part: unknown) =>
      typeof part === 'object' && part !== null &&
      'type' in part && part.type === 'text' &&
      'text' in part && typeof part.text === 'string',
    ),
  );
}

export function textOnlyHistory(messages: UIMessage[]): UIMessage[] {
  return messages.flatMap((message): UIMessage[] => {
    const text = messageText(message);
    return text.trim() ? [{ id: message.id, role: message.role, parts: [{ type: 'text', text }] }] : [];
  });
}
