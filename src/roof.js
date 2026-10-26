import * as THREE from 'three';

// IFC exports merge products into one mesh. Partition triangles by expressID,
// keeping the source material groups and vertex attributes intact.
export function extractRoof(model, ifcText) {
  const ids = new Set([...ifcText.matchAll(/^#(\d+)\s*=\s*IFCSLAB\([^\r\n]*\.ROOF\.[^\r\n]*$/gm)].map(match => Number(match[1])));
  // IFCROOF containers may also carry their own geometry in other exports.
  for (const match of ifcText.matchAll(/^#(\d+)\s*=\s*IFCROOF\(/gm)) ids.add(Number(match[1]));
  const source = model.geometry;
  const express = source.getAttribute('expressID');
  if (!express || !source.index || !ids.size) return [];
  const groups = source.groups.length ? source.groups : [{ start: 0, count: source.index.count, materialIndex: 0 }];
  const buckets = new Map();
  const body = [];
  for (const group of groups) {
    const retained = [];
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const triangle = [source.index.getX(i), source.index.getX(i + 1), source.index.getX(i + 2)];
      const id = express.getX(triangle[0]);
      if (ids.has(id)) {
        if (!buckets.has(id)) buckets.set(id, new Map());
        const materials = buckets.get(id);
        if (!materials.has(group.materialIndex)) materials.set(group.materialIndex, []);
        materials.get(group.materialIndex).push(...triangle);
      } else retained.push(...triangle);
    }
    body.push({ materialIndex: group.materialIndex, indices: retained });
  }
  if (!buckets.size) return [];
  function geometryFor(entries) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
    const indices = [];
    for (const entry of entries) {
      geometry.addGroup(indices.length, entry.indices.length, entry.materialIndex);
      for (const index of entry.indices) indices.push(index);
    }
    geometry.setIndex(indices);
    // Shared attributes include the entire building; bounds must use selected indices.
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const index of indices) bounds.expandByPoint(point.fromBufferAttribute(source.attributes.position, index));
    geometry.boundingBox = bounds;
    geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    return geometry;
  }
  const parts = [];
  const materials = Array.isArray(model.material) ? model.material : [model.material];
  for (const [id, bucket] of buckets) {
    const geometry = geometryFor([...bucket].map(([materialIndex, indices]) => ({ materialIndex, indices })));
    const mesh = new THREE.Mesh(geometry, materials.map(material => material.clone()));
    mesh.name = `Roof IFC ${id}`;
    mesh.position.copy(model.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const center = geometry.boundingBox.getCenter(new THREE.Vector3()).add(model.position);
    parts.push({ mesh, origin: model.position.clone(), center });
  }
  model.geometry = geometryFor(body);
  return parts;
}
