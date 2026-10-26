'use client';

import { ArrowUpRight, BookOpen, Code2, Download, Feather, Menu, Plus, RotateCcw, Sprout, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useConversation } from '@/hooks/use-conversation';
import { MODEL_LABEL } from '@/lib/chat';
import { ChatComposer } from './chat-composer';
import { MessageList } from './message-list';
import { ConversationList } from './conversation-list';
import { RenameConversation } from './rename-conversation';

const suggestions = [
  { icon: BookOpen, title: '把复杂的事说简单', description: '一个概念，一起慢慢拆解', prompt: '请用通俗的语言和一个生活中的例子，解释什么是大语言模型。' },
  { icon: Code2, title: '让代码有个好开头', description: '从一个想法，到第一行代码', prompt: '请用 TypeScript 写一个防抖函数，并解释它适合哪些场景。' },
  { icon: Feather, title: '给文字一点新意', description: '找到更清晰、更自然的表达', prompt: '我想把一段文字改得更清晰自然。请先问我要原文和希望使用的场景。' },
];

export function ChatWorkspace() {
  const { messages, sendMessage, status, error, clearError, regenerate, stop, busy, hydrated, storageError,
    active, conversations, newConversation, selectConversation, renameConversation, deleteConversation, exportConversation } = useConversation();
  const [input, setInput] = useState('');
  const mobileHistory = useRef<HTMLDialogElement>(null);

  function changeConversation(id?: string) {
    if (busy || !hydrated) return;
    if (id === active?.id) {
      mobileHistory.current?.close();
      return;
    }
    setInput('');
    if (id) selectConversation(id);
    else newConversation();
    mobileHistory.current?.close();
  }

  function send(text: string) {
    if (!text.trim() || busy || !hydrated) return;
    clearError();
    setInput('');
    void sendMessage({ text: text.trim() });
  }

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="对话信息">
        <a href="/" className="brand" aria-label="回声首页"><span className="brand-mark" aria-hidden="true">回</span><span>回声<small>ECHO / A SPACE TO THINK</small></span></a>
        <button className="new-chat" onClick={() => changeConversation()} disabled={busy || !hydrated}><Plus size={17} />开启新对话<span>↗</span></button>
        <ConversationList conversations={conversations} activeId={active?.id} disabled={busy || !hydrated} onSelect={changeConversation} />
        <div className="sidebar-bottom">
          <div className="sidebar-quote"><Sprout size={23} strokeWidth={1.3} /><p>给想法一点空间，<br />让可能慢慢发生。</p></div>
          <div className="storage-note"><span className="tiny-dot" />对话仅保存在此浏览器</div>
        </div>
      </aside>

      <dialog className="history-dialog" ref={mobileHistory} aria-labelledby="history-title">
        <div className="history-dialog-header"><h2 id="history-title">我的对话</h2><button className="icon-button" onClick={() => mobileHistory.current?.close()} aria-label="关闭会话列表"><X size={20} /></button></div>
        <button className="new-chat" onClick={() => changeConversation()} disabled={busy || !hydrated}><Plus size={17} />开启新对话</button>
        <ConversationList conversations={conversations} activeId={active?.id} disabled={busy || !hydrated} onSelect={changeConversation} />
        <p className="history-dialog-note">对话仅保存在当前浏览器，可导出为 Markdown。</p>
      </dialog>

      <main className="main-panel">
        <header className="topbar">
          <button className="mobile-history icon-button" onClick={() => mobileHistory.current?.showModal()} aria-label="打开会话列表"><Menu size={19} /></button>
          <div className="page-label"><span className="mobile-brand">回声<span>/</span></span>你的思考空间</div>
          <div className="model-indicator"><span className={`status-dot ${busy ? 'pulsing' : ''}`} /><span>{MODEL_LABEL}</span></div>
          <button className="mobile-new-chat" onClick={() => changeConversation()} disabled={busy || !hydrated} aria-label="开启新对话"><Plus size={19} /></button>
        </header>

        <div className="conversation-toolbar">
          <div className="conversation-heading"><span>当前对话</span><h2 title={active?.title}>{active?.title ?? '正在读取记录…'}</h2></div>
          <div className="conversation-actions" aria-label="当前会话操作">
            <RenameConversation key={active?.id} title={active?.title ?? ''} disabled={busy || !hydrated} onRename={renameConversation} />
            <button className="icon-button" onClick={exportConversation} disabled={busy || !hydrated || !messages.length} aria-label="导出当前会话" title="导出 Markdown"><Download size={16} /></button>
            <button className="icon-button delete-conversation" onClick={() => { if (deleteConversation()) setInput(''); }} disabled={busy || !hydrated} aria-label="删除当前会话" title="删除会话"><Trash2 size={15} /></button>
          </div>
        </div>

        {messages.length ? <MessageList key={active?.id} messages={messages} busy={busy} /> : (
          <section className="welcome" aria-labelledby="welcome-title">
            <div className="welcome-inner">
              <div className="welcome-eyebrow"><span />A LITTLE SPACE. A NEW POSSIBILITY.</div>
              <div className="welcome-heading"><h1 id="welcome-title">你好，<br />今天有什么<span>新想法？</span></h1><div className="orbit-art" aria-hidden="true"><i /><i /><i /><b>✳</b></div></div>
              <p className="welcome-description">一个问题、一点灵感，或一个还没成形的念头。<br />从这里开始，我们一起把它想清楚。</p>
              <div className="suggestion-heading">不妨从这里开始 <span>↓</span></div>
              <div className="suggestions">{suggestions.map(({ icon: Icon, title, description, prompt }) => (
                <button key={title} className="suggestion" disabled={!hydrated} onClick={() => send(prompt)}>
                  <span className="suggestion-top"><Icon size={20} strokeWidth={1.4} /><ArrowUpRight size={16} /></span>
                  <strong>{title}</strong><span>{description}</span>
                </button>
              ))}</div>
            </div>
          </section>
        )}

        <div className="composer-area">
          {error ? <div className="error-notice" role="alert" aria-label="发送失败"><p>{error.message === 'Failed to fetch' ? '网络连接中断，请检查网络后重试。' : error.message}</p><button type="button" onClick={() => { clearError(); void regenerate(); }} disabled={busy}><RotateCcw size={14} />重新尝试</button></div> : null}
          {storageError ? <p className="storage-warning" role="status">{storageError}</p> : null}
          {busy ? <div className="generation-status" role="status">{status === 'submitted' ? '正在等待回复…' : '回声正在回复…'}</div> : null}
          <ChatComposer input={input} onChange={setInput} onSend={() => send(input)} onStop={() => { void stop(); }} busy={busy} disabled={!hydrated} />
          <footer className="composer-footer"><span>由 AI 生成的内容可能不准确，请核实重要信息。</span><span className="footer-signature">THINK IN GOOD COMPANY.</span></footer>
        </div>
      </main>
    </div>
  );
}
