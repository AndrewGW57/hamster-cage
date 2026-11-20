'use client'

import { useRef, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export function PasswordInput({ className = '', ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function toggle() {
    const input = inputRef.current
    const hadFocus = input !== null && document.activeElement === input
    const start = input?.selectionStart ?? null
    const end = input?.selectionEnd ?? null
    setVisible((v) => !v)
    // Changing the input type can reset the caret; put it back where it was.
    if (hadFocus && input) {
      requestAnimationFrame(() => {
        input.focus()
        if (start !== null && end !== null) input.setSelectionRange(start, end)
      })
    }
  }

  return (
    <div className="relative">
      <input
        {...props}
        ref={inputRef}
        type={visible ? 'text' : 'password'}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={toggle}
        // Keep focus in the input when toggled with a mouse or touch.
        onMouseDown={(e) => e.preventDefault()}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-amber-500 focus:outline-none focus-visible:text-amber-500 rounded-r-lg transition-colors"
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  )
}
