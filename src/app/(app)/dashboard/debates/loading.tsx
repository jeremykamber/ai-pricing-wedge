/**
 * Loading skeleton for /dashboard/debates.
 * Shows a sidebar skeleton + empty room area matching the debates layout.
 */
export default function DebatesLoading() {
  return (
    <div className="flex h-full w-full animate-in fade-in duration-300">
      {/* Sidebar skeleton */}
      <div className="w-72 border-r border-border bg-sidebar flex flex-col gap-4 p-4">
        <div className="h-6 w-24 rounded bg-muted animate-pulse" />
        <div className="h-9 w-full rounded-md bg-muted animate-pulse" />
        <div className="flex flex-col gap-2 mt-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 w-full rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>

      {/* Room area skeleton */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-12">
        <div className="h-16 w-16 rounded-full bg-muted animate-pulse" />
        <div className="h-5 w-64 rounded bg-muted animate-pulse" />
        <div className="h-4 w-80 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}
