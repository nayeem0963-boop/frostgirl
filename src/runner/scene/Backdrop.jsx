// The world's painting (public/assets/backgrounds/worlds/*.webp) as the distant horizon, for worlds 2-7. The paintings are
// portrait scenes with a road down the middle, so only their TOP part (sky, aurora, castles, trees) is used, mirrored across
// the width and faded into the sky above and the fog below. World 1 keeps the 3D mountain massif and never mounts this.
import { useTexture } from '@react-three/drei'
import { useMemo } from 'react'
import { CanvasTexture, ClampToEdgeWrapping, MirroredRepeatWrapping, SRGBColorSpace } from 'three'

const DISTANCE = 520
const HEIGHT = 340 // the lower ~60% of the band is on screen; a taller plane means fewer mirrored repeats (fewer seams)

function fadeTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64
  const g = c.getContext('2d')
  const gr = g.createLinearGradient(0, 0, 0, 64) // top of the canvas = top of the plane
  gr.addColorStop(0, '#000'); gr.addColorStop(0.28, '#fff'); gr.addColorStop(0.8, '#fff'); gr.addColorStop(1, '#000')
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = ClampToEdgeWrapping
  return t
}

export function Backdrop({ url, crop = 0.42 }) {
  const painting = useTexture(url)
  const { map, fade, width, repeat } = useMemo(() => {
    const map = painting.clone()
    map.colorSpace = SRGBColorSpace
    map.wrapS = MirroredRepeatWrapping
    const tile = HEIGHT * (941 / (1672 * crop))
    const width = 1500
    const repeat = width / tile
    map.repeat.set(repeat, crop)
    map.offset.set(0, 1 - crop) // the top `crop` of the image
    map.needsUpdate = true
    return { map, fade: fadeTexture(), width, repeat }
  }, [painting, crop])
  void repeat
  return (
    <mesh position={[0, HEIGHT / 2 - 6, -DISTANCE]} frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[width, HEIGHT]} />
      <meshBasicMaterial map={map} alphaMap={fade} transparent depthWrite={false} fog={false} opacity={0.95} toneMapped={false} />
    </mesh>
  )
}
