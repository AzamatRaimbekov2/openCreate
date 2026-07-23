// apps/web/src/modules/Assets3D/model/partTransform.test.ts
// The transform is the ONE piece of assembly state that survives the session — it
// is PATCHed to `asset3d_part.transformJson` and read back on the next load. So the
// property that matters is not "does it call three correctly" but ROUND-TRIP
// FIDELITY: what the gizmo produced must be what the viewer restores, and what the
// exporter bakes. Every test here is on a real three object graph, no WebGL.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { PartTransform } from '@opencreate/contracts'
import {
  IDENTITY_TRANSFORM,
  applyPartTransform,
  matrixToPartTransform,
  partTransformToMatrix,
  readPartTransform,
} from './partTransform'

// Compare component-wise: float math means exact equality is the wrong assertion.
function expectVec3(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(3)
  for (const [i, value] of expected.entries()) expect(actual[i]).toBeCloseTo(value, 5)
}

function expectTransform(actual: PartTransform, expected: PartTransform): void {
  expectVec3(actual.position, expected.position)
  expectVec3(actual.rotation, expected.rotation)
  expectVec3(actual.scale, expected.scale)
}

const placed: PartTransform = {
  position: [0.25, 1.5, -0.75],
  rotation: [Math.PI / 6, -Math.PI / 4, Math.PI / 3],
  scale: [2, 0.5, 1.25],
}

describe('IDENTITY_TRANSFORM', () => {
  it('is the origin at unit scale, so an unplaced part sits where the GLB put it', () => {
    expect(IDENTITY_TRANSFORM).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })
  })

  it('is frozen, so one part cannot mutate the default another part reads', () => {
    expect(Object.isFrozen(IDENTITY_TRANSFORM)).toBe(true)
    expect(Object.isFrozen(IDENTITY_TRANSFORM.position)).toBe(true)
  })
})

describe('partTransformToMatrix', () => {
  it('composes position, XYZ-Euler radians and scale into one matrix', () => {
    const matrix = partTransformToMatrix(placed)

    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    matrix.decompose(position, quaternion, scale)

    expectVec3(position.toArray(), placed.position)
    expectVec3(scale.toArray(), placed.scale)
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
    expectVec3([euler.x, euler.y, euler.z], placed.rotation)
  })

  it('maps the identity transform to the identity matrix', () => {
    expect(partTransformToMatrix(IDENTITY_TRANSFORM).elements).toEqual(
      new THREE.Matrix4().elements,
    )
  })

  it('reads rotation as radians, not degrees', () => {
    // A quarter turn about Y is PI/2 radians. If this file ever treated the stored
    // number as degrees, a part would land 1.57 degrees off instead of 90 — a bug
    // that looks like "the gizmo barely moved" rather than an obvious failure.
    const matrix = partTransformToMatrix({
      position: [0, 0, 0],
      rotation: [0, Math.PI / 2, 0],
      scale: [1, 1, 1],
    })
    const forward = new THREE.Vector3(0, 0, 1).applyMatrix4(matrix)

    expectVec3(forward.toArray(), [1, 0, 0])
  })
})

describe('matrixToPartTransform', () => {
  it('round-trips a composed matrix back to the same transform', () => {
    // The gizmo writes a matrix; the PATCH stores this JSON. Drift here is silent
    // and permanent — the part is re-placed slightly wrong on every reload.
    expectTransform(matrixToPartTransform(partTransformToMatrix(placed)), placed)
  })

  it('round-trips a negative rotation', () => {
    const spun: PartTransform = {
      position: [-1, 0, 2],
      rotation: [-Math.PI / 3, 0, -Math.PI / 8],
      scale: [1, 1, 1],
    }

    expectTransform(matrixToPartTransform(partTransformToMatrix(spun)), spun)
  })

  it('round-trips a non-uniform scale', () => {
    const squashed: PartTransform = {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [3, 0.25, 1],
    }

    expectTransform(matrixToPartTransform(partTransformToMatrix(squashed)), squashed)
  })

  it('returns plain arrays, so the result is JSON-serialisable for the PATCH', () => {
    const transform = matrixToPartTransform(partTransformToMatrix(placed))

    expect(Array.isArray(transform.position)).toBe(true)
    expect(JSON.parse(JSON.stringify(transform))).toEqual(transform)
  })
})

describe('applyPartTransform', () => {
  it('places an object at the stored transform', () => {
    const object = new THREE.Object3D()

    applyPartTransform(object, placed)

    expectVec3(object.position.toArray(), placed.position)
    expectVec3([object.rotation.x, object.rotation.y, object.rotation.z], placed.rotation)
    expectVec3(object.scale.toArray(), placed.scale)
  })

  it('forces XYZ Euler order, whatever the object arrived with', () => {
    // three's default IS XYZ, but a GLB node or a gizmo can carry another order,
    // and the SAME three numbers describe a DIFFERENT rotation under YXZ. The
    // stored contract is XYZ (partTransformSchema), so pin it on write.
    const object = new THREE.Object3D()
    object.rotation.order = 'YXZ'

    applyPartTransform(object, placed)

    expect(object.rotation.order).toBe('XYZ')
    expectVec3([object.rotation.x, object.rotation.y, object.rotation.z], placed.rotation)
  })

  it('resets a previously-placed object to identity when the transform is null', () => {
    // null transform = "never placed" (the contract's nullable). It must mean the
    // GLB's own origin, not "keep whatever was there last".
    const object = new THREE.Object3D()
    applyPartTransform(object, placed)

    applyPartTransform(object, null)

    expectVec3(object.position.toArray(), [0, 0, 0])
    expectVec3(object.scale.toArray(), [1, 1, 1])
  })

  it('updates the world matrix so the exporter bakes the placement', () => {
    // GLTFExporter reads matrices. Leaving matrixWorld stale exports every part
    // stacked at the origin — a merged GLB that looks nothing like the viewer.
    const object = new THREE.Object3D()

    applyPartTransform(object, placed)

    const position = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld)
    expectVec3(position.toArray(), placed.position)
  })
})

describe('readPartTransform', () => {
  it('round-trips through an Object3D', () => {
    const object = new THREE.Object3D()
    applyPartTransform(object, placed)

    expectTransform(readPartTransform(object), placed)
  })

  it('reads a quaternion-driven object as XYZ Euler radians', () => {
    // TransformControls writes the QUATERNION. Reading `object.rotation` directly
    // would be interpreted under the object's own Euler order; going through the
    // matrix keeps the stored numbers in the contract's XYZ convention.
    const object = new THREE.Object3D()
    object.rotation.order = 'ZYX'
    object.quaternion.setFromEuler(new THREE.Euler(0.3, -0.6, 0.9, 'XYZ'))

    expectVec3(readPartTransform(object).rotation, [0.3, -0.6, 0.9])
  })

  it('reads an untouched object as the identity transform', () => {
    expectTransform(readPartTransform(new THREE.Object3D()), IDENTITY_TRANSFORM)
  })
})
