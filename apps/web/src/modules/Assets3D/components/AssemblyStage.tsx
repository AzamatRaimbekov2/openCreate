// apps/web/src/modules/Assets3D/components/AssemblyStage.tsx
// THE LAZY BOUNDARY (ADR modular-3d-assets D4 → photo-to-3d-studio D6). AssetWizard
// reaches this file through `React.lazy`, and every three.js / R3F / drei import in
// the module hangs off HERE — statically — so the whole 3D graph (~260 KB gz) stays
// in its own chunk and never touches the landing/generator bundle. The route itself
// cannot be a lazy route: Concept, Parts, Extraction and Mesh belong in the main
// chunk; only the viewer is heavy enough to pay a round-trip for.
//
// It is also the VRAM OWNER. `useAssemblyGlbs` is called once, here, for the whole
// set, and the resolved scenes are passed DOWN to PartMesh and ACROSS to exportGlb.
// PartMesh deliberately does not load anything (see useAssemblyGlb.ts's ownership
// rule) — two owners would fetch every GLB twice and double the memory the loader
// exists to bound.
//
// CONTRACT WITH AssetWizard (do not change either half): named export
// `AssemblyStage`, props `{ assetId, parts }`. The stage HEADING is rendered by
// AssetWizard; this file owns only the BODY.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset3dPart, PartTransform } from '@opencreate/contracts'
import { Button, Card, EmptyState, ErrorState, PillGroup, Skeleton } from 'shared/ui'
import type { PillOption } from 'shared/ui'
import { useAsset, useUpdatePart } from '../model/asset3dApi'
import { useLivePartGenerations } from '../model/partGeneration'
import {
  assemblyGenerationIds,
  meshCitationCount,
  resolveAssemblyRows,
} from '../model/assemblyRows'
import { exportAssemblyGlb, downloadGlb, glbFilename } from '../model/exportGlb'
import { useAssemblyGlbs } from '../model/useAssemblyGlb'
import { isWebGLAvailable } from '../model/webglSupport'
import { useWizardStore } from '../model/wizardStore'
import type { GizmoMode } from '../model/wizardStore'
import { AssemblyViewer, PartLoadStatus } from './AssemblyViewer'

export type AssemblyStageProps = {
  assetId: string
  parts: Asset3dPart[]
}

