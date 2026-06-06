/**
 * UserMenu — avatar circle that opens a dropdown with user email + logout.
 * Closes on outside click or Esc.
 */

import { useState, useEffect, useRef } from 'react'

interface UserMenuProps {
  email: string | undefined
  onLogout: () => void
}

/** Returns up to 2 uppercase initials from an email address. */
const initials = (email: string | undefined): string => {
  if (!email) return '?'
  const local = email.split('@')[0]
  const parts  = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

const UserMenu = ({ email, onLogout }: UserMenuProps) => {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Esc
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="User menu"
        aria-expanded={open}
      >
        {initials(email)}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-100 rounded-xl shadow-lg py-1 z-50">
          {/* Email row */}
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Signed in as</p>
            <p className="text-sm text-gray-800 font-medium truncate">{email}</p>
          </div>

          {/* Logout */}
          <button
            onClick={() => { setOpen(false); onLogout() }}
            className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

export default UserMenu
