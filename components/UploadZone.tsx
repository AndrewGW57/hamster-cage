'use client'

import { useRef, useState } from 'react'

interface Props {
  label: string
  accept?: string
  onChange: (file: File | null) => void
  file: File | null
}

export function UploadZone({ label, accept = 'image/*', onChange, file }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) onChange(dropped)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
        dragging
          ? 'border-amber-400 bg-amber-50'
          : file
          ? 'border-green-400 bg-green-50'
          : 'border-gray-300 hover:border-gray-400 bg-white'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <div className="text-3xl">{file ? '✅' : '📷'}</div>
      <div className="text-sm font-medium text-gray-700">{label}</div>
      {file ? (
        <div className="text-xs text-green-600 truncate max-w-full">{file.name}</div>
      ) : (
        <div className="text-xs text-gray-400">Click or drag to upload</div>
      )}
    </div>
  )
}
