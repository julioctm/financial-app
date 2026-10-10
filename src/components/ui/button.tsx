import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-ink hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-canvas',
  ghost: 'text-muted hover:bg-line/60 hover:text-ink',
  danger: 'text-negative hover:bg-negative-tint',
};

const sizes: Record<Size, string> = {
  md: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-sm',
};

// Also usable on <Link>: <Link className={buttonClass({ variant: 'secondary' })} />
export function buttonClass({
  variant = 'primary',
  size = 'md',
  className = '',
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant, size, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, className })}
      {...rest}
    />
  );
});
