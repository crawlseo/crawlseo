import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Atomize PRO buttons — soft pill primary (lavender)
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent text-sm font-medium whitespace-nowrap transition-all duration-200 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-1)] hover:bg-[var(--a-violet-400,#c4b5fd)]",
        outline:
          "rounded-full border-border bg-secondary/60 text-foreground hover:bg-secondary",
        secondary:
          "rounded-full bg-secondary text-secondary-foreground hover:bg-muted",
        ghost:
          "rounded-full text-foreground hover:bg-muted",
        destructive:
          "rounded-full bg-[var(--a-danger-300)] text-[var(--a-danger-900)] hover:opacity-90",
        link: "rounded-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-2 px-4",
        xs: "h-6 gap-1 rounded-full px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-full px-3.5 text-[13px]",
        lg: "h-11 gap-2 rounded-full px-6 text-[15px]",
        icon: "size-9 rounded-full",
        "icon-xs": "size-6 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-full",
        "icon-lg": "size-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
