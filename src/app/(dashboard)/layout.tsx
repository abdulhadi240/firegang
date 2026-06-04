import { redirect } from 'next/navigation'
import { isAuthenticated, ADMIN_EMAIL } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect('/login')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar userEmail={ADMIN_EMAIL} userFullName="Admin" />
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">{children}</main>
    </div>
  )
}
