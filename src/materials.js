const MATERIAL_OVERRIDES = [
  {
    match: /dach/i,
    style: { color: '#353b42', roughness: 0.72, metalness: 0.02 }
  },
  {
    match: /keramzytobeton/i,
    style: { color: '#d9d3c7', roughness: 0.9, metalness: 0 }
  },
  {
    match: /beton|concrete/i,
    style: { color: '#aaa59b', roughness: 0.86, metalness: 0 }
  },
  {
    match: /lammi|szary/i,
    style: { color: '#777a78', roughness: 0.8, metalness: 0 }
  }
];

export function getMaterialOverride(name = '') {
  const override = MATERIAL_OVERRIDES.find(({ match }) => match.test(name));
  return override ? { ...override.style } : null;
}

export function getColorOverride(hexColor = '') {
  const normalizedColor = hexColor.toLowerCase();

  if (normalizedColor === '#787878') {
    return { color: '#353b42', roughness: 0.72, metalness: 0.02 };
  }

  if (normalizedColor === '#808080') {
    return { color: '#aaa59b', roughness: 0.86, metalness: 0 };
  }

  if (normalizedColor === '#c0c0c0') {
    return { color: '#d9d3c7', roughness: 0.9, metalness: 0 };
  }

  return null;
}

// The grid is shared by picking and shading, in the IFC mesh's local metres.
const width = .49;
const height = .24;

export function blockAt(point, normal) {
  if (Math.abs(normal.y) > .65) return null;
  const axis = Math.abs(normal.x) > Math.abs(normal.z) ? 1 : 0;
  const row = Math.floor(point.y / height);
  const shift = ((row % 2 + 2) % 2) * .5;
  const column = Math.floor((axis ? point.z : point.x) / width + shift);
  return { axis, row, column };
}

export function applySurfaceFinish(material, kind, selection, ambient) {
  material.customProgramCacheKey = () => 'cz-finish-' + kind;
  material.onBeforeCompile = shader => {
    shader.uniforms.ambientField = { value: ambient.texture };
    shader.uniforms.fieldOrigin = { value: ambient.origin };
    shader.uniforms.fieldSize = { value: ambient.scale };
    shader.uniforms.pickedProduct = selection.id;
    shader.uniforms.pickedBlock = selection.block;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float productId;
        varying vec3 surfacePosition;
        varying vec3 surfaceNormal;
        varying float surfaceId;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        surfacePosition = position;
        surfaceNormal = normal;
        surfaceId = productId;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 surfacePosition;
        varying vec3 surfaceNormal;
        varying float surfaceId;
        uniform highp sampler3D ambientField;
        uniform vec3 fieldOrigin;
        uniform vec3 fieldSize;
        uniform float pickedProduct;
        uniform vec3 pickedBlock;
        float hashCell(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        float surfaceNoise(vec2 coord) {
          vec2 cell = floor(coord), t = fract(coord);
          t = t*t*(3.0-2.0*t);
          return mix(mix(hashCell(cell),hashCell(cell+vec2(1,0)),t.x),
                     mix(hashCell(cell+vec2(0,1)),hashCell(cell+vec2(1,1)),t.x),t.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float selected = 1.0 - step(.35, abs(surfaceId - pickedProduct));
        vec3 n = abs(normalize(surfaceNormal));
        float axis = step(n.z, n.x);
        vec2 uv = vec2(mix(surfacePosition.x, surfacePosition.z, axis), surfacePosition.y);
        ${kind === 'wall' ? `
          vec2 grid = uv / vec2(${width}, ${height});
          grid.x += mod(floor(grid.y), 2.0) * .5;
          vec2 cell = floor(grid);
          vec2 edge = min(fract(grid), 1.0 - fract(grid)) * vec2(${width}, ${height});
          vec2 aa = clamp(fwidth(uv) * .55, .0002, .024);
          vec2 joint = smoothstep(vec2(.006) - aa, vec2(.006) + aa, edge);
          float face = 1.0 - step(.65, n.y);
          float tone = hashCell(cell + mod(surfaceId, 79.0));
          vec3 clay = diffuse * mix(vec3(.77,.72,.69),vec3(1.15,1.12,1.04),tone);
          vec2 bevel = smoothstep(vec2(.006), vec2(.014) + aa, edge);
          clay *= .88 + .12 * bevel.x * bevel.y;
          diffuseColor.rgb = mix(diffuse, mix(vec3(.13,.102,.076),clay,joint.x*joint.y),face);
          if (pickedBlock.z >= 0.0) selected *= face * (1.0-step(.4,distance(vec3(cell,axis),pickedBlock)));
        ` : ''}
        vec2 planar = mix(uv, surfacePosition.xz, n.y);
        float grain = surfaceNoise(planar * 270.0);
        float mottling = surfaceNoise(planar * 9.5) * .55 + surfaceNoise(planar * 27.3) * .45;
        float closeUp = 1.0 - smoothstep(.001, .012, length(fwidth(surfacePosition)));
        diffuseColor.rgb *= 1.0 + (grain - .5) * .20 * closeUp + (mottling - .5) * .10;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.07,.58,.45), selected * .73);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        ${kind === 'roof' ? '' : `
          vec3 fieldUV = (surfacePosition + normalize(surfaceNormal) * .32 - fieldOrigin) / fieldSize;
          float occlusion = texture(ambientField, fieldUV).r;
          reflectedLight.indirectDiffuse *= clamp(1.05 - occlusion * .82, .60, 1.0);
        `}`);
  };
}
