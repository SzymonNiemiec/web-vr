import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { IFCLoader } from 'web-ifc-three';
import { extractRoof } from './roof.js';
import { ENVIRONMENT_COLORS, getPathSegments } from './environment.js';
import { getColorOverride, getMaterialOverride } from './materials.js';

const IFC_FILE = new URL('../Projekt CZ.ifc', import.meta.url).href;

// Exterior VR stops are positioned around the loaded model bounds.
const TELEPORT_POINTS = [
  { id: 'entrance', label: 'Widok pierwszy', position: [0, 1.65, 0] },
  { id: 'hall', label: 'Widok drugi', position: [4, 1.65, -2] },
  { id: 'room', label: 'Widok trzeci', position: [-3, 1.65, -4] }
];

const canvas = document.querySelector('#scene');
const status = document.querySelector('#status');

const scene = new THREE.Scene();
scene.background = createSkyTexture();
scene.fog = new THREE.Fog(0xd7dacf, 45, 160);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 1200);
camera.position.set(7, 5, 9);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const vrButton = VRButton.createButton(renderer);
document.querySelector('#vr-slot').appendChild(vrButton);
new MutationObserver(() => {
  if (/NOT SUPPORTED|NOT ALLOWED/.test(vrButton.textContent)) {
    vrButton.hidden = true;
    document.querySelector('#vr-slot').setAttribute('aria-label', 'Tryb VR dostępny na zgodnym urządzeniu');
  }
}).observe(vrButton, { childList: true, characterData: true, subtree: true });

const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.2, 0);

const ambientLight = new THREE.HemisphereLight(0xe5eff5, 0x7c795f, 1.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffdfb2, 3.1);
directionalLight.position.set(-16, 22, 14);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.camera.near = 1;
directionalLight.shadow.camera.far = 80;
directionalLight.shadow.camera.left = -28;
directionalLight.shadow.camera.right = 28;
directionalLight.shadow.camera.top = 28;
directionalLight.shadow.camera.bottom = -28;
directionalLight.shadow.bias = -0.0002;
directionalLight.shadow.normalBias = 0.035;
directionalLight.shadow.radius = 3;
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0x8fb8ff, 0.75);
fillLight.position.set(-10, 7, -12);
scene.add(fillLight);

createEnvironment();

const markerGroup = new THREE.Group();
scene.add(markerGroup);

const raycaster = new THREE.Raycaster();
const controller = renderer.xr.getController(0);
controller.addEventListener('selectstart', onControllerSelect);
rig.add(controller);

const controllerLine = buildControllerLine();
controller.add(controllerLine);

