import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonLook = "primary" | "secondary" | "outline" | "default";
type ButtonProps = PropsWithChildren<{
  look?: ButtonLook;
}> & Pick<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled" | "onClick">;

export const Button = ({ children, look = "default", type = "button", disabled, onClick }: ButtonProps) => (
  <button className={`button button--${look}`} type={type} disabled={disabled} onClick={onClick}>
    {children}
  </button>
);
