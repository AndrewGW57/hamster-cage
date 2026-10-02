import Image from 'next/image'

export interface WoodenSpoonWeek {
  weekNumber: number
  names: string[]
}

/**
 * Wooden Spoon sponsor block, shown under the UBN logo in the site header.
 * Sized at roughly 75% of the UBN logo (45px mobile / 90px desktop).
 * The "Week winner" line only renders when there's a recipient to name.
 */
export function WoodenSpoonSponsor({
  variant,
  spoonWeek,
}: {
  variant: 'mobile' | 'desktop'
  spoonWeek?: WoodenSpoonWeek | null
}) {
  const isDesktop = variant === 'desktop'
  const imgSize = isDesktop ? 90 : 45
  const imgClass = isDesktop ? 'h-[90px] w-auto' : 'h-[45px] w-auto'
  const textClass = isDesktop ? 'text-xs text-[#9ca3af]' : 'text-[10px] text-[#9ca3af]'

  return (
    <div className={`flex flex-col items-center text-center ${isDesktop ? 'mt-3' : 'mt-2'}`}>
      <span className={textClass}>Wooden Spoon sponsored by MJ / GPC</span>
      <div className={`flex items-center justify-center ${isDesktop ? 'gap-3 mt-1' : 'gap-2 mt-0.5'}`}>
        <Image src="/GNCLogo.jpeg" alt="GPC" height={imgSize} width={imgSize} className={imgClass} style={{ width: 'auto' }} />
        <Image src="/WoodenSpoonLogo.png" alt="Wooden Spoon" height={imgSize} width={imgSize} className={imgClass} style={{ width: 'auto' }} />
      </div>
      {spoonWeek && spoonWeek.names.length > 0 && (
        <span className={`${textClass} mt-1`}>
          Week {spoonWeek.weekNumber} winner: {spoonWeek.names.join(', ')}
        </span>
      )}
    </div>
  )
}
