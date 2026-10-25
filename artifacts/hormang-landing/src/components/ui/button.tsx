import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

export const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "text-white shadow-[0_8px_20px_-4px_hsl(145,65%,38%,0.45)] hover:shadow-[0_12px_28px_-4px_hsl(145,65%,38%,0.55)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm",
        secondary:
          "text-white shadow-[0_8px_16px_-4px_hsl(214,89%,52%,0.4)] hover:shadow-[0_12px_24px_-4px_hsl(214,89%,52%,0.5)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm [background:var(--brand-gradient-45)]",
        outline:
          "border-2 border-border bg-background hover:border-primary hover:text-primary hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        glass:
          "bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0",
        link: "underline-offset-4 hover:underline text-primary",
      },
      size: {
        default: "h-11 px-6 py-2",
        sm: "h-9 rounded-lg px-4",
        lg: "h-14 rounded-2xl px-10 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", style, ...props }, ref) => {
    const gradientStyle = variant === "default"
      ? { background: "var(--brand-gradient)", ...style }
      : style;

    return (
      <button
        ref={ref}
        style={gradientStyle}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
