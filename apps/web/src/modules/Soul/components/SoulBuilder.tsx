// apps/web/src/modules/Soul/components/SoulBuilder.tsx
// The studio's right BUILDER panel: the character's axes (SoulAxes) under a
// "start from a preset" shortcut. CONTROLLED by the studio's draft — every
// change flows straight to the owner, which is what lets the center stage and
// the bottom composer read the SAME character this panel edits.
//
// The panel only touches the SOUL: the name lives in the composer dock, so the
// two never fight over one field. The preset shortcut is the whole of what used
// to be the standalone PromptLibrary column — folded behind a button so the
// builder leads with a blank canvas but a ready-made character is one tap away.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Soul } from '@opencreate/contracts'
import { Button, Card, Modal } from 'shared/ui'
import { SoulAxes } from './SoulAxes'
import { PromptLibrary } from './PromptLibrary'

export type SoulBuilderProps = {
  // The spec being edited (the studio owns the whole draft; the name is the
  // composer's, so this panel only ever reads/writes the soul)
  soul: Soul
  onChange: (soul: Soul) => void
  // Load a ready-made character WHOLE — soul + a suggested name — into the draft.
  // The studio wires this to its draft setter; the preset modal closes on pick.
  onPreset: (soul: Soul, name: string) => void
}

export function SoulBuilder({ soul, onChange, onPreset }: SoulBuilderProps) {
  const { t } = useTranslation()
  const [isPresetOpen, setIsPresetOpen] = useState(false)

  return (
    <Card
      surface="glass"
      padding="lg"
      title={t('soul.builder.title')}
      action={
        <Button variant="ghost" size="sm" onClick={() => setIsPresetOpen(true)}>
          {t('soul.builder.preset')}
        </Button>
      }
    >
      <SoulAxes soul={soul} onChange={onChange} />

      {/* The ready-made characters, folded behind the header shortcut. The Modal
          sheet is OPAQUE steel (its default): PromptLibrary is a glass card, and
          glass over a dimmed page reads cleanly, whereas glass-on-glass would
          double the frost. `onOpen` still writes the whole Soul into the draft —
          the ADR payoff that a preset is structure, not a string — then closes. */}
      <Modal
        isOpen={isPresetOpen}
        onClose={() => setIsPresetOpen(false)}
        title={t('soul.builder.preset')}
        size="lg"
      >
        <PromptLibrary
          onOpen={(presetSoul, name) => {
            onPreset(presetSoul, name)
            setIsPresetOpen(false)
          }}
        />
      </Modal>
    </Card>
  )
}
