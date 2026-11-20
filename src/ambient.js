import * as THREE from 'three';

// Bake short-range ambient occlusion once for the static structure. Both eyes
// then sample the same field without screen-space passes or additional draws.
export function bakeAmbientField(geometry) {
  geometry.computeBoundingBox();
  const step = .22;
  const origin = geometry.boundingBox.min.clone().addScalar(-step * 2);
  const size = geometry.boundingBox.max.clone().sub(origin).divideScalar(step).ceil().addScalar(3);
  const {x:w,y:h,z:d} = size;
  const occupied = new Uint8Array(w*h*d);
  const min = new THREE.Vector3(), max = new THREE.Vector3();
  const tri = new THREE.Triangle(), box = new THREE.Box3();
  const {position} = geometry.attributes;
  for (let i=0; i<geometry.index.count; i+=3) {
    for (const [offset, v] of [tri.a,tri.b,tri.c].entries()) {
      v.fromBufferAttribute(position,geometry.index.getX(i+offset)).sub(origin).divideScalar(step);
    }
    min.copy(tri.a).min(tri.b).min(tri.c).floor();
    max.copy(tri.a).max(tri.b).max(tri.c).floor();
    for (let z=min.z; z<=max.z; z++) for (let y=min.y; y<=max.y; y++) for (let x=min.x; x<=max.x; x++) {
      const index = (z*h+y)*w+x;
      if (occupied[index]) continue;
      box.min.set(x,y,z);
      box.max.set(x+1,y+1,z+1);
      if (box.intersectsTriangle(tri)) occupied[index] = 1;
    }
  }
  const values = new Uint8Array(occupied.length);
  // Sum the attenuated visibility loss on each axis in six linear sweeps.
  for (const [stride,length] of [[1,w],[w,h],[w*h,d]]) {
    for (const sign of [-1,1]) {
      const distances = new Uint8Array(occupied.length);
      for (let j=0; j<occupied.length; j++) {
        const i = sign===1 ? j : occupied.length-1-j;
        const axis = Math.floor(i/stride)%length;
        const boundary = sign===1 ? axis===0 : axis===length-1;
        const distance = occupied[i] ? 0 : boundary ? 32 : Math.min(32,distances[i-sign*stride]+1);
        distances[i] = distance;
        values[i] += Math.round(40*Math.exp(-distance/4.5));
      }
    }
  }
  // Soften the voxel boundary across edges and thin structural members.
  const scratch = new Uint8Array(values.length);
  for (const [stride,length] of [[1,w],[w,h],[w*h,d]]) {
    for (let i=0; i<values.length; i++) {
      const axis = Math.floor(i/stride)%length;
      const before = axis > 0 ? values[i-stride] : values[i];
      const after = axis+1 < length ? values[i+stride] : values[i];
      scratch[i] = Math.round((before + 2*values[i] + after)/4);
    }
    values.set(scratch);
  }
  const texture = new THREE.Data3DTexture(values,w,h,d);
  texture.format = THREE.RedFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, origin, scale:size.multiplyScalar(step) };
}
