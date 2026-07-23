// apps/web/src/modules/Assets3D/model/partTransform.ts
// PURE bridge between the stored `PartTransform` (ADR modular-3d-assets D4) and
// three.js. Nothing here loads, renders or fetches — it is the one place that knows
// how the JSON in `asset3d_part.transformJson` becomes a placement in the scene, and
// back.
//
// THE CONVENTION IS THE CONTRACT, and both renderers depend on it:
//   · Y-up, metres — the glTF convention, so an exported GLB drops into Blender /
//     Unity / Godot without a fix-up pass.
//   · rotation is EULER XYZ in RADIANS — not degrees, not a quaternion. Degrees
//     would fail quietly (a part 1.57° off instead of 90°, which reads as "the
//     gizmo barely moved"); a quaternion would be four numbers the contract's
//     `vec3` cannot hold.
//   · scale is a free vec3 — non-uniform scale is legal and must survive the trip.
//
// Everything routes through a Matrix4 rather than touching `object.rotation`
// directly. That is deliberate: drei's TransformControls drives the QUATERNION, and
// `object.rotation` is only its projection under whatever Euler order that object
// happens to carry. The SAME three numbers mean a DIFFERENT rotation under YXZ than
// under XYZ, so reading the euler field would silently store the wrong angles for
// any node a GLB shipped with a non-default order. Decomposing the matrix and
// re-deriving XYZ pins the stored numbers to the contract.
import * as THREE from 'three'
import type { PartTransform } from '@opencreate/contracts'

// "Never placed" — the GLB sits at its own origin at unit scale. Frozen (deeply)
// because it is a shared default handed to every unplaced part; one part mutating
// it in place would move all the others.
// Annotated first, then frozen field-by-field: freezing the tuple literals inline
// would widen them to `readonly number[]`, which no longer satisfies the contract's
// fixed-length `vec3` — and papering over that with a cast is what this codebase
// does not do.
const identity: PartTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
}
Object.freeze(identity.position)
Object.freeze(identity.rotation)
Object.freeze(identity.scale)
export const IDENTITY_TRANSFORM: PartTransform = Object.freeze(identity)

// Reused scratch objects for the decompose path. Allocating a Vector3/Quaternion per
// call would churn the GC on every gizmo drag frame; this module is single-threaded
// and never holds them across an await, so sharing them is safe.
const scratchPosition = new THREE.Vector3()
const scratchQuaternion = new THREE.Quaternion()
const scratchScale = new THREE.Vector3()
const scratchEuler = new THREE.Euler(0, 0, 0, 'XYZ')

// The stored transform → one composed matrix (translation · rotation · scale).
export function partTransformToMatrix(transform: PartTransform): THREE.Matrix4 {
  const [px, py, pz] = transform.position
  const [rx, ry, rz] = transform.rotation
  const [sx, sy, sz] = transform.scale
  return new THREE.Matrix4().compose(
    new THREE.Vector3(px, py, pz),
    // 'XYZ' is stated rather than defaulted: it IS the contract, and a future
    // three release changing its default must not silently re-interpret stored data.
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')),
    new THREE.Vector3(sx, sy, sz),
  )
}

// A matrix → the stored transform. Plain number tuples, so the result is exactly
// what the PATCH body serialises (no three instances leak into the wire shape).
export function matrixToPartTransform(matrix: THREE.Matrix4): PartTransform {
  matrix.decompose(scratchPosition, scratchQuaternion, scratchScale)
  scratchEuler.setFromQuaternion(scratchQuaternion, 'XYZ')
  return {
    position: [scratchPosition.x, scratchPosition.y, scratchPosition.z],
    rotation: [scratchEuler.x, scratchEuler.y, scratchEuler.z],
    scale: [scratchScale.x, scratchScale.y, scratchScale.z],
  }
}

// Place an object at the stored transform. `null` means "never placed" and resets to
// identity — NOT "leave whatever is there", which would let a stale placement
// survive a cleared transform.
export function applyPartTransform(
  object: THREE.Object3D,
  transform: PartTransform | null,
): void {
  const { position, rotation, scale } = transform ?? IDENTITY_TRANSFORM
  const [px, py, pz] = position
  const [rx, ry, rz] = rotation
  const [sx, sy, sz] = scale

  object.position.set(px, py, pz)
  // Pin the order BEFORE the angles: a GLB node or a gizmo may have left another
  // order on this object, under which the same three numbers are a different pose.
  object.rotation.order = 'XYZ'
  object.rotation.set(rx, ry, rz, 'XYZ')
  object.scale.set(sx, sy, sz)

  // GLTFExporter and any parent-space maths read MATRICES, not the fields above.
  // Skipping this exports every part stacked at the origin — a merged GLB that
  // looks nothing like the viewer the user just arranged.
  object.updateMatrix()
  object.updateMatrixWorld(true)
}

// Read an object's LOCAL placement back out, ready to PATCH. Goes through the
// matrix (see the header) so a quaternion-driven gizmo yields contract-order angles.
export function readPartTransform(object: THREE.Object3D): PartTransform {
  object.updateMatrix()
  return matrixToPartTransform(object.matrix)
}
