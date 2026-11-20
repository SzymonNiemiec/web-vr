import * as THREE from 'three';
import { bakeAmbientField } from './ambient.js';
import { applySurfaceFinish } from './materials.js';

export const finishes = {
  wall: { label: 'Mur', color: '#bd864d', roughness: .94 },
  frame: { label: 'Konstrukcja betonowa', color: '#b2afa6', roughness: .86 },
  floor: { label: 'Strop', color: '#c9c4b9', roughness: .88 },
  roof: { label: 'Dach', color: '#414c54', roughness: .77 },
  base: { label: 'Fundament', color: '#797d76', roughness: .96 }
};

function classify(type, name, predefined) {
  if (type === 'IFCROOF' || predefined === 'ROOF') return 'roof';
  if (type === 'IFCFOOTING' || predefined === 'BASESLAB') return 'base';
  if (type === 'IFCSLAB') return 'floor';
  if (type.startsWith('IFCWALL') && /keramzytobeton/i.test(name)) return 'wall';
  return 'frame';
}

// Revit uses identical RGB values for different building products. Assign each
// triangle by IFC product identity before batching it with its material.
export function prepareModel(model, manager, selection) {
  const geometry = model.geometry;
  const ids = geometry.attributes.expressID;
  const products = new Map();
  const keys = Object.keys(finishes);
  const batches = keys.map(() => []);
  const api = manager.ifcAPI;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const vertex = geometry.index.getX(i);
    const id = ids.getX(vertex);
    if (!products.has(id)) {
      const item = api.GetLine(model.modelID, id);
      const name = item.Name?.value || '';
      const type = api.GetNameFromTypeCode(item.type).toUpperCase();
      const kind = classify(type, name, item.PredefinedType?.value);
      products.set(id, { id, kind, name, type, materialIndex: keys.indexOf(kind) });
    }
    batches[products.get(id).materialIndex].push(vertex, geometry.index.getX(i + 1), geometry.index.getX(i + 2));
  }
  geometry.setAttribute('productId', new THREE.Float32BufferAttribute(ids.array, 1));
  geometry.clearGroups();
  const indices = [];
  for (const [index, batch] of batches.entries()) {
    geometry.addGroup(indices.length, batch.length, index);
    for (const vertex of batch) indices.push(vertex);
  }
  geometry.setIndex(indices);
  const ambient = bakeAmbientField(geometry);
  model.material = keys.map(kind => {
    const { color, roughness } = finishes[kind];
    const material = new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide });
    applySurfaceFinish(material, kind, selection, ambient);
    return material;
  });
  model.castShadow = model.receiveShadow = true;
  return products;
}
