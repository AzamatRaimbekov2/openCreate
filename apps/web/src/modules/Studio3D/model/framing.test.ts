import { describe, expect, it } from 'vitest'
import { cameraPositionAt, orbitAzimuthAt } from './framing'

const orbit = { azimuthStartDeg: 0, azimuthEndDeg: 360, elevationDeg: 0, radiusFactor: 2 }

describe('orbitAzimuthAt', () => {
  it('walks from start to end across normalized time', () => {
    expect(orbitAzimuthAt(orbit, 0)).toBeCloseTo(0)
    expect(orbitAzimuthAt(orbit, 0.5)).toBeCloseTo(180)
    expect(orbitAzimuthAt(orbit, 1)).toBeCloseTo(360)
  })

  it('handles an orbit that starts at a negative azimuth', () => {
    // The 'dramatic' preset sweeps -30 -> 330. Azimuth is deliberately unbounded
    // and cyclic; a 0-360 clamp would silently break it.
    const swept = { ...orbit, azimuthStartDeg: -30, azimuthEndDeg: 330 }
    expect(orbitAzimuthAt(swept, 0)).toBeCloseTo(-30)
    expect(orbitAzimuthAt(swept, 1)).toBeCloseTo(330)
    expect(orbitAzimuthAt(swept, 0.5)).toBeCloseTo(150)
  })
})

describe('cameraPositionAt', () => {
  it('sits radius*radiusFactor away from the centre', () => {
    const [x, y, z] = cameraPositionAt(orbit, { center: [0, 0, 0], radius: 1 }, 0)
    expect(Math.hypot(x, y, z)).toBeCloseTo(2)
  })

  it('orbits in the XZ plane at zero elevation, Y-up', () => {
    const [x, y, z] = cameraPositionAt(orbit, { center: [0, 0, 0], radius: 1 }, 0)
    expect(y).toBeCloseTo(0)
    // t=0, azimuth 0 -> straight down +Z (three's default camera direction)
    expect(z).toBeCloseTo(2)
    expect(x).toBeCloseTo(0)
  })

  it('raises the camera with positive elevation', () => {
    const [, y] = cameraPositionAt({ ...orbit, elevationDeg: 90 }, { center: [0, 0, 0], radius: 1 }, 0)
    expect(y).toBeCloseTo(2) // straight overhead
  })

  it('is offset by the model centre — a mesh that is not at the origin still frames', () => {
    // Provider meshes are NOT reliably centred. Framing from the origin instead of
    // the bounding-sphere centre puts half of them out of shot.
    const [x, y, z] = cameraPositionAt(orbit, { center: [10, 5, -3], radius: 1 }, 0)
    expect(x).toBeCloseTo(10)
    expect(y).toBeCloseTo(5)
    expect(z).toBeCloseTo(-1)
  })

  it('scales with the model — a big mesh is framed the same as a small one', () => {
    // radiusFactor makes framing scale-invariant: a 2cm ring and a 3m sofa fill the
    // same fraction of the frame. That is what lets ONE preset work for every model
    // a user uploads.
    const small = cameraPositionAt(orbit, { center: [0, 0, 0], radius: 0.01 }, 0)
    const big = cameraPositionAt(orbit, { center: [0, 0, 0], radius: 100 }, 0)
    expect(Math.hypot(...small)).toBeCloseTo(0.02)
    expect(Math.hypot(...big)).toBeCloseTo(200)
  })
})
