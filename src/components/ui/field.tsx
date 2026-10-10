import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from 'react';

export const inputClass =
  'h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink ' +
  'placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-accent/30 disabled:bg-canvas disabled:text-muted';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`${inputClass} ${className}`} {...rest} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = '', ...rest }, ref) {
  return (
    <select ref={ref} className={`${inputClass} pr-8 ${className}`} {...rest} />
  );
});

export function FormMessage({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'success';
  children: React.ReactNode;
}) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`text-sm ${kind === 'error' ? 'text-negative' : 'text-positive'}`}
    >
      {children}
    </p>
  );
}