const markerById = new Map();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let views = [];
let transition = null;
let tourStart = null;
let activeView = 0;
let roofParts = [];
let roofProgress = 0;
let roofOpacity = .35;
let roofTransition = null;
let buildingSize = new THREE.Vector3();
const roofButton = document.querySelector('#roof-toggle');
const roofSlider = document.querySelector('#roof-progress');
roofButton.addEventListener('click', () => {
  stopTour();
  const open = roofProgress < .5;
  goToView(open ? 1 : 0);
});
roofSlider.addEventListener('input', () => {
  stopTour();
  setRoof(Number(roofSlider.value) / 100, true);
});
const tourDuration = 48000;
const tourButton = document.querySelector('#tour');
const tourState = document.querySelector('#tour-state');
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = Math.PI / 2 - 0.025;
controls.addEventListener('start', () => { stopTour(); transition = null; });
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { stopTour(); goToView(Number(button.dataset.view)); }));
document.querySelector('#home').addEventListener('click', () => { stopTour(); goToView(0); });
tourButton.addEventListener('click', () => {
  if (tourStart !== null) { stopTour(); return; }
  if (renderer.xr.isPresenting) return;
  tourStart = performance.now();
  tourButton.textContent = 'Zatrzymaj pokaz';
  tourButton.setAttribute('aria-pressed', 'true');
  tourState.textContent = 'Prezentacja w toku';
  goToView(0);
});
document.querySelector('#fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { tourState.textContent = 'Pełny ekran jest niedostępny w tej przeglądarce'; }
});
document.addEventListener('fullscreenchange', () => { document.querySelector('#fullscreen').textContent = document.fullscreenElement ? 'Zamknij pełny ekran' : 'Pełny ekran'; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') stopTour(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopTour(); });
document.querySelector('#retry').addEventListener('click', () => location.reload());
renderer.xr.addEventListener('sessionstart', () => { stopTour(); setRoof(0, true); transition = null; controls.enabled = false; markerGroup.visible = true; camera.position.set(0, 0, 0); rig.position.set(TELEPORT_POINTS[0].position[0], 0, TELEPORT_POINTS[0].position[2]); });
renderer.xr.addEventListener('sessionend', () => { markerGroup.visible = false; rig.position.set(0, 0, 0); controls.enabled = true; goToView(activeView, true); });
loadIfcModel();

renderer.setAnimationLoop(() => {
  updatePresentation(performance.now());
  if (!renderer.xr.isPresenting) controls.update();
  updateControllerTarget();
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (views.length && !renderer.xr.isPresenting) goToView(activeView, true);
});

function setStatus(message) {
  status.textContent = message;
}

function createEnvironment() {
  scene.add(createGrassPlane());

  for (const segment of getPathSegments()) {
    scene.add(createPathSegment(segment));
  }
}

function createSkyTexture() {
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 1;
  skyCanvas.height = 512;
  const context = skyCanvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, skyCanvas.height);

  gradient.addColorStop(0, ENVIRONMENT_COLORS.skyTop);
  gradient.addColorStop(0.52, ENVIRONMENT_COLORS.skyMiddle);
  gradient.addColorStop(1, ENVIRONMENT_COLORS.skyBottom);

  context.fillStyle = gradient;
  context.fillRect(0, 0, skyCanvas.width, skyCanvas.height);

  const texture = new THREE.CanvasTexture(skyCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGrassPlane() {
  const texture = createGrassTexture();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(600, 600);
  texture.colorSpace = THREE.SRGBColorSpace;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({
      color: ENVIRONMENT_COLORS.grassBase,
      map: texture,
      roughness: 0.96,
      metalness: 0
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.018;
  ground.receiveShadow = true;
  return ground;
}

function createGrassTexture() {
  const canvasTexture = document.createElement('canvas');
  canvasTexture.width = 128;
  canvasTexture.height = 128;
  const context = canvasTexture.getContext('2d');

  context.fillStyle = ENVIRONMENT_COLORS.grassBase;
  context.fillRect(0, 0, canvasTexture.width, canvasTexture.height);

  for (let i = 0; i < 900; i += 1) {
    const x = Math.random() * canvasTexture.width;
    const y = Math.random() * canvasTexture.height;
    const length = 3 + Math.random() * 9;
    const alpha = 0.18 + Math.random() * 0.22;

    context.strokeStyle = `rgba(111, 159, 85, ${alpha})`;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.random() * 2 - 1, y - length);
    context.stroke();
  }

  return new THREE.CanvasTexture(canvasTexture);
}

function createPathSegment(segment) {
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(segment.scale[0], segment.scale[1]),
    new THREE.MeshStandardMaterial({
      color: ENVIRONMENT_COLORS.path,
      roughness: 0.92,
      metalness: 0
    })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.fromArray(segment.position);
  path.receiveShadow = true;
  return path;
}

async function loadIfcModel() {
  setStatus('Ładuję model IFC...');

  const loader = new IFCLoader();
  loader.ifcManager.setWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.46/');

  let ifcText;
  try {
    const response = await fetch(IFC_FILE);
    if (!response.ok) throw new Error('IFC unavailable');
    ifcText = await response.text();
  } catch (error) {
    setStatus('Nie udało się wczytać projektu. Spróbuj ponownie.');
    document.querySelector('#retry').hidden = false;
    return;
  }
  loader.load(
    IFC_FILE,
    (model) => {
      model.name = 'Projekt CZ IFC';
      applyModelVisuals(model);
      scene.add(model);
      frameObject(model);
      roofParts = extractRoof(model, ifcText);
      for (const part of roofParts) {
        scene.add(part.mesh);
        const direction = part.center.clone();
        direction.y = 0;
        if (direction.lengthSq() < .01) direction.set(1, 0, 0);
        part.offset = direction.normalize().multiplyScalar(Math.max(buildingSize.x, buildingSize.z) * .42);
        part.offset.y = buildingSize.y * .55;
      }
      roofButton.disabled = roofSlider.disabled = roofParts.length === 0;
      if (!roofParts.length) document.querySelector('#roof-controls').hidden = true;
      setStatus('Projekt gotowy.');
      document.querySelector('#intro').classList.add('ready');
      document.querySelectorAll('[data-view], #tour, #home').forEach(button => button.disabled = false);
    },
    (event) => {
      if (!event.total) return;
      const progress = Math.round((event.loaded / event.total) * 100);
      setStatus(`Ładuję model IFC... ${progress}%`);
    },
    (error) => {
      console.error(error);
      setStatus('Nie udało się wczytać projektu. Sprawdź połączenie i spróbuj ponownie.');
      document.querySelector('#retry').hidden = false;
    }
  );
}

function applyModelVisuals(model) {
  model.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = true;
    child.receiveShadow = true;
    child.material = applyMaterialVisuals(child.material);
  });
}

function applyMaterialVisuals(material) {
  if (Array.isArray(material)) {
    return material.map(applySingleMaterialVisuals);
  }

  return applySingleMaterialVisuals(material);
}

function applySingleMaterialVisuals(material) {
  const visualMaterial = new THREE.MeshStandardMaterial({
    name: material.name,
    color: material.color?.clone() || new THREE.Color(0xd9d3c7),
    map: material.map || null,
    side: material.side,
    transparent: material.transparent,
    opacity: material.opacity,
    depthWrite: material.depthWrite,
    vertexColors: material.vertexColors,
    roughness: 0.82,
    metalness: 0
  });
  const originalColor = `#${visualMaterial.color.getHexString()}`;
  const override = getMaterialOverride(visualMaterial.name) || getColorOverride(originalColor);

  visualMaterial.roughness = override?.roughness ?? 0.82;
  visualMaterial.metalness = override?.metalness ?? 0;

  if (override?.color) {
    visualMaterial.color.set(override.color);
  }

  return visualMaterial;
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  buildingSize.copy(size);
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);

  object.position.set(-center.x, -box.min.y, -center.z);
  const radius = Math.hypot(size.x, size.z) / 2;
  const targetY = size.y * 0.38;
  const target = [0, targetY, 0];
  views = [
    { title: 'Pierwsze spojrzenie', description: 'Jedna bryła. Wiele perspektyw.', direction: [-1, .65, -1], target, roof: 0 },
    { title: 'Otwieramy dom', description: 'Połacie dachu unoszą się, odsłaniając konstrukcję.', direction: [-1, 1.05, -1], target: [0, size.y * .55, 0], roof: 1, zoom: 1.22 },
    { title: 'Zajrzyj do środka', description: 'Układ przestrzeni pod dachem — z lotu ptaka.', direction: [-.32, 1.8, -.42], target, roof: 1, zoom: 1.08 },
    { title: 'Wszystko na swoim miejscu', description: 'Elementy wracają do wspólnej formy.', direction: [1, .65, -1], target, roof: 0 }
  ];
  for (const view of views) view.radius = radius;
  TELEPORT_POINTS[0].position = [size.x / 2 + 3, 1.65, size.z / 2 + 3];
  TELEPORT_POINTS[1].position = [-size.x / 2 - 3, 1.65, size.z / 2 + 3];
  TELEPORT_POINTS[2].position = [-size.x / 2 - 3, 1.65, -size.z / 2 - 3];
  createTeleportMarkers();
  markerGroup.visible = false;
  controls.minDistance = radius * .65;
  controls.maxDistance = radius * 6;
  camera.near = 0.05;
  camera.far = Math.max(maxSize * 12, 200);
  camera.updateProjectionMatrix();
  goToView(0, true);
}

function createTeleportMarkers() {
  const ringGeometry = new THREE.TorusGeometry(0.45, 0.035, 12, 48);
  const discGeometry = new THREE.CircleGeometry(0.38, 48);
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x58a6ff,
    emissive: 0x0a4c9a,
    roughness: 0.45
  });
  const discMaterial = new THREE.MeshBasicMaterial({
    color: 0x58a6ff,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide
  });

  for (const point of TELEPORT_POINTS) {
    const marker = new THREE.Group();
    marker.name = point.label;
    marker.userData.teleportId = point.id;
    marker.position.fromArray(point.position);
    marker.position.y = 0.03;

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.userData.teleportId = point.id;

    const disc = new THREE.Mesh(discGeometry, discMaterial);
    disc.rotation.x = -Math.PI / 2;
    disc.userData.teleportId = point.id;

    marker.add(ring, disc);
    markerGroup.add(marker);
    markerById.set(point.id, marker);
  }
}

