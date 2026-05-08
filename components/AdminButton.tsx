'use client'

import { useState, useEffect } from 'react'

export function AdminButton() {
  const [label, setLabel] = useState('Admin')

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('adminSession')
      if (!raw) return
      const session = JSON.parse(raw)
      if (session?.authenticated && session?.username) {
        setLabel(session.username)
      }
    } catch {}
  }, [])

  return (
    <a
      href="/admin"
      className="px-3 py-1.5 text-sm border border-amber-400 text-amber-500 rounded-lg hover:bg-amber-50 transition-colors"
    >
      {label}
    </a>
  )
}
