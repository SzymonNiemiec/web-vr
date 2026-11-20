import * as THREE from 'three';

const cell = .12;
const clearance = .19;
export const eyeHeight = 1.62;

// Rasterize the top faces of IFC slabs, then remove positions where a standing
// visitor would intersect the actual triangles. Openings survive this operation.
export function buildFloors(model, products) {
  const { geometry } = model;
  const bounds = geometry.boundingBox;
  const origin = bounds.min.clone().add(model.position);
  const cols = Math.ceil((bounds.max.x - bounds.min.x) / cell) + 1;
  const rows = Math.ceil((bounds.max.z - bounds.min.z) / cell) + 1;
  const triangles = [];
  const tops = new Map();
  for (let i = 0; i < geometry.index.count; i += 3) {
    const index = geometry.index.getX(i);
    const id = geometry.attributes.expressID.getX(index);
    const points = [0, 1, 2].map(offset => new THREE.Vector3()
      .fromBufferAttribute(geometry.attributes.position, geometry.index.getX(i + offset)).add(model.position));
    const triangle = new THREE.Triangle(...points);
    const box = new THREE.Box3().setFromPoints(points);
    triangles.push({ triangle, box, kind: products.get(id)?.kind });
    if (products.get(id)?.kind === 'floor') tops.set(id, Math.max(tops.get(id) ?? -Infinity, box.max.y));
  }

  return [...new Set([...tops.values()].map(y => Math.round(y * 100) / 100))].sort((a, b) => a - b).map(y => {
    const supported = new Uint8Array(cols * rows);
    const covered = new Uint8Array(cols * rows);
    const blocked = new Uint8Array(cols * rows);
    const probe = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const { triangle, box, kind } of triangles) {
      const floor = Math.abs(box.min.y - y) < .015 && Math.abs(box.max.y - y) < .015;
      const overhead = (kind === 'roof' || kind === 'floor') && box.max.y > y + 1.82 && box.min.y > y + .1;
      if (!floor && !overhead && (box.max.y < y + .07 || box.min.y > y + 1.82)) continue;
      const left = Math.max(0, Math.floor((box.min.x - clearance - origin.x) / cell));
      const right = Math.min(cols - 1, Math.ceil((box.max.x + clearance - origin.x) / cell));
      const near = Math.max(0, Math.floor((box.min.z - clearance - origin.z) / cell));
      const far = Math.min(rows - 1, Math.ceil((box.max.z + clearance - origin.z) / cell));
      for (let j = near; j <= far; j++) {
        for (let i = left; i <= right; i++) {
          const x = origin.x + i * cell, z = origin.z + j * cell;
          const k = j * cols + i;
          if (overhead) {
            // containsPoint projects onto the triangle plane, so intersect the
            // upward vertical instead for sloping roof faces.
            const a = triangle.a, b = triangle.b, c = triangle.c;
            const ab = (b.x-a.x)*(z-a.z)-(b.z-a.z)*(x-a.x);
            const bc = (c.x-b.x)*(z-b.z)-(c.z-b.z)*(x-b.x);
            const ca = (a.x-c.x)*(z-c.z)-(a.z-c.z)*(x-c.x);
            if ((ab>0 && bc>0 && ca>0) || (ab<0 && bc<0 && ca<0)) covered[k] = 1;
          }
          if (floor) {
            if (triangle.containsPoint(point.set(x, box.max.y, z))) supported[k] = 1;
          } else if (!blocked[k] && box.min.y < y + 1.82) {
            probe.min.set(x - clearance, y + .07, z - clearance);
            probe.max.set(x + clearance, y + 1.82, z + clearance);
            if (probe.intersectsTriangle(triangle)) blocked[k] = 1;
          }
        }
      }
    }
    function canStand(x, z) {
      const i = Math.round((x - origin.x) / cell), j = Math.round((z - origin.z) / cell);
      if (i < 1 || i >= cols - 1 || j < 1 || j >= rows - 1) return false;
      const k = j * cols + i;
      return !blocked[k] && supported[k] && supported[k-1] && supported[k+1] && supported[k-cols] && supported[k+cols];
    }
    // Choose a clear starting point with a long, open sight line into the room.
    let spawn = null, best = -Infinity;
    for (let j = 3; j < rows; j += 5) for (let i = 3; i < cols; i += 5) {
      const x = origin.x + i * cell, z = origin.z + j * cell;
      if (!canStand(x,z)) continue;
      for (let k = 0; k < 12; k++) {
        const yaw = (k + .5) * Math.PI / 6;
        const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
        let distance = 0;
        while (distance < 10 && canStand(x + dx * distance, z + dz * distance)) distance += .24;
        const score = covered[j*cols+i] * 14 + distance - .04 * Math.hypot(x,z);
        if (score > best) { best = score; spawn = { x, y, z, yaw }; }
      }
    }
    return { y, spawn, canStand };
  }).filter(level => level.spawn);
}

export function createWalkControls(canvas, camera, exit) {
  const keys = new Set();
  let floor = null, drag = null, yaw = 0, pitch = 0;
  const directions = ['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  function rotate() { camera.rotation.set(pitch, yaw, 0, 'YXZ'); }
  function reset() { keys.clear(); drag = null; }
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', reset);
  window.addEventListener('keydown', e => {
    if (!floor || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Escape') { exit(); return; }
    if (!directions.includes(e.code)) return;
    e.preventDefault();
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  canvas.addEventListener('pointerdown', e => {
    if (!floor || !e.isPrimary || e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', e => {
    if (!floor || !drag || !e.isPrimary) return;
    yaw -= (e.clientX - drag.x) * .004;
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - drag.y) * .004, -1.3, 1.3);
    drag = { x: e.clientX, y: e.clientY };
    rotate();
  });
  canvas.addEventListener('lostpointercapture', () => { drag = null; });
  document.querySelectorAll('[data-motion]').forEach(button => {
    button.addEventListener('pointerdown', e => {
      button.setPointerCapture(e.pointerId);
      keys.add(button.dataset.motion);
    });
    button.addEventListener('lostpointercapture', () => keys.delete(button.dataset.motion));
  });
  return {
    get active() { return Boolean(floor); },
    enter(level) {
      reset();
      floor = level;
      yaw = level.spawn.yaw;
      pitch = 0;
      camera.position.set(level.spawn.x, level.y + eyeHeight, level.spawn.z);
      rotate();
      canvas.focus({ preventScroll: true });
    },
    leave() { floor = null; reset(); },
    update(dt) {
      if (!floor) return;
      const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      yaw += (Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight'))) * dt * 1.5;
      rotate();
      const speed = 1.65 * dt / Math.max(1, Math.hypot(forward, side));
      const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * speed;
      const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * speed;
      const pos = camera.position;
      if (floor.canStand(pos.x + dx, pos.z)) pos.x += dx;
      if (floor.canStand(pos.x, pos.z + dz)) pos.z += dz;
    }
  };
}
