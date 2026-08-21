/**
 * Loading skeleton for /dashboard.
 * Matches the SetupView layout — the first thing users see when no personas exist.
 * Uses the existing animate-pulse / bg-muted skeleton pattern.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-300">
      {/* Headline skeleton */}
      <div className="flex flex-col gap-2">
        <div className="h-9 w-full max-w-64 rounded bg-muted animate-pulse" />
        <div className="h-4 w-full max-w-96 rounded bg-muted animate-pulse" />
      </div>

      {/* Audience Description card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-4">
          <div className="h-5 w-40 rounded bg-muted animate-pulse" />
          <div className="h-24 w-full rounded-md bg-muted animate-pulse" />
          <div className="flex justify-end">
            <div className="h-10 w-40 rounded-md bg-muted animate-pulse" />
          </div>
        </div>
      </div>

      {/* Test Environment card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-4">
          <div className="h-5 w-32 rounded bg-muted animate-pulse" />
          <div className="flex gap-4">
            <div className="h-12 flex-1 rounded-md bg-muted animate-pulse" />
            <div className="h-12 w-48 rounded-md bg-muted animate-pulse" />
          </div>
        </div>
      </div>

      {/* Demo buttons */}
      <div className="flex flex-wrap gap-3">
        <div className="h-10 w-full sm:w-44 rounded-md bg-muted animate-pulse" />
        <div className="h-10 w-full sm:w-44 rounded-md bg-muted animate-pulse" />
      </div>
    </div>
  )
}
