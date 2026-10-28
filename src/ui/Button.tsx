import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button({
  title,
  children,
  active = false,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...rest}
      title={title}
      aria-label={rest["aria-label"] ?? title}
      className={`${rest.className ?? ""} ${active ? "active" : ""}`}
    >
      {children}
    </button>
  );
}
