export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-lg bg-accent text-sm font-semibold text-ink"
    >
      F
    </span>
  );
}
