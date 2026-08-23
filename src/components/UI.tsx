import { useEffect, type ReactNode } from 'react';
import { IconClose } from './Icons';

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  full,
  icon,
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'leaf' | 'soft' | 'ghost' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  full?: boolean;
  icon?: ReactNode;
}) {
  const styles = {
    primary: 'bg-brand text-onbrand shadow-soft',
    // Takes its green from the sign-in tree; lightens a step in dark mode.
    leaf: 'bg-leaf text-white shadow-soft',
    soft: 'bg-brandsoft text-brand',
    ghost: 'bg-surface text-ink2 border border-line shadow-soft',
    danger: 'bg-neg/10 text-neg border border-neg/25',
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`press inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[0.9rem] font-bold disabled:opacity-40 ${styles} ${
        full ? 'w-full' : ''
      }`}
    >
      {icon && <span className="grid size-5 place-items-center">{icon}</span>}
      {children}
    </button>
  );
}

/** Compact square button for toolbars. */
export function IconButton({
  children,
  onClick,
  label,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`press grid size-12 shrink-0 place-items-center rounded-2xl border ${
        active ? 'border-transparent bg-brand text-onbrand' : 'border-line bg-surface text-ink2 shadow-soft'
      }`}
    >
      <span className="grid size-5 place-items-center">{children}</span>
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
      <span className="mb-2 block text-[0.72rem] font-bold tracking-wider text-muted uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-2xl border border-line bg-surface px-4 py-3.5 font-medium text-ink outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/12';

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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade absolute inset-0 bg-ink/35 backdrop-blur-[3px]" onClick={onClose} />
      <div className="animate-sheet relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-bg shadow-card sm:max-w-lg sm:rounded-[1.75rem]">
        {/* Drag handle — signals "swipe/tap away" the way native sheets do. */}
        <div className="flex justify-center pt-3 sm:hidden">
          <span className="h-1.5 w-11 rounded-full bg-line" />
        </div>
        <div className="flex items-center justify-between px-5 pt-3 pb-4">
          <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="press -mr-1 grid size-10 place-items-center rounded-full bg-surface2 text-ink2"
          >
            <IconClose className="size-4.5" />
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto px-5 pb-5"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function Banner({ kind, children }: { kind: 'error' | 'info'; children: ReactNode }) {
  const style =
    kind === 'error' ? 'bg-neg/10 text-neg border-neg/20' : 'bg-brandsoft text-brand border-brand/20';
  return (
    <div className={`rounded-2xl border px-4 py-3.5 text-sm font-medium whitespace-pre-wrap ${style}`}>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <span className="size-8 animate-spin rounded-full border-[3px] border-line border-t-brand" />
      <span className="text-sm font-medium text-muted">{label ?? 'Loading…'}</span>
    </div>
  );
}

export function Empty({
  emoji = '✨',
  title,
  body,
  action,
}: {
  emoji?: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="animate-rise px-6 py-12 text-center">
      <div className="mx-auto grid size-20 place-items-center rounded-[1.75rem] bg-surface text-4xl shadow-card">
        {emoji}
      </div>
      <p className="mt-5 text-lg font-extrabold tracking-tight">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/** Round, coloured badge with initials — the app's main identity cue. */
export function Badge({ text, color, size = 'md' }: { text: string; color: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'size-9 text-[0.7rem]' : 'size-11 text-xs';
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl font-extrabold tracking-wide ${dim}`}
      style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {text}
    </span>
  );
}
