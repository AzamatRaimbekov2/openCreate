// apps/web/src/modules/Canvas/components/UploadNode.tsx
// Client upload → POST /api/canvases/:id/uploads → the stored '/media/…' path
// lands on the node (no generation, no charge). File → data URI via
// FileReader; the server re-guards raster-only and size, and answers the path
// the contract then enforces at PATCH.
//
// In THIS phase an upload node previews an image and anchors the graph
// visually; citing it as a chain input arrives with operations (phase 4),
// which is why buildRunInput skips upload parents — a stored file is not a
// generation and has no id to cite.
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WELL_SURFACE } from 'shared/ui'
import { useCanvasStore } from '../model/canvasStore'
import { uploadCanvasImage } from '../model/api'
import { NodeShell } from './NodeShell'

export function UploadNode({ id }: { id: string }) {
  const { t } = useTranslation()
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === id))
  const canvasId = useCanvasStore((s) => s.canvasId)
  const setUploadUrl = useCanvasStore((s) => s.setUploadUrl)
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'uploading' | 'error'>('idle')

  if (!node) return null

  const handleFile = (file: File) => {
    if (!canvasId) return
    setState('uploading')
    const reader = new FileReader()
    reader.onload = () => {
      void uploadCanvasImage(canvasId, String(reader.result))
        .then(({ uploadUrl }) => {
          // The path goes into the DOCUMENT; the next autosave persists it.
          setUploadUrl(id, uploadUrl)
          setState('idle')
        })
        .catch(() => setState('error'))
    }
    reader.onerror = () => setState('error')
    reader.readAsDataURL(file)
  }

  return (
    <NodeShell
      title={t('canvas.kind.upload')}
      status={node.uploadUrl ? 'succeeded' : 'idle'}
      hasInput={false}
      hasOutput
    >
      {node.uploadUrl ? (
        <img
          src={node.uploadUrl}
          alt={t('canvas.node.uploadAlt')}
          className="mb-2 w-full rounded-lg"
        />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={state === 'uploading'}
          className={`nodrag mb-2 flex aspect-square w-full items-center justify-center rounded-lg border border-dashed text-[11px] text-mist-dim transition-colors duration-200 hover:border-white/40 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-40 ${WELL_SURFACE}`}
        >
          {state === 'uploading' ? t('canvas.node.uploading') : t('canvas.node.uploadCta')}
        </button>
      )}
      {state === 'error' ? (
        <p role="alert" className="text-[11px] text-glow-red">
          {t('canvas.node.uploadFailed')}
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        aria-label={t('canvas.node.uploadCta')}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          // Clear so picking the SAME file again still fires a change event.
          e.target.value = ''
        }}
      />
    </NodeShell>
  )
}
