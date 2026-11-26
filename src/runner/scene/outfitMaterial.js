// Draws an outfit (outfits.js) by turning the blue parts of Aisha's texture. The default outfit leaves the material alone, so it renders
// exactly as before; a non-default outfit patches the material once (a small shader snippet) and later changes only move a uniform.
const GLSL = `
uniform float uOutfitHue;
vec3 outfitRgb2hsv(vec3 c) { vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 outfitHsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
`
const APPLY = `
#include <map_fragment>
{
  vec3 hsv = outfitRgb2hsv(diffuseColor.rgb);
  float w = smoothstep(0.45, 0.52, hsv.x) * (1.0 - smoothstep(0.70, 0.78, hsv.x)) * smoothstep(0.12, 0.28, hsv.y);
  hsv.x = fract(hsv.x + uOutfitHue * w + 1.0);
  diffuseColor.rgb = outfitHsv2rgb(hsv);
}
`

/** Apply an outfit to every material under `root`. Safe to call again with another outfit (or the default). */
export function applyOutfit(root, outfit) {
  root.traverse((o) => {
    const mats = o.isMesh ? [].concat(o.material) : []
    for (const m of mats) {
      if (!m) continue
      if (!m.userData.outfit) {
        if (outfit.hue === 0) continue // the default look: nothing to patch
        const uniform = { value: 0 }
        m.userData.outfit = uniform
        m.onBeforeCompile = (shader) => {
          shader.uniforms.uOutfitHue = uniform
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${GLSL}`).replace('#include <map_fragment>', APPLY)
        }
        m.customProgramCacheKey = () => 'outfit-hue'
        m.needsUpdate = true
      }
      m.userData.outfit.value = outfit.hue
    }
  })
}
