import { useEffect, useMemo } from 'react'
import { Box3, Color, Vector3 } from 'three'
import { useAsset } from '../../assets/index.js'

const HAZE = new Color('#c3d2e2')

/** Aerial perspective for objects beyond the fog range. */
function applyHaze(material, amount) {
  material.fog = false
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHaze = { value: HAZE }
    shader.uniforms.uHazeAmount = { value: amount }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uHaze;\nuniform float uHazeAmount;\nvoid main() {')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, uHazeAmount);')
  }
  material.needsUpdate = true
}

/** The Frost Mountain Massif: the summit landmark on the northern horizon. */
export function MountainMassif({ world }) {
  const { scene } = useAsset('massif')
  const object = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone()
        o.material.envMapIntensity = 0.5
        applyHaze(o.material, 0.32)
        o.castShadow = false
        o.receiveShadow = false
      }
    })
    const scale = 2900
    root.scale.setScalar(scale)
    root.rotation.y = Math.PI / 2
    root.updateMatrixWorld(true)
    const box = new Box3().setFromObject(root)
    const z = -2700
    const groundY = world.height(0, z)
    root.position.set(-box.getCenter(new Vector3()).x, groundY - box.min.y - 260, z - box.getCenter(new Vector3()).z)
    return root
  }, [scene, world])
  useEffect(() => () => object.traverse((o) => { if (o.isMesh) o.material.dispose() }), [object]) // our cloned materials (the model's textures are freed by the asset manager)
  return <primitive object={object} />
}
