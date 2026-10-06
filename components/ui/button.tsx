import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Buttons: Geist Mono 500 uppercase labels, 6px radius. Primary is #E8330C
 * with a white label (4.28:1, the one accepted exception), #C71F07 on hover.
 */
const buttonVariants = cva(
  "group/button mono-button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-button-primary text-primary-foreground hover:bg-button-primary-hover disabled:bg-brand-200 disabled:opacity-100",
        outline:
          "bg-button-secondary text-text-strong shadow-[inset_0_0_0_1px_var(--border-color)] hover:bg-button-secondary-hover",
        secondary:
          "bg-button-secondary text-text-strong shadow-[inset_0_0_0_1px_var(--border-color)] hover:bg-button-secondary-hover",
        ghost: "text-text-strong hover:bg-bg-section",
        destructive:
          "border-danger/40 bg-bg text-danger hover:bg-danger-bg",
        link: "h-auto rounded-none px-0 font-sans font-normal normal-case tracking-normal text-link",
      },
      size: {
        default: "h-[38px] gap-2 px-4 text-[13px]",
        xs: "h-7 gap-1 px-2.5 text-[11px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-[12px]",
        lg: "h-10 gap-2 px-5 text-[14px]",
        icon: "size-[38px]",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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
