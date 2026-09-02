"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-8", className)} // Generous whitespace (Design Principle)
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex w-full items-center justify-start gap-8 h-auto bg-transparent",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "group relative flex items-center justify-center gap-2.5 px-6 py-2 text-sm font-medium whitespace-nowrap outline-none transition-all duration-150 rounded-lg",
        "text-muted-foreground hover:text-foreground",
        "data-[state=active]:text-foreground data-[state=active]:bg-muted/30",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-2.5">
        {children}
      </span>

      {/* Background Hover Highlight */}
      <div
        className={cn(
          "absolute inset-0 rounded-lg bg-muted/20",
          "opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100",
          "group-data-[state=active]:hidden"
        )}
      />
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "flex-1 outline-none pt-4",
        "animate-in fade-in slide-in-from-bottom-1 duration-300",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }

