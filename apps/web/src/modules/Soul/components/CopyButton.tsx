// apps/web/src/modules/Soul/components/CopyButton.tsx
// Copy-to-clipboard pill with a short "copied" acknowledgement. Used by the live
// preview and by every prompt-library entry — the owner asked for copyable
// prompts, and a copy that gives no feedback reads as a dead button.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from 'shared/ui'

export type CopyButtonProps = {
  // The text placed on the clipboard
  text: string
}

// How long the "copied" label stays up. Long enough to read, short enough that
// the button is honest again before the user tries a second copy.
const ACK_MS = 1600

export function CopyButton({ text }: CopyButtonProps) {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The ack timer is an async effect with a lifetime: unmounting mid-ack (the
  // library card scrolls away, the modal closes) must not set state on a dead
  // component
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleCopy = async () => {
    // navigator.clipboard is absent on insecure origins and in some embedded
    // webviews — no crash, just no acknowledgement
    if (!navigator.clipboard) return
    await navigator.clipboard.writeText(text)
    setIsCopied(true)
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setIsCopied(false), ACK_MS)
  }

  return (
    <Button variant="ghost" onClick={() => void handleCopy()}>
      {isCopied ? t('soul.preview.copied') : t('soul.preview.copy')}
    </Button>
  )
}
