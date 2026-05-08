'use client'

import { useState, useEffect } from 'react'

interface AdminRow {
  id: string
  username: string
  created_at: string
}

export function AdminManagement() {
  const [open, setOpen] = useState(false)
  const [admins, setAdmins] = useState<AdminRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [changePwFor, setChangePwFor] = useState<string | null>(null)
  const [newPw, setNewPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')

  const [addOpen, setAddOpen] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    if (open && admins.length === 0) fetchAdmins()
  }, [open])

  async function fetchAdmins() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/list-admins')
    if (!res.ok) {
      setError('Failed to load admins')
      setLoading(false)
      return
    }
    const data = await res.json()
    setAdmins(data.admins ?? [])
    setLoading(false)
  }

  async function handleDelete(username: string) {
    if (!confirm(`Delete admin "${username}"?`)) return
    const res = await fetch('/api/delete-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    if (res.ok) {
      setAdmins((prev) => prev.filter((a) => a.username !== username))
    } else {
      const d = await res.json()
      setError(d.error ?? 'Delete failed')
    }
  }

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!changePwFor || !newPw) return
    setPwSaving(true)
    setPwError('')
    const res = await fetch('/api/update-admin-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: changePwFor, new_password: newPw }),
    })
    if (res.ok) {
      setChangePwFor(null)
      setNewPw('')
    } else {
      const d = await res.json()
      setPwError(d.error ?? 'Failed')
    }
    setPwSaving(false)
  }

  async function handleAddAdmin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!newUsername || !newPassword) return
    setAddSaving(true)
    setAddError('')
    const res = await fetch('/api/create-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newPassword }),
    })
    if (res.ok) {
      const d = await res.json()
      setAdmins((prev) => [...prev, d.admin])
      setNewUsername('')
      setNewPassword('')
      setAddOpen(false)
    } else {
      const d = await res.json()
      setAddError(d.error ?? 'Failed')
    }
    setAddSaving(false)
  }

  return (
    <div className="mt-8 border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-700">Manage Admins</span>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4">
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          {loading ? (
            <p className="text-gray-400 text-sm">Loading…</p>
          ) : (
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="pb-2 text-left font-medium">Username</th>
                  <th className="pb-2 text-left font-medium">Created</th>
                  <th className="pb-2" />
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <>
                    <tr key={admin.id} className="border-b border-gray-100">
                      <td className="py-2 font-medium text-gray-800">{admin.username}</td>
                      <td className="py-2 text-gray-500">
                        {new Date(admin.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => {
                            setChangePwFor(admin.username)
                            setNewPw('')
                            setPwError('')
                          }}
                          className="text-xs text-amber-600 hover:text-amber-700"
                        >
                          Change Password
                        </button>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleDelete(admin.username)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                    {changePwFor === admin.username && (
                      <tr key={`${admin.id}-pw`} className="border-b border-gray-100 bg-amber-50">
                        <td colSpan={4} className="py-2 px-2">
                          <form onSubmit={handleChangePassword} className="flex items-center gap-2">
                            <input
                              type="password"
                              placeholder="New password"
                              value={newPw}
                              onChange={(e) => setNewPw(e.target.value)}
                              className="flex-1 bg-white border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400"
                              autoFocus
                            />
                            {pwError && <span className="text-red-500 text-xs">{pwError}</span>}
                            <button
                              type="submit"
                              disabled={pwSaving}
                              className="bg-amber-400 hover:bg-amber-500 text-black text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                            >
                              {pwSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setChangePwFor(null)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}

          {!addOpen ? (
            <button
              onClick={() => setAddOpen(true)}
              className="text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              + Add Admin
            </button>
          ) : (
            <form
              onSubmit={handleAddAdmin}
              className="border-t border-gray-200 pt-3 space-y-2"
            >
              <p className="text-sm font-medium text-gray-700 mb-2">Add Admin</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="bg-white border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-white border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
              {addError && <p className="text-red-500 text-xs">{addError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={addSaving}
                  className="bg-amber-400 hover:bg-amber-500 text-black text-sm font-semibold px-4 py-1.5 rounded transition-colors disabled:opacity-50"
                >
                  {addSaving ? 'Adding…' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddOpen(false)
                    setAddError('')
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
