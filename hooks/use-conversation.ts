'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { messageText, STORAGE_KEY, textOnlyHistory } from '@/lib/chat';
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

type ReplacementAction = { type: 'edit'; messageId: string; text: string } | { type: 'regenerate'; messageId: string };

export function useConversation() {
  const [store, setStore] = useState<ConversationStore | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const canSave = useRef(true);
  const migrated = useRef(false);
  const replacement = useRef<{ result?: UIMessage[]; error?: Error } | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [failedReplacement, setFailedReplacement] = useState<{ action: ReplacementAction; error: Error } | null>(null);
  const active = store?.conversations.find(item => item.id === store.activeId);
  const chat = useChat({
    id: active?.id ?? 'loading', messages: active?.messages ?? [], transport,
    onError: error => { if (replacement.current) replacement.current.error = error; },
    onFinish: ({ messages, message, isAbort }) => {
      if (replacement.current && !(isAbort && !messageText(message).trim())) replacement.current.result = messages;
    },
  });
  const { messages, status } = chat;
  const busy = replacing || status === 'submitted' || status === 'streaming';
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
    // Keep the saved original intact until a replacement settles, including across refreshes.
    if (!activeId || status === 'streaming' || replacing || replacement.current) return;
    setStore(previous => previous ? updateMessages(previous, activeId, messages) : previous);
  }, [activeId, messages, status, replacing]);

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

  function clearError() {
    chat.clearError();
    setFailedReplacement(null);
  }

  async function replaceLastTurn(action: ReplacementAction) {
    if (!activeId || busy || replacement.current) return;
    const original = textOnlyHistory(messages);
    const operation: { result?: UIMessage[]; error?: Error } = {};
    replacement.current = operation;
    setReplacing(true);
    clearError();
    try {
      if (action.type === 'edit') await chat.sendMessage({ messageId: action.messageId, text: action.text });
      else await chat.regenerate({ messageId: action.messageId });
    } catch (error) {
      operation.error = error instanceof Error ? error : new Error('操作失败，请重试。');
    }
    const next = operation.error ? original : textOnlyHistory(operation.result ?? original);
    chat.setMessages(next);
    if (operation.error) setFailedReplacement({ action, error: operation.error });
    setStore(previous => previous ? updateMessages(previous, activeId, next) : previous);
    replacement.current = null;
    setReplacing(false);
  }

  function editLastQuestion(text: string) {
    const question = messages.findLast(message => message.role === 'user');
    if (!question || !text.trim() || text.trim() === messageText(question).trim()) return;
    void replaceLastTurn({ type: 'edit', messageId: question.id, text: text.trim() });
  }

  function regenerateLastReply() {
    const reply = messages.at(-1);
    if (reply?.role !== 'assistant' || !messageText(reply).trim()) return;
    void replaceLastTurn({ type: 'regenerate', messageId: reply.id });
  }

  function retry() {
    if (busy) return;
    if (failedReplacement) void replaceLastTurn(failedReplacement.action);
    else {
      clearError();
      void chat.regenerate();
    }
  }

  function newConversation() {
    if (!store || busy || !activeId) return;
    clearError();
    const saved = updateMessages(store, activeId, messages);
    const empty = saved.conversations.find(item => item.messages.length === 0);
    const next = empty ?? createConversation();
    setStore({ ...saved, activeId: next.id, conversations: empty ? saved.conversations : [next, ...saved.conversations] });
  }

  function selectConversation(id: string) {
    if (!store || busy || !activeId || !store.conversations.some(item => item.id === id)) return;
    clearError();
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
    clearError();
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
    error: failedReplacement?.error ?? chat.error, replacementFailed: failedReplacement !== null,
    clearError, retry, editLastQuestion, regenerateLastReply,
    conversations: store?.conversations.toSorted((a, b) => b.updatedAt - a.updatedAt) ?? [],
    newConversation, selectConversation, renameConversation, deleteConversation, exportConversation,
  };
}
