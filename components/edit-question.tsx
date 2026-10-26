'use client';

import { Pencil, X } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { MessageAction } from './message-action';

export function EditQuestion({ text, disabled, onSave }: {
  text: string;
  disabled: boolean;
  onSave: (text: string) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const [draft, setDraft] = useState(text);
  const canSave = !disabled && Boolean(draft.trim()) && draft.trim() !== text.trim();

  function save(event?: FormEvent) {
    event?.preventDefault();
    if (!canSave) return;
    onSave(draft.trim());
    dialog.current?.close();
  }

  return (
    <>
      <div className="question-actions"><MessageAction label="编辑最后一条问题" hint={disabled ? '回复结束后可编辑' : '编辑问题'} disabled={disabled} align="end" onClick={() => {
        setDraft(text);
        composing.current = false;
        dialog.current?.showModal();
        textarea.current?.focus();
      }}><Pencil size={16} aria-hidden="true" /></MessageAction></div>
      <dialog className="rename-dialog message-edit-dialog" ref={dialog} aria-labelledby={`${id}-heading`}>
        <form onSubmit={save}>
          <div className="rename-dialog-header"><h2 id={`${id}-heading`}>编辑最后一条问题</h2><button className="icon-button" type="button" onClick={() => dialog.current?.close()} aria-label="关闭问题编辑"><X size={18} /></button></div>
          <label htmlFor={`${id}-text`}>问题内容</label>
          <textarea id={`${id}-text`} ref={textarea} autoFocus rows={5} value={draft} onChange={event => setDraft(event.target.value)} aria-describedby={`${id}-hint`}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
                event.preventDefault();
                save();
              }
            }} />
          <p className="rename-hint" id={`${id}-hint`}>重新发送会替换这一轮问题和回复。Enter 发送，Shift + Enter 换行。</p>
          <div className="rename-dialog-actions"><button type="button" onClick={() => dialog.current?.close()}>取消</button><button className="save-name" type="submit" disabled={!canSave}>重新发送</button></div>
        </form>
      </dialog>
    </>
  );
}
