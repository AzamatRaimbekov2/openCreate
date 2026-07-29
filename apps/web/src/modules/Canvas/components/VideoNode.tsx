// apps/web/src/modules/Canvas/components/VideoNode.tsx
// The video mini-composer: the same body as ImageNode with kind='video' — a
// duration picker, per-duration pricing, and NO output handle, because a clip
// is terminal in the MVP (i2i and i2v both need a still, so nothing downstream
// can consume it). Its media wire makes the run an i2v.
import { GenerationNode, type GenerationNodeData } from './ImageNode'

export function VideoNode({ id, data }: { id: string; data: GenerationNodeData }) {
  return <GenerationNode id={id} data={data} kind="video" />
}
