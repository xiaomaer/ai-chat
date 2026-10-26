'use client';

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { messageText } from '@/lib/chat';

export function MessageList({ messages, busy }: { messages: UIMessage[]; busy: boolean }) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  const lastUserId = messages.findLast(message => message.role === 'user')?.id;

  useEffect(() => { followBottom.current = true; }, [lastUserId]);

  useEffect(() => {
    const element = scrollArea.current;
    if (element && followBottom.current) element.scrollTop = element.scrollHeight;
  }, [messages, busy]);

  const lastMessage = messages.at(-1);
  const waiting = busy && (lastMessage?.role !== 'assistant' || !messageText(lastMessage));

  return (
    <div className="message-scroll" ref={scrollArea} onScroll={() => {
      const element = scrollArea.current;
      if (element) followBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
    }}>
      <div className="message-list" role="log" aria-label="聊天记录" aria-live="polite" aria-relevant="additions" aria-busy={busy}>
        <div className="conversation-start"><span />每个好想法，都始于一次对话<span /></div>
        {messages.map(message => {
          const text = messageText(message);
          if (!text) return null;
          return (
            <article key={message.id} className={`message message-${message.role}`} aria-label={message.role === 'user' ? '你的消息' : '回声的回复'}>
              {message.role === 'assistant' ? <div className="assistant-avatar" aria-hidden="true">回</div> : null}
              <div className="message-content">
                <span className="message-author">{message.role === 'user' ? '你' : '回声'}</span>
                {message.role === 'user' ? <p className="user-text">{text}</p> : (
                  <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} components={{
                    a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
                    img: ({ alt }) => <span className="image-placeholder">[图片：{alt || '模型返回的图片'}]</span>,
                  }}>{text}</Markdown></div>
                )}
              </div>
            </article>
          );
        })}
        {waiting ? <div className="thinking" role="status"><div className="assistant-avatar" aria-hidden="true">回</div><span>正在整理思路</span><i /><i /><i /></div> : null}
      </div>
    </div>
  );
}