function teleportTo(id) {
  const point = TELEPORT_POINTS.find((candidate) => candidate.id === id);
  if (!point) return;

  if (renderer.xr.isPresenting) {
    rig.position.set(point.position[0], 0, point.position[2]);
  } else {
    rig.position.set(0, 0, 0);
    camera.position.set(point.position[0] + 5, point.position[1] + 2.2, point.position[2] + 5);
    controls.target.set(point.position[0], point.position[1], point.position[2]);
    controls.update();
  }
}

function buildControllerLine() {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -6)
  ]);
  const material = new THREE.LineBasicMaterial({ color: 0x58a6ff });
  const line = new THREE.Line(geometry, material);
  line.name = 'Teleport pointer';
  line.scale.z = 1;
  return line;
}

function onControllerSelect() {
  const marker = getControllerIntersection();
  if (marker?.object?.userData?.teleportId) {
    teleportTo(marker.object.userData.teleportId);
  }
}

function updateControllerTarget() {
  if (!renderer.xr.isPresenting) return;

  const hit = getControllerIntersection();
  for (const marker of markerById.values()) {
    marker.scale.setScalar(1);
  }

  if (hit?.object?.userData?.teleportId) {
    const marker = markerById.get(hit.object.userData.teleportId);
    marker?.scale.setScalar(1.25);
  }
}

