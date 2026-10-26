import type { UIMessage } from 'ai';
import { isChatHistory, messageText, STORAGE_KEY, textOnlyHistory } from './chat';

export const CONVERSATIONS_KEY = 'echo-conversations:v2';
export const DEFAULT_TITLE = '新对话';

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
};

export type ConversationStore = {
  version: 2;
  activeId: string;
  conversations: Conversation[];
};

export function createConversation(messages: UIMessage[] = []): Conversation {
  const now = Date.now();
  const history = textOnlyHistory(messages);
  const first = history.find(message => message.role === 'user');
  return {
    id: crypto.randomUUID(),
    title: first ? messageText(first).replace(/\s+/g, ' ').slice(0, 60) : DEFAULT_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: history,
  };
}

export function createStore(messages: UIMessage[] = []): ConversationStore {
  const conversation = createConversation(messages);
  return { version: 2, activeId: conversation.id, conversations: [conversation] };
}

export function isConversationStore(value: unknown): value is ConversationStore {
  if (!value || typeof value !== 'object') return false;
  const store = value as Partial<ConversationStore>;
  if (store.version !== 2 || typeof store.activeId !== 'string' || !Array.isArray(store.conversations)) return false;
  const ids = new Set<string>();
  return store.conversations.every(conversation => {
    if (!conversation || typeof conversation.id !== 'string' || !conversation.id || ids.has(conversation.id) ||
      typeof conversation.title !== 'string' || !conversation.title.trim() ||
      !Number.isFinite(conversation.createdAt) || !Number.isFinite(conversation.updatedAt) ||
      !isChatHistory(conversation.messages)) return false;
    ids.add(conversation.id);
    return true;
  }) && ids.has(store.activeId);
}

export function loadConversations(storage: Pick<Storage, 'getItem'>) {
  const saved = storage.getItem(CONVERSATIONS_KEY);
  if (saved !== null) {
    const parsed: unknown = JSON.parse(saved);
    if (!isConversationStore(parsed)) throw new Error('Invalid conversation store');
    return { store: parsed, migrated: false };
  }
  const legacy = storage.getItem(STORAGE_KEY);
  if (legacy !== null) {
    const parsed: unknown = JSON.parse(legacy);
    if (!isChatHistory(parsed)) throw new Error('Invalid legacy history');
    return { store: createStore(parsed), migrated: true };
  }
  return { store: createStore(), migrated: false };
}

export function updateMessages(store: ConversationStore, id: string, messages: UIMessage[]): ConversationStore {
  const conversation = store.conversations.find(item => item.id === id);
  const history = textOnlyHistory(messages);
  if (!conversation || JSON.stringify(conversation.messages) === JSON.stringify(history)) return store;
  const first = history.find(message => message.role === 'user');
  return {
    ...store,
    conversations: store.conversations.map(item => item.id !== id ? item : {
      ...item,
      title: !item.messages.length && item.title === DEFAULT_TITLE && first
        ? messageText(first).replace(/\s+/g, ' ').slice(0, 60) : item.title,
      messages: history,
      updatedAt: Date.now(),
    }),
  };
}

export function conversationMarkdown(conversation: Conversation) {
  const content = conversation.messages.map(message =>
    `## ${message.role === 'user' ? '你' : '回声'}\n\n${messageText(message)}`,
  ).join('\n\n---\n\n');
  return `# ${conversation.title.replace(/[\r\n]/g, ' ')}\n\n${content}\n`;
}

export function exportFilename(title: string) {
  return `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 60) || '对话记录'}.md`;
}
