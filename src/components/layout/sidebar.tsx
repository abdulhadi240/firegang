'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Building2, ClipboardList, LogOut, Menu, X, FlaskConical, BarChart3, PieChart } from 'lucide-react'

const navItems = [
  { href: '/dashboard',             label: 'Dashboard',  icon: LayoutDashboard, exact: true },
  { href: '/dashboard/companies',   label: 'Companies',  icon: Building2 },
  { href: '/dashboard/audit-logs',  label: 'Audit Logs', icon: ClipboardList },
  { href: '/dashboard/summary',     label: 'Summary',    icon: PieChart },
]

const testingItems = [
  { href: '/dashboard/testing/calls', label: 'Test Calls', icon: FlaskConical },
  { href: '/dashboard/testing/runs',  label: 'Test Runs',  icon: BarChart3 },
]

interface SidebarProps {
  userEmail?: string
  userFullName?: string
}

export function Sidebar({ userEmail, userFullName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  const NavLinks = () => (
    <>
      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium px-3 mb-3">
        Main Menu
      </p>
      {navItems.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href, item.exact)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              active
                ? 'bg-orange-50 text-[#E8431A] border border-orange-100'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}

      <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium px-3 mt-6 mb-3">
        LLM Testing
      </p>
      {testingItems.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              active
                ? 'bg-orange-50 text-[#E8431A] border border-orange-100'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </>
  )

  const UserFooter = () => (
    <div className="p-4 border-t border-gray-200">
      <div className="flex items-center gap-3 px-3 py-2 mb-1">
        <div className="w-8 h-8 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-[#E8431A]">
            {(userFullName || userEmail || 'U').charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{userFullName || 'Team Member'}</p>
          <p className="text-xs text-gray-500 truncate">{userEmail}</p>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all duration-150"
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </div>
  )

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4">
        <Image src="/logo.png" alt="Firegang" width={96} height={29} />
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* ── Mobile drawer overlay ── */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <Image src="/logo.png" alt="Firegang" width={104} height={32} />
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-0.5 overflow-y-auto">
              <NavLinks />
            </nav>
            <UserFooter />
          </div>
        </div>
      )}

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex w-64 min-h-screen bg-white border-r border-gray-200 flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-200">
          <Image src="/logo.png" alt="Firegang Dental Marketing" width={120} height={36} priority />
          <span className="block text-[10px] text-gray-400 uppercase tracking-widest mt-1.5">
            Call Audit System
          </span>
        </div>
        <nav className="flex-1 p-4 space-y-0.5">
          <NavLinks />
        </nav>
        <UserFooter />
      </aside>
    </>
  )
}
