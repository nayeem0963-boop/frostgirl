// Draws the spiral trail (7.2): patches built-in three.js materials so their vertices follow the path from ../bend.js.
// One shared uniform table is updated once per frame by the game loop; every patched material reads it. The straight sim is
// untouched: this only moves where things are *drawn*. Aisha, the sky, the far backdrop, falling snow and her shadow stay out of
// it (wrap them in a group with userData.noBend), because they are placed relative to the camera or the runner.
import { Vector4 } from 'three'
import { ROWS, S_MIN, SPREAD, STEP } from '../bend.js'

const KEY = 'spiral-bend-1'

export function createBend() {
  const rows = Array.from({ length: ROWS }, () => new Vector4())
  const uniforms = { uBend: { value: rows } }
  return {
    uniforms,
    table: new Float32Array(ROWS * 4),
    /** Copy a table from bendTable() into the uniforms. */
    push(table) { for (let i = 0; i < ROWS; i++) rows[i].set(table[i * 4], table[i * 4 + 1], table[i * 4 + 2], table[i * 4 + 3]) },
  }
}

const GLSL_HEAD = `
uniform vec4 uBend[${ROWS}];
vec3 bendWorld(vec3 p) {
  float s = -p.z;
  float f = clamp((s - (${S_MIN.toFixed(1)})) / ${STEP.toFixed(1)}, 0.0, ${(ROWS - 1.001).toFixed(3)});
  int i = int(floor(f));
  vec4 r = mix(uBend[i], uBend[i + 1], f - float(i));
  float over = s - (${S_MIN.toFixed(1)} + f * ${STEP.toFixed(1)}); // beyond the table the trail simply carries on along its last heading
  float xr = clamp(p.x, -${SPREAD.toFixed(1)}, ${SPREAD.toFixed(1)});
  float c = cos(r.w), sn = sin(r.w);
  return vec3(r.x + xr * c + (p.x - xr) + over * sn, p.y + r.y, -(r.z + over * c) + xr * sn);
}
`

const PROJECT = `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
vec4 bentWorld = modelMatrix * mvPosition;
bentWorld.xyz = bendWorld( bentWorld.xyz );
mvPosition = viewMatrix * bentWorld;
gl_Position = projectionMatrix * mvPosition;
`

/** Patch one material (once). Returns true when it was patched now. */
export function patchMaterial(material, bend) {
  if (!material || material.userData.bent || material.isShaderMaterial) return false
  material.userData.bent = true
  const prev = material.onBeforeCompile
  const prevKey = material.customProgramCacheKey
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer)
    if (!shader.vertexShader.includes('#include <project_vertex>')) return
    shader.uniforms.uBend = bend.uniforms.uBend
    shader.vertexShader = GLSL_HEAD + shader.vertexShader.replace('#include <project_vertex>', PROJECT)
  }
  material.customProgramCacheKey = () => `${prevKey ? prevKey.call(material) : ''}|${KEY}`
  material.needsUpdate = true
  return true
}

/** Patch every material under `root` that is not inside a noBend group. Cheap to repeat: patched materials are skipped. */
export function patchScene(root, bend) {
  let n = 0
  const walk = (o) => {
    if (o.userData?.noBend) return
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (patchMaterial(m, bend)) n++
    if (o.material) o.frustumCulled = false // culling uses the unbent bounds: a bent object can sit where its straight self is not
    for (const c of o.children) walk(c)
  }
  walk(root)
  return n
}
