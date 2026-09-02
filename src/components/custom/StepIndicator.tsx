import * as React from "react"
import { cn } from "@/lib/utils"

export interface StepIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  steps: {
    title: string;
    description?: string;
  }[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep, className, ...props }: StepIndicatorProps) {
  return (
    <div className={cn("flex flex-col space-y-4", className)} {...props}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        
        return (
          <div key={step.title} className="flex gap-4 items-start">
            <div className="relative flex flex-col items-center">
              <div 
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors duration-300 z-10 bg-background",
                  isCompleted ? "border-primary text-primary" : 
                  isCurrent ? "border-primary text-primary" : 
                  "border-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>
              {index < steps.length - 1 && (
                <div 
                  className={cn(
                    "absolute top-8 w-0.5 h-full -mb-4 transition-colors duration-300",
                    isCompleted ? "bg-primary" : "bg-border/50"
                  )} 
                />
              )}
            </div>
            <div className="pt-1.5 pb-6 flex flex-col gap-1">
              <span className={cn(
                "text-sm font-medium leading-none tracking-tight transition-colors duration-300",
                (isCompleted || isCurrent) ? "text-foreground" : "text-muted-foreground"
              )}>
                {step.title}
              </span>
              {step.description && (
                <span className={cn(
                  "text-sm transition-colors duration-300",
                  (isCompleted || isCurrent) ? "text-muted-foreground" : "text-muted-foreground/60"
                )}>
                  {step.description}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  )
}