export function AssemblyStage({ assetId, parts }: AssemblyStageProps) {
  const { t } = useTranslation()
  // Read once at mount, not per render: the answer cannot change while the stage is
  // open, and the probe makes (and releases) a real context each time it is asked.
  const [webglAvailable] = useState(isWebGLAvailable)
  const [exportError, setExportError] = useState(false)
  const [exporting, setExporting] = useState(false)

  // The asset itself is already in the ['asset3d', id] cache — AssetWizard loaded it.
  // We read it only for the export filename, so this costs nothing.
  const { data: detail } = useAsset(assetId)

  const selectedPartId = useWizardStore((state) => state.selectedPartId)
  const selectPart = useWizardStore((state) => state.selectPart)
  const gizmoMode = useWizardStore((state) => state.gizmoMode)
  const setGizmoMode = useWizardStore((state) => state.setGizmoMode)
  const updatePart = useUpdatePart()

  // ONE batch for every cited generation — meshes (for the GLB urls) and extraction
  // images (for the fallback posters). Fix FG-3: the GLB url is mediaUrls[0] of the
  // resolved MESH generation, never something derived from the bare id.
  const citedIds = useMemo(() => assemblyGenerationIds(parts), [parts])
  const byId = useLivePartGenerations(citedIds)
  const rows = useMemo(() => resolveAssemblyRows(parts, byId), [parts, byId])

  // The loader is keyed on url CONTENT, so rebuilding this array per render is free.
  const glbStates = useAssemblyGlbs(rows.map((row) => row.glbUrl))
  const readyCount = glbStates.filter((state) => state.status === 'ready').length

  const meshCount = meshCitationCount(parts)
  const resolvedCount = citedIds.filter((id) => byId[id] !== undefined).length

  const gizmoOptions: PillOption<GizmoMode>[] = [
    { value: 'translate', label: t('assets3d.assembly.gizmo.translate') },
    { value: 'rotate', label: t('assets3d.assembly.gizmo.rotate') },
    { value: 'scale', label: t('assets3d.assembly.gizmo.scale') },
  ]

  // ── The 4 UI states ────────────────────────────────────────────────────────
  // EMPTY: the asset genuinely has nothing to assemble.
  if (parts.length === 0) {
    return (
      <EmptyState
        title={t('assets3d.assembly.empty.title')}
        description={t('assets3d.assembly.empty.description')}
      />
    )
  }

  // VALID-BUT-WRONG-SHAPE: parts exist, none of them cites a mesh. Nothing failed and
  // there is nothing to retry, so this is a calm sentence WITHOUT a retry button —
  // the fix is upstream, in the Mesh stage.
  if (meshCount === 0) {
    return <ErrorState message={t('assets3d.assembly.noMesh')} />
  }

  // LOADING: the cited generations are still being fetched, so we do not yet know
  // which parts are placeable. Shape-matched to the viewer plate below.
  if (resolvedCount < citedIds.length && rows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-[60svh] min-h-80 w-full rounded-2xl" />
      </div>
    )
  }

  // Every mesh resolved, none of them usable — again calm, and again not retryable
  // from here.
  if (rows.length === 0) {
    return <ErrorState message={t('assets3d.assembly.noneReady')} />
  }

  // ── DATA ───────────────────────────────────────────────────────────────────
  const handleTransform = (partId: string, transform: PartTransform) => {
    updatePart.mutate({ assetId, partId, input: { transform } })
  }

  const handleExport = async () => {
    setExportError(false)
    setExporting(true)
    try {
      // Only parts that actually LOADED go into the file. A part still downloading is
      // absent rather than exported as an empty node — and `exportAssemblyGlb` refuses
      // an empty set outright, so a blank GLB can never reach the user.
      const exportParts = rows.flatMap((row, index) => {
        const state = glbStates[index]
        if (state?.status !== 'ready') return []
        return [{ name: row.part.name, scene: state.scene, transform: row.part.transform }]
      })
      const blob = await exportAssemblyGlb(exportParts)
      downloadGlb(blob, glbFilename(detail?.asset.title ?? 'asset'))
    } catch {
      // Never surface the thrown text: it is writer/internal detail, not user copy.
      setExportError(true)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mist-dim">
          {t('assets3d.assembly.loaded', { ready: readyCount, total: rows.length })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <PillGroup
            label={t('assets3d.assembly.gizmo.label')}
            options={gizmoOptions}
            value={gizmoMode}
            onChange={setGizmoMode}
          />
          <Button
            variant="primary"
            onClick={() => void handleExport()}
            isLoading={exporting}
            // Nothing loaded = nothing to write. Exporting an empty group would hand
            // the user a GLB that opens silently blank in Blender.
            disabled={readyCount === 0 || exporting}
          >
            {exporting ? t('assets3d.assembly.exporting') : t('assets3d.assembly.export')}
          </Button>
        </div>
      </div>

      {exportError ? <ErrorState message={t('assets3d.assembly.exportFailed')} /> : null}

      {/* Per-part load state, outside the canvas so it is readable (and testable)
          without WebGL. Keyed by part id — never the array index. */}
      <ul className="flex flex-wrap gap-2">
        {rows.map((row, index) => (
          <li key={row.part.id}>
            <PartLoadStatus row={row} state={glbStates[index]} />
          </li>
        ))}
      </ul>

      <AssemblyViewer
        rows={rows}
        states={glbStates}
        selectedPartId={selectedPartId}
        gizmoMode={gizmoMode}
        onSelect={selectPart}
        onTransform={handleTransform}
        webglAvailable={webglAvailable}
      />

      {/* The gizmo only exists inside the canvas, so say plainly that the fallback is
          read-only rather than leaving the controls looking broken. */}
      {!webglAvailable ? (
        <Card surface="steel" padding="md">
          <p className="text-sm text-mist-dim">{t('assets3d.assembly.description')}</p>
        </Card>
      ) : null}
    </div>
  )
}
