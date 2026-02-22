import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  "data-variant"?: string;
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary"
      ? "btn-accent"
      : variant === "secondary"
        ? "btn-secondary"
        : variant === "ghost"
          ? "btn-ghost"
          : "btn-danger";

  const dataVariant =
    props["data-variant"] ??
    (variant === "secondary" ? "soft" : variant === "ghost" ? "ghost" : variant === "danger" ? "danger" : undefined);

  return <button className={`btn ${variantClass} ui-button ui-button--${variant} ${className}`.trim()} data-variant={dataVariant} {...props} />;
}
