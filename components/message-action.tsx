'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function MessageAction({ label, hint = label, disabled = false, pending = false, align = 'start', className = '', onClick, children }: {
  label: string;
  hint?: string;
  disabled?: boolean;
  pending?: boolean;
  align?: 'start' | 'end';
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [open]);

  return (
    <span className="message-action-wrap" onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true); }}
      onPointerLeave={() => { if (!button.current?.matches(':focus-visible')) setOpen(false); }}>
      <button ref={button} className={`message-action ${className}`} type="button" disabled={disabled} aria-disabled={disabled || pending}
        aria-label={label} aria-describedby={open ? id : undefined}
        onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setOpen(true); }} onBlur={() => setOpen(false)}
        onClick={() => { setOpen(false); if (!pending) onClick(); }}>
        {children}
      </button>
      {open ? <span id={id} className="message-action-tooltip" data-align={align} role="tooltip"><span>{hint}</span></span> : null}
    </span>
  );
}
