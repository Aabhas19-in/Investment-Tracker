import { useEffect, type ReactNode } from 'react';

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  full?: boolean;
}) {
  const styles = {
    primary: 'bg-emerald-400 text-slate-950 active:bg-emerald-300',
    ghost: 'bg-[var(--color-ink-soft)] text-slate-200 border border-[var(--color-line)] active:bg-[var(--color-line)]',
    danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/30 active:bg-rose-500/25',
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-40 ${styles} ${
        full ? 'w-full' : ''
      }`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium tracking-wide text-[var(--color-mute)] uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--color-mute)]">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-ink-soft)] px-3 py-3 text-slate-100 outline-none focus:border-emerald-400/60';

/** Bottom sheet — the mobile-native way to show a form. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-sheet relative flex max-h-[88vh] w-full flex-col rounded-t-3xl border border-[var(--color-line)] bg-[var(--color-ink)] sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex size-9 items-center justify-center rounded-full text-xl text-[var(--color-mute)] active:bg-[var(--color-ink-soft)]"
          >
            ×
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto px-5 py-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function Banner({ kind, children }: { kind: 'error' | 'info'; children: ReactNode }) {
  const style =
    kind === 'error'
      ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
      : 'border-sky-500/30 bg-sky-500/10 text-sky-200';
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap ${style}`}>{children}</div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--color-mute)]">
      <span className="size-4 animate-spin rounded-full border-2 border-[var(--color-line)] border-t-emerald-400" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-base font-semibold text-slate-200">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-[var(--color-mute)]">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
