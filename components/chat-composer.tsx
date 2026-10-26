'use client';

import { ArrowUp, Square } from 'lucide-react';
import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';

type Props = {
  input: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
};

export function ChatComposer({ input, onChange, onSend, onStop, busy, disabled }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [input]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!busy && !disabled && input.trim()) onSend();
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing &&
      !composing.current && event.keyCode !== 229) {
      event.preventDefault();
      if (!busy && !disabled && input.trim()) onSend();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <label className="sr-only" htmlFor="message">输入消息</label>
      <textarea
        ref={textarea}
        id="message"
        placeholder="任何想法，都可以从这里开始…"
        value={input}
        onChange={event => onChange(event.target.value)}
        onKeyDown={keyDown}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={() => { composing.current = false; }}
        rows={2}
        disabled={disabled}
        aria-describedby="composer-hint"
      />
      <div className="composer-bottom">
        <span id="composer-hint" className="keyboard-hint">Enter 发送 <span>·</span> Shift + Enter 换行</span>
        {busy ? (
          <button className="send-button stop-button" type="button" onClick={onStop} aria-label="停止生成" title="停止生成">
            <Square size={15} fill="currentColor" />
          </button>
        ) : (
          <button className="send-button" type="submit" disabled={disabled || !input.trim()} aria-label="发送消息" title="发送消息">
            <ArrowUp size={21} strokeWidth={1.8} />
          </button>
        )}
      </div>
    </form>
  );
}
