/**
 * Loading skeleton for /dashboard/analyses/[id].
 * Shows a detail layout skeleton with back button, status, and tabs.
 */
export default function AnalysisDetailLoading() {
  return (
    <div className="flex flex-col gap-6 w-full h-full animate-in fade-in duration-300">
      {/* Back button */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded bg-muted animate-pulse" />
        <div className="h-4 w-16 rounded bg-muted animate-pulse" />
      </div>

      {/* Header row: title + status */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-64 rounded bg-muted animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-5 w-28 rounded-full bg-muted animate-pulse" />
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="h-10 w-28 rounded-md bg-muted animate-pulse" />
      </div>

      {/* Step indicator skeleton */}
      <div className="flex items-center justify-center gap-12 py-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-2 w-28 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>

      {/* Main content area skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left panel */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-col gap-4">
            <div className="h-5 w-32 rounded bg-muted animate-pulse" />
            <div className="h-40 w-full rounded-md bg-muted animate-pulse" />
          </div>
        </div>

        {/* Right panel */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-col gap-4">
            <div className="h-5 w-24 rounded bg-muted animate-pulse" />
            <div className="h-40 w-full rounded-md bg-muted animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
