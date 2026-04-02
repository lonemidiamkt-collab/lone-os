import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a34f5]/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[#0a34f5] text-white shadow-[0_0_20px_rgba(10,52,245,0.3),0_4px_14px_rgba(10,52,245,0.2)] hover:shadow-[0_0_30px_rgba(10,52,245,0.5),0_6px_20px_rgba(10,52,245,0.3)] hover:brightness-110 active:scale-[0.98]",
        destructive: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",
        outline: "border border-[#222230] bg-transparent hover:bg-[#0a34f5]/5 hover:border-[#0a34f5]/30 hover:text-[#0a34f5]",
        secondary: "bg-[#141420] text-secondary-foreground border border-[#222230] hover:bg-[#0a34f5]/5 hover:border-[#0a34f5]/20",
        ghost: "hover:bg-[#0a34f5]/5 hover:text-foreground",
        link: "text-[#0a34f5] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-xl px-8",
        icon: "h-9 w-9",
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
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
