'use client'

export function PlayerFlag({ code }: { code: string | null }) {
  if (!code) return <span className="w-4 h-3 inline-block" />
  return (
    <img
      src={`https://flagcdn.com/16x12/${code.toLowerCase()}.png`}
      alt={code}
      className="inline-block w-4 h-3"
    />
  )
}