function getControllerIntersection() {
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  return raycaster.intersectObjects(markerGroup.children, true)[0] || null;
}

function viewPosition(view) {
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const distance = view.radius / Math.sin(Math.min(vertical, horizontal)) * 1.25 * (view.zoom || 1);
  return new THREE.Vector3(...view.direction).normalize().multiplyScalar(distance).add(new THREE.Vector3(...view.target));
}
function goToView(index, immediate = false) {
  if (!views.length || renderer.xr.isPresenting) return;
  activeView = index;
  const view = views[index];
  setRoof(view.roof || 0, immediate);
  const destination = viewPosition(view);
  const target = new THREE.Vector3(...view.target);
  controls.update();
  transition = { start: performance.now(), from: camera.position.clone(), targetFrom: controls.target.clone(), to: destination, target, duration: reducedMotion.matches ? 0 : 2200 };
  if (immediate || reducedMotion.matches) { camera.position.copy(destination); controls.target.copy(target); transition = null; controls.update(); }
  document.querySelector('#view-number').textContent = `0${index + 1} / 04`;
  document.querySelector('#view-title').textContent = view.title;
  document.querySelector('#view-description').textContent = view.description;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-current', String(Number(button.dataset.view) === index)));
}
function stopTour() {
  tourStart = null;
  roofTransition = null;
  transition = null;
  tourButton.textContent = 'Poznaj dom →';
  tourButton.setAttribute('aria-pressed', 'false');
  tourState.textContent = 'Swobodne odkrywanie';
  document.querySelector('#progress').style.width = '0%';
  document.querySelector('.tour-progress').setAttribute('aria-valuenow', '0');
}
function updatePresentation(now) {
  if (renderer.xr.isPresenting) return;
  updateRoof(now);
  if (tourStart !== null) {
    const elapsed = now - tourStart;
    if (elapsed >= tourDuration) { stopTour(); goToView(0); }
    else {
      const next = Math.floor(elapsed / (tourDuration / views.length));
      if (next !== activeView) goToView(next);
      const percent = elapsed / tourDuration * 100;
      document.querySelector('#progress').style.width = `${percent}%`;
      document.querySelector('.tour-progress').setAttribute('aria-valuenow', String(Math.round(percent)));
    }
  }
  if (transition) {
    const t = Math.min((now - transition.start) / transition.duration, 1);
    const ease = t * t * (3 - 2 * t);
    const from = new THREE.Spherical().setFromVector3(transition.from.clone().sub(transition.targetFrom));
    const to = new THREE.Spherical().setFromVector3(transition.to.clone().sub(transition.target));
    let angle = to.theta - from.theta;
    angle = Math.atan2(Math.sin(angle), Math.cos(angle));
    const spherical = new THREE.Spherical(THREE.MathUtils.lerp(from.radius, to.radius, ease), THREE.MathUtils.lerp(from.phi, to.phi, ease), from.theta + angle * ease);
    camera.position.setFromSpherical(spherical).add(new THREE.Vector3().lerpVectors(transition.targetFrom, transition.target, ease));
    controls.target.lerpVectors(transition.targetFrom, transition.target, ease);
    if (t === 1) transition = null;
  }
}

