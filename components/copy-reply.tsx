'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Some embedded browsers only support copying a selected text field.
    const field = document.createElement('textarea');
    const previousFocus = document.activeElement;
    field.value = text;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(field);
    try {
      field.select();
      if (!document.execCommand('copy')) throw new Error('Copy failed');
    } finally {
      field.remove();
      if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
    }
  }
}

export function CopyReply({ text, disabled }: { text: string; disabled: boolean }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (status !== 'copied') return;
    const timer = setTimeout(() => setStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    if (status === 'copying') return;
    setStatus('copying');
    try {
      await copyText(text);
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="reply-actions">
      <button className="copy-reply" type="button" onClick={() => { void copy(); }} disabled={disabled} aria-disabled={disabled || status === 'copying'} aria-label="复制回复" title={disabled ? '回复结束后可复制' : '复制回复（保留 Markdown 格式）'}>
        {status === 'copied' ? <Check size={13} /> : <Copy size={13} />}
        {status === 'copied' ? '已复制' : status === 'copying' ? '复制中…' : '复制回复'}
      </button>
      <span className={status === 'error' ? 'copy-error' : 'sr-only'} role="status">{status === 'copied' ? '回复已复制到剪贴板。' : status === 'error' ? '复制失败，请选中回复文字手动复制。' : ''}</span>
    </div>
  );
}
