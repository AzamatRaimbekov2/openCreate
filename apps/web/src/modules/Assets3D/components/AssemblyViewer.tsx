// apps/web/src/modules/Assets3D/components/AssemblyViewer.tsx
// The ONE <Canvas> in the whole application, plus the no-WebGL fallback that
// replaces it (ADR photo-to-3d-studio D6, applied verbatim by modular-3d-assets D4).
//
// THE THREE CANVAS RULES, and why each is not a micro-optimisation:
//   · EXACTLY ONE <Canvas> alive. Browsers cap live WebGL contexts at ~8-16 and
//     silently kill the oldest past the cap. A second canvas anywhere in the app
//     would start evicting this one.
//   · dpr={[1,2]} — uncapped device pixel ratio on a 3x phone renders 9x the pixels
//     for no visible gain, and that is the memory spike that loses the context.
//   · frameloop="demand" — a scene rendering forever in a background tab drains the
//     battery and invites the OOM that kills the context. Frames are drawn when
//     something actually changes (orbit, gizmo drag, part loaded).
//
// THE FALLBACK IS A FEATURE, not an apology: it covers blocklisted GPUs, hardened
// browsers, privacy modes and crawlers/OG bots — and it is what makes the assembly
// stage testable in jsdom, where isWebGLAvailable() is false and the posters render
// instead. Real WebGL is never exercised in Vitest.
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stage } from '@react-three/drei'
import { useTranslation } from 'react-i18next'
import type { PartTransform } from '@opencreate/contracts'
import { Badge, Card, Skeleton } from 'shared/ui'
import type { GlbState } from '../model/useAssemblyGlb'
import type { GizmoMode } from '../model/wizardStore'
import type { AssemblyRow } from '../model/assemblyRows'
import { PartMesh } from './PartMesh'

export type AssemblyViewerProps = {
  // Only parts whose mesh generation SUCCEEDED and carries a GLB url (Fix FG-3).
  rows: AssemblyRow[]
  // Load state per row, index-aligned with `rows` — owned by AssemblyStage.
  states: GlbState[]
  selectedPartId: string | null
  gizmoMode: GizmoMode
  onSelect: (partId: string) => void
  onTransform: (partId: string, transform: PartTransform) => void
  // False in jsdom and on any machine that cannot make a context.
  webglAvailable: boolean
}

export function AssemblyViewer({
  rows,
  states,
  selectedPartId,
  gizmoMode,
  onSelect,
  onTransform,
  webglAvailable,
}: AssemblyViewerProps) {
  const { t } = useTranslation()

  if (!webglAvailable) {
    return <PosterFallback rows={rows} selectedPartId={selectedPartId} onSelect={onSelect} />
  }

  return (
    // Media lives in a `well` — the recessed surface step for generated content.
    // Never glass: a translucent frame over a 3D scene reads as a rendering bug.
    <Card surface="well" padding="none" className="overflow-hidden">
      <div className="h-[60svh] min-h-80 w-full" aria-label={t('assets3d.assembly.viewer')}>
        <Canvas dpr={[1, 2]} frameloop="demand" camera={{ position: [0, 1.5, 4], fov: 45 }}>
          {/* Stage supplies the neutral studio lighting + a contact shadow so a raw
              GLB reads as an object rather than a flat silhouette. Its `adjustCamera`
              is off: it reframes whenever children change, which would yank the view
              out from under the user every time another part finishes loading. */}
          <Stage adjustCamera={false} environment="city">
            {rows.map((row, index) => {
              const state = states[index]
              // A part still downloading simply is not in the scene yet. There is
              // nothing sensible to draw for it in 3D — the counter above the canvas
              // is what tells the user something is still coming.
              if (state?.status !== 'ready') return null
              return (
                <PartMesh
                  key={row.part.id}
                  part={row.part}
                  scene={state.scene}
                  selected={row.part.id === selectedPartId}
                  gizmoMode={gizmoMode}
                  onSelect={onSelect}
                  onTransform={onTransform}
                />
              )
            })}
          </Stage>
          {/* makeDefault so TransformControls can find and suspend it mid-drag —
              without it, dragging a gizmo also orbits the camera. */}
          <OrbitControls makeDefault />
        </Canvas>
      </div>
    </Card>
  )
}

// The no-WebGL view: each resolved part's EXTRACTION image. The poster is the part's
// image generation, never its mesh generation — a mesh's mediaUrls[0] is the GLB
// itself, which no <img> can display.
function PosterFallback({
  rows,
  selectedPartId,
  onSelect,
}: Pick<AssemblyViewerProps, 'rows' | 'selectedPartId' | 'onSelect'>) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      {/* Calm and explanatory, not an error: nothing failed, this machine just
          cannot open a 3D context. Export still works, so say so. */}
      <Card surface="steel" padding="md">
        <p className="text-sm text-white">{t('assets3d.assembly.fallback.title')}</p>
        <p className="mt-1 text-sm text-mist-dim">{t('assets3d.assembly.fallback.description')}</p>
      </Card>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((row) => {
          const selected = row.part.id === selectedPartId
          return (
            <li key={row.part.id}>
              <button
                type="button"
                onClick={() => onSelect(row.part.id)}
                aria-pressed={selected}
                aria-label={t('assets3d.assembly.select', { name: row.part.name })}
                className={`w-full rounded-lg text-left focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
                  selected ? 'ring-2 ring-portal' : ''
                }`}
              >
                <Card surface="well" padding="none" className="overflow-hidden">
                  {row.posterUrl ? (
                    <img
                      src={row.posterUrl}
                      alt={t('assets3d.assembly.posterAlt', { name: row.part.name })}
                      className="aspect-square w-full object-contain"
                    />
                  ) : (
                    // A part can be meshed without its extraction image still
                    // resolving — the tile keeps its shape rather than collapsing.
                    <div className="flex aspect-square w-full items-center justify-center">
                      <span className="text-xs text-mist-dim">
                        {t('assets3d.assembly.noPoster')}
                      </span>
                    </div>
                  )}
                </Card>
              </button>
              <p className="mt-2 truncate text-xs text-mist-dim">{row.part.name}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Per-row load feedback, rendered ABOVE the canvas by AssemblyStage. Kept here so the
// viewer owns every way a part's load state is presented.
export function PartLoadStatus({ row, state }: { row: AssemblyRow; state: GlbState | undefined }) {
  const { t } = useTranslation()

  if (state === undefined || state.status === 'loading') {
    return <Skeleton className="h-5 w-28" />
  }
  // NEVER state.message — that is an internal marker, not user copy.
  if (state.status === 'error') {
    return (
      <Badge variant="danger">{t('assets3d.assembly.partFailed', { name: row.part.name })}</Badge>
    )
  }
  return <Badge variant="success">{row.part.name}</Badge>
}
