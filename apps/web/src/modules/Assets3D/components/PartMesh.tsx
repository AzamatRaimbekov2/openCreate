// apps/web/src/modules/Assets3D/components/PartMesh.tsx
// ONE part inside the assembly canvas: its loaded GLB scene, placed at the part's
// saved transform, and — when it is the selected part — a drei TransformControls
// gizmo whose released drag is PATCHed back to `asset3d_part.transformJson`.
//
// THIS COMPONENT DOES NOT LOAD ANYTHING. The scene arrives as a prop because
// AssemblyStage owns `useAssemblyGlbs` for the whole set (see useAssemblyGlb.ts's
// ownership rule). Calling the singular loader here as well would fetch every GLB
// twice and double the VRAM the loader exists to bound — the exact double-load the
// model layer warned about.
//
// It lives inside the lazy AssemblyStage chunk, so its three.js / drei imports never
// reach the main bundle.
import { useEffect, useState } from 'react'
import { TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import type { Asset3dPart, PartTransform } from '@opencreate/contracts'
import { applyPartTransform, readPartTransform } from '../model/partTransform'
import type { GizmoMode } from '../model/wizardStore'

export type PartMeshProps = {
  part: Asset3dPart
  // The loaded GLB scene, owned by AssemblyStage's loader.
  scene: THREE.Group
  selected: boolean
  gizmoMode: GizmoMode
  onSelect: (partId: string) => void
  // Fired on gizmo RELEASE, not on every dragged frame — see below.
  onTransform: (partId: string, transform: PartTransform) => void
}

export function PartMesh({
  part,
  scene,
  selected,
  gizmoMode,
  onSelect,
  onTransform,
}: PartMeshProps) {
  // The wrapper we transform, so the GLB's own subtree is never mutated: the same
  // scene object is handed to exportGlb, and baking a placement into it would make
  // the export and the viewer disagree about what "unplaced" means.
  //
  // STATE, not useRef: TransformControls needs the actual Object3D as a prop, and a
  // ref's `.current` read during render is null on the first pass — the gizmo would
  // silently never attach until some unrelated re-render happened to come along. A
  // callback ref stored in state re-renders exactly when the node mounts.
  const [group, setGroup] = useState<THREE.Group | null>(null)

  // Place the part when its saved transform changes (initial mount, or a reload
  // after someone else moved it). NOT on every render: while the gizmo is being
  // dragged, three owns the object's matrix and re-applying the SERVER value each
  // frame would fight the user's cursor and snap the part back.
  useEffect(() => {
    if (group) applyPartTransform(group, part.transform)
  }, [group, part.transform])

  return (
    <>
      <group
        ref={setGroup}
        onClick={(event) => {
          // Without this the click also reaches every part BEHIND this one and the
          // last one wins — selection would appear to pick a random part.
          event.stopPropagation()
          onSelect(part.id)
        }}
      >
        <primitive object={scene} />
      </group>

      {selected && group ? (
        <TransformControls
          object={group}
          mode={gizmoMode}
          // PATCH on RELEASE only. TransformControls fires a change event per frame
          // of a drag; wiring the mutation to that would send dozens of writes per
          // gesture and pay for an aggregate refetch on each one. Mouse-up is the
          // end of the gesture, which is the one state worth persisting.
          onMouseUp={() => onTransform(part.id, readPartTransform(group))}
        />
      ) : null}
    </>
  )
}