function setRoof(value, immediate = false) {
  if (!roofParts.length) return;
  roofTransition = { from: roofProgress, to: value, fromOpacity: roofOpacity, toOpacity: activeView === 2 ? 0 : .45, start: performance.now(), duration: 3200 };
  if (immediate || reducedMotion.matches) {
    roofProgress = value;
    roofOpacity = roofTransition.toOpacity;
    roofTransition = null;
    applyRoof();
  }
}
function updateRoof(now) {
  if (!roofTransition) return;
  const t = Math.min((now - roofTransition.start) / roofTransition.duration, 1);
  const ease = t * t * t * (t * (t * 6 - 15) + 10);
  roofProgress = THREE.MathUtils.lerp(roofTransition.from, roofTransition.to, ease);
  roofOpacity = THREE.MathUtils.lerp(roofTransition.fromOpacity, roofTransition.toOpacity, ease);
  applyRoof();
  if (t === 1) roofTransition = null;
}
function applyRoof() {
  for (const part of roofParts) {
    part.mesh.position.copy(part.origin).addScaledVector(part.offset, roofProgress);
    for (const material of part.mesh.material) {
      material.transparent = roofProgress > .7;
      material.opacity = 1 - Math.max(0, (roofProgress - .7) / .3) * (1 - roofOpacity);
      material.depthWrite = roofProgress <= .7;
    }
    part.mesh.visible = roofProgress < .995 || roofOpacity > .01;
    part.mesh.castShadow = roofProgress < .7;
  }
  roofSlider.value = Math.round(roofProgress * 100);
  roofButton.textContent = roofProgress > .5 ? 'Zamknij dach' : 'Otwórz dach';
  roofButton.setAttribute('aria-pressed', String(roofProgress > .5));
  document.querySelector('#roof-value').textContent = `${Math.round(roofProgress * 100)}%`;
}
