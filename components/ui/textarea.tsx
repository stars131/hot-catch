import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-lg border border-input bg-card px-3.5 py-3 text-base outline outline-2 outline-transparent ring-offset-background transition-[background-color,border-color] duration-micro placeholder:text-muted-foreground hover:border-foreground/30 focus-visible:border-input focus-visible:outline-ring focus-visible:outline-offset-1 focus-visible:ring-0 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-[0.55] aria-[invalid=true]:border-destructive aria-[invalid=true]:outline-destructive md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
