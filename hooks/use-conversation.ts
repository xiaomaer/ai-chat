'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useState } from 'react';
import { isChatHistory, STORAGE_KEY, textOnlyHistory } from '@/lib/chat';

const transport = new DefaultChatTransport({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ messages, id, trigger, messageId }) => ({
    body: { id, trigger, messageId, messages: textOnlyHistory(messages) },
  }),
});

export function useConversation() {
  const chat = useChat({ transport });
  const { messages, setMessages, status, clearError } = chat;
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isChatHistory(parsed)) setMessages(parsed);
        else setStorageError(true);
      }
    } catch {
      setStorageError(true);
    }
    setHydrated(true);
  }, [setMessages]);

  useEffect(() => {
    if (!hydrated || busy) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(textOnlyHistory(messages)));
    } catch {
      setStorageError(true);
    }
  }, [messages, hydrated, busy]);

  function clearConversation() {
    if (busy) return;
    if (messages.length && !window.confirm('清空这段对话并重新开始？此操作会删除当前浏览器保存的聊天记录。')) return;
    clearError();
    setMessages([]);
  }

  return { ...chat, busy, hydrated, storageError, clearConversation };
}
