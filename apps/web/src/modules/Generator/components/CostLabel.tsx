// apps/web/src/modules/Generator/components/CostLabel.tsx
// Live credit price of the current draft ("≈ 35 credits"). The ≈ prefix is
// honest: the charge equals this number, but the label reads as an estimate
// until submit (matches the pricing copy tone — no hard promises in UI text).
import { useTranslation } from 'react-i18next'

export type CostLabelProps = {
  // Price from selectCostCredits; null while it cannot be determined yet
  credits: number | null
}

export function CostLabel({ credits }: CostLabelProps) {
  const { t } = useTranslation()
  // No model/duration resolved yet — show nothing rather than a wrong number
  if (credits === null) return null
  return (
    // Mono weight-400 numeral in SPECIMEN GREEN (stage 3): the cost line sits
    // beside the green Generate pill and IS that action's price — tinting the
    // numeral in the same triad green ties price and action together (the
    // landing's price index uses the identical glow-green numeral voice).
    // Weight stays at 400 (ceiling law).
    <p className="text-2xl leading-none font-normal text-glow-green" data-testid="cost-label">
      {t('generator.cost', { count: credits })}
    </p>
  )
}
