'use client';

import { Pencil, X } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';

export function RenameConversation({ title, disabled, onRename }: {
  title: string;
  disabled: boolean;
  onRename: (title: string) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(title);
  const [error, setError] = useState('');

  function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('请输入会话名称。');
      input.current?.focus();
      return;
    }
    onRename(name.trim());
    dialog.current?.close();
  }

  return (
    <>
      <button className="icon-button" type="button" disabled={disabled} aria-label="重命名当前会话" title="重命名" onClick={() => {
        setName(title);
        setError('');
        dialog.current?.showModal();
        input.current?.select();
      }}><Pencil size={15} /></button>
      <dialog className="rename-dialog" ref={dialog} aria-labelledby={`${id}-heading`}>
        <form onSubmit={save}>
          <div className="rename-dialog-header"><h2 id={`${id}-heading`}>重命名会话</h2><button className="icon-button" type="button" onClick={() => dialog.current?.close()} aria-label="关闭编辑"><X size={18} /></button></div>
          <label htmlFor={`${id}-name`}>会话名称</label>
          <input ref={input} id={`${id}-name`} autoFocus maxLength={60} value={name}
            aria-invalid={error ? true : undefined} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
            onChange={event => { setName(event.target.value); setError(''); }}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
            }} />
          <p className="rename-hint" id={`${id}-hint`}>给想法起个名字，方便下次找到。最多 60 字。</p>
          {error ? <p className="rename-error" id={`${id}-error`} role="alert">{error}</p> : null}
          <div className="rename-dialog-actions"><button type="button" onClick={() => dialog.current?.close()}>取消</button><button className="save-name" type="submit" disabled={disabled}>保存</button></div>
        </form>
      </dialog>
    </>
  );
}
