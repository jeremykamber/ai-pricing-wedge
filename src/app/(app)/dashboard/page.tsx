import { DashboardClient } from '@/ui/dashboard/components/DashboardClient'
import { TestDismissButton } from '@/components/custom/TestDismissButton'

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8 w-full h-full">
      <DashboardClient />
      <TestDismissButton />
    </div>
  );
}
