import * as React from "react"
import { cn } from "@/lib/utils"

export interface MinimalCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
}

export const MinimalCard = React.forwardRef<HTMLDivElement, MinimalCardProps>(
  ({ className, hoverable = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "min-w-0 rounded-lg border border-border bg-card p-6 md:p-8 text-card-foreground transition-colors duration-150",
          hoverable && "hover:border-border/80 cursor-pointer",
          className
        )}
        {...props}
      />
    )
  }
)
MinimalCard.displayName = "MinimalCard"
