'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { STORAGE_KEY, textOnlyHistory } from '@/lib/chat';
import {
  CONVERSATIONS_KEY, conversationMarkdown, createConversation, createStore, exportFilename,
  loadConversations, updateMessages, type ConversationStore,
} from '@/lib/conversations';

const transport = new DefaultChatTransport({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ messages, id, trigger, messageId }) => ({
    body: { id, trigger, messageId, messages: textOnlyHistory(messages) },
  }),
});

export function useConversation() {
  const [store, setStore] = useState<ConversationStore | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const canSave = useRef(true);
  const migrated = useRef(false);
  const active = store?.conversations.find(item => item.id === store.activeId);
  const chat = useChat({ id: active?.id ?? 'loading', messages: active?.messages ?? [], transport });
  const { messages, status } = chat;
  const busy = status === 'submitted' || status === 'streaming';
  const activeId = active?.id;

  useEffect(() => {
    try {
      const loaded = loadConversations(localStorage);
      migrated.current = loaded.migrated;
      setStore(loaded.store);
    } catch {
      canSave.current = false;
      setStorageError('浏览器记录无法读取；原记录未被覆盖。本次对话暂存于内存，请在离开前导出。');
      setStore(createStore());
    }
  }, []);

  useEffect(() => {
    if (!activeId || status === 'streaming') return;
    setStore(previous => previous ? updateMessages(previous, activeId, messages) : previous);
  }, [activeId, messages, status]);

  useEffect(() => {
    if (!store || !canSave.current) return;
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(store));
      if (migrated.current) {
        localStorage.removeItem(STORAGE_KEY);
        migrated.current = false;
      }
      setStorageError(null);
    } catch {
      setStorageError('浏览器记录无法保存，可能是空间不足或存储被禁用；请在离开前导出需要的对话。');
    }
  }, [store]);

  function newConversation() {
    if (!store || busy || !activeId) return;
    const saved = updateMessages(store, activeId, messages);
    const empty = saved.conversations.find(item => item.messages.length === 0);
    const next = empty ?? createConversation();
    setStore({ ...saved, activeId: next.id, conversations: empty ? saved.conversations : [next, ...saved.conversations] });
  }

  function selectConversation(id: string) {
    if (!store || busy || !activeId || !store.conversations.some(item => item.id === id)) return;
    setStore({ ...updateMessages(store, activeId, messages), activeId: id });
  }

  function renameConversation(name: string) {
    if (!store || !active || busy) return;
    const title = name.trim().slice(0, 60);
    if (!title) return;
    setStore(previous => previous ? {
      ...previous, conversations: previous.conversations.map(item => item.id === active.id ? { ...item, title } : item),
    } : previous);
  }

  function deleteConversation() {
    if (!store || !active || busy) return;
    if (!window.confirm(`删除「${active.title}」？这段对话将从当前浏览器移除，无法恢复。`)) return;
    const remaining = store.conversations.filter(item => item.id !== active.id);
    setStore(remaining.length ? {
      ...store, activeId: remaining.toSorted((a, b) => b.updatedAt - a.updatedAt)[0].id, conversations: remaining,
    } : createStore());
    return true;
  }

  function exportConversation() {
    if (!active || busy || !messages.length) return;
    const markdown = conversationMarkdown({ ...active, messages: textOnlyHistory(messages) });
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename(active.title);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    ...chat, busy, hydrated: store !== null, storageError, active,
    conversations: store?.conversations.toSorted((a, b) => b.updatedAt - a.updatedAt) ?? [],
    newConversation, selectConversation, renameConversation, deleteConversation, exportConversation,
  };
}
