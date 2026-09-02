import * as React from "react"
import { cn } from "@/lib/utils"

export interface PersonaAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string
  imageUrl?: string | null
  size?: "sm" | "md" | "lg" | "xl" | "2xl"
}

export function PersonaAvatar({ 
  name, 
  imageUrl, 
  size = "md", 
  className,
  ...props 
}: PersonaAvatarProps) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(part => part[0])
      .join("")
      .substring(0, 2)
      .toUpperCase()
  }

  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-12 w-12 text-sm",
    lg: "h-16 w-16 text-base",
    xl: "h-20 w-20 text-lg",
    "2xl": "h-28 w-28 text-xl"
  }

  return (
    <div
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full border border-border bg-secondary",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="aspect-square h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-medium text-secondary-foreground tracking-widest">
          {getInitials(name)}
        </div>
      )}
    </div>
  )
}
