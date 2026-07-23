// apps/web/src/modules/Assets3D/components/PriceTag.tsx
// A credit price printed ON a button, BEFORE the click (design.md §9).
//
// The whole component exists for its `null` branch: a price that is not known
// yet is NOT a price. While the catalog is in flight — or when the catalog has
// no model matching the server's rule — this renders a pulse and the caller
// DISABLES the button, because quoting "0 cr" or a remembered number over real
// credits is the one lie a paid surface cannot afford.
//
// Soul Studio has an identical private helper inside SoulSheet.tsx. It is not
// importable (no cross-module imports, and it is not exported anyway), so this
// is a deliberate second copy — FLAGGED as a `shared/ui` extraction candidate
// once a third module needs it (design.md §10: shared components need 2+ real
// consumers, and this is now exactly two).
import { useTranslation } from 'react-i18next'
import { Skeleton } from 'shared/ui'

export type PriceTagProps = {
  // Credits to print; null = unknown (catalog absent / model missing) → pulse
  credits: number | null
}

export function PriceTag({ credits }: PriceTagProps) {
  const { t } = useTranslation()
  if (credits === null) return <Skeleton className="h-3 w-10" />
  return <span>{t('assets3d.price', { credits })}</span>
}
