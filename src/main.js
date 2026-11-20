import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { IFCLoader } from 'web-ifc-three';
import { extractRoof } from './roof.js';
import { prepareModel, finishes } from './model.js';
import { createWalkEnvironment } from './environment.js';
import { blockAt } from './materials.js';
import { buildFloors, createWalkControls } from './navigation.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#scene');
const stage = $('.stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e7e9e1');
const camera = new THREE.PerspectiveCamera(45, 1, .04, 220);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minPolarAngle = .08;
controls.maxPolarAngle = Math.PI / 2 - .03;
scene.add(new THREE.HemisphereLight(0xfff8e9, 0xd3d6cd, 1.68));
const sun = new THREE.DirectionalLight(0xfff2db, 2.18);
sun.position.set(-16, 24, 13);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, far: 75 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -.0002;
sun.shadow.normalBias = .012;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xddeaff, .7);
fill.position.set(8, 12, -15);
scene.add(fill);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(180,180), new THREE.ShadowMaterial({ opacity: .16 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -.012;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(42,42,0xb7bfb1,0xb7bfb1);
grid.material.transparent = true;
grid.material.opacity = .29;
grid.position.y = -.02;
scene.add(grid);

const surroundings = createWalkEnvironment(THREE);
scene.add(surroundings);
function showSurroundings(visible) {
  surroundings.visible = visible;
  grid.visible = !visible;
  scene.fog = visible ? new THREE.FogExp2(0xdfe5da,.034) : null;
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const selection = { id: { value: -1 }, block: { value: new THREE.Vector3(0,0,-1) } };
let model, products, floors = [], floorIndex = 0, views = [], roofParts = [];
let transition = null, tourStart = null, activeView = 0;
let roofProgress = 0, roofOpacity = .45, roofTransition = null;
const tourDuration = 48000;
const roofButton = $('#roof-toggle'), roofSlider = $('#roof-progress');
const tourButton = $('#tour'), tourState = $('#tour-state');
const tourPlayback = $('#tour-playback'), tourProgress = $('#tour-progress');
const tourStep = $('#tour-step'), tourTime = $('#tour-time'), tourNext = $('#tour-next');
const walk = createWalkControls(canvas, camera, leaveWalk);
const picker = new THREE.Raycaster();
let pickStart = null;
let redraw = true;

function clearSelection() {
  redraw = true;
  selection.id.value = -1;
  $('#inspector').hidden = true;
}
function inspect(hit) {
  redraw = true;
  if (!hit) { clearSelection(); return; }
  const id = hit.object.geometry.attributes.expressID.getX(hit.face.a);
  const product = products.get(id);
  if (!product) return;
  const point = hit.object.worldToLocal(hit.point.clone());
  const block = product.kind === 'wall' && blockAt(point, hit.face.normal);
  selection.id.value = id;
  selection.block.value.set(block?.column ?? 0, block?.row ?? 0, block ? block.axis : -1);
  $('#selection-kind').textContent = finishes[product.kind].label + ' · IFC #' + id;
  const name = product.name.replace(/:\d+(?::\d+)?$/, '').split(':').slice(-1)[0];
  const frame = /wieniec/i.test(product.name) ? 'Wieniec' : product.type === 'IFCBEAM' ? 'Belka' : 'Słup';
  $('#selection-title').textContent = block ? 'Bloczek ' + (block.axis ? 'Z' : 'X') + ' ' + block.column + ' / ' + block.row
    : (product.kind === 'frame' ? frame + ' ' : '') + name;
  $('#selection-info').textContent = block ? name + '. Pozycja w ilustracyjnym podziale muru (49 × 24 cm).' : product.type + ' · ' + product.name;
  $('#inspector').hidden = false;
}
function pickables() { return [model, ...roofParts.filter(p => p.mesh.visible).map(p => p.mesh)]; }
canvas.addEventListener('pointerdown', e => {
  pickStart = e.isPrimary && e.button === 0 ? [e.clientX,e.clientY] : null;
});
canvas.addEventListener('pointercancel', () => { pickStart = null; });
canvas.addEventListener('pointerup', e => {
  if (!pickStart || !model || Math.hypot(e.clientX-pickStart[0], e.clientY-pickStart[1]) > 5) return;
  pickStart = null;
  const rect = canvas.getBoundingClientRect();
  picker.setFromCamera({ x: (e.clientX-rect.left)/rect.width*2-1, y: 1-(e.clientY-rect.top)/rect.height*2 }, camera);
  inspect(picker.intersectObjects(pickables(), false)[0]);
});
$('#clear-selection').onclick = clearSelection;
controls.addEventListener('start', stopTour);
roofButton.onclick = () => { stopTour(); goToView(roofProgress < .5 ? 1 : 0); };
roofSlider.oninput = () => { stopTour(); setRoof(Number(roofSlider.value) / 100, true); };
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { stopTour(); clearSelection(); goToView(Number(button.dataset.view)); });
tourButton.onclick = () => {
  if (tourStart !== null) { stopTour(); return; }
  clearSelection();
  tourStart = performance.now();
  tourButton.textContent = 'Zatrzymaj pokaz';
  tourButton.setAttribute('aria-pressed', 'true');
  tourState.textContent = 'Pokaz w toku';
  goToView(0);
  updateTourProgress(0);
  tourPlayback.hidden = false;
};
$('#fullscreen').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { tourState.textContent = 'Pełny ekran niedostępny'; }
};
document.addEventListener('fullscreenchange', () => { $('#fullscreen').textContent = document.fullscreenElement ? 'Zamknij pełny ekran' : 'Pełny ekran'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !walk.active) { stopTour(); clearSelection(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && !walk.active) stopTour(); });
$('#retry').onclick = () => location.reload();
$('#walk').onclick = () => walk.active ? leaveWalk() : enterWalk(0);

function enterWalk(index) {
  stopTour();
  clearSelection();
  setRoof(0,true);
  floorIndex = index;
  controls.enabled = false;
  camera.fov = 70;
  camera.updateProjectionMatrix();
  walk.enter(floors[index]);
  showSurroundings(true);
  $('#app').classList.add('walking');
  $('#view-number').textContent = 'Spacer po domu';
  $('#view-title').textContent = levelName(index);
  tourState.textContent = 'Widok z wysokości oczu';
  $('#hint').textContent = 'Przeciągnij obraz, aby się rozejrzeć';
  $('#walk').textContent = '← Wróć do modelu';
  $('#walk-options').hidden = $('.movement').hidden = false;
  $('#orbit-options').hidden = tourButton.hidden = true;
  document.querySelectorAll('#levels button').forEach((button,i) => button.setAttribute('aria-current', String(index === i)));
}
function leaveWalk() {
  walk.leave();
  showSurroundings(false);
  clearSelection();
  controls.enabled = true;
  camera.fov = 45;
  camera.updateProjectionMatrix();
  $('#app').classList.remove('walking');
  $('#walk').innerHTML = 'Wejdź do środka <span aria-hidden="true">→</span>';
  $('#walk-options').hidden = $('.movement').hidden = true;
  $('#orbit-options').hidden = tourButton.hidden = false;
  $('#hint').textContent = 'Przeciągnij, aby obrócić · Przewiń, aby przybliżyć';
  stopTour();
  goToView(0,true);
}
function levelName(index) { return index === 0 ? 'Parter' : 'Piętro ' + index; }

async function load() {
  try {
    const loader = new IFCLoader();
    await loader.ifcManager.setWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.46/');
    $('#status').textContent = 'Wczytuję konstrukcję IFC…';
    const response = await fetch(new URL('../Projekt CZ.ifc', import.meta.url));
    if (!response.ok) throw Error('IFC ' + response.status);
    model = await loader.parse(await response.arrayBuffer());
    products = prepareModel(model, loader.ifcManager, selection);
    scene.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x,-box.min.y,-center.z);
    floors = buildFloors(model, products);
    roofParts = extractRoof(model, products);
    for (const part of roofParts) {
      scene.add(part.mesh);
      part.offset = part.center.clone().setY(0).normalize().multiplyScalar(Math.max(size.x,size.z)*.38);
      part.offset.y = size.y * .55;
    }
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(model.geometry, 32),
      new THREE.LineBasicMaterial({ color:0x4e463a, transparent:true, opacity:.24 }));
    model.add(edges);
    const target = [0,size.y*.45,0], radius = Math.hypot(size.x,size.z)*.5;
    views = [
      {title:'Cały budynek', direction:[1,.33,.88], target, roof:0},
      {title:'Otwarty dach', direction:[1,.94,.83], target:[0,size.y*.72,0], roof:1, zoom:1.24},
      {title:'Układ piętra', direction:[-.22,2,.24], target, roof:1},
      {title:'Druga elewacja', direction:[-1,.48,-1], target, roof:0}
    ];
    for (const view of views) view.radius = radius;
    controls.minDistance = 1.4; controls.maxDistance = radius*7;
    floors.forEach((_,index) => {
      const button = document.createElement('button');
      button.textContent = levelName(index);
      button.onclick = () => enterWalk(index);
      $('#levels').append(button);
    });
    $('#walk').disabled = !floors.length;
    $('#roof-controls').hidden = !roofParts.length;
    roofButton.disabled = roofSlider.disabled = !roofParts.length;
    document.querySelectorAll('[data-view], #tour').forEach(button => button.disabled = false);
    stopTour();
    goToView(0,true);
    $('#intro').classList.add('ready');
    if (floors.length) setupVR(size);
  } catch (error) {
    console.error(error);
    $('#status').textContent = 'Nie udało się wczytać modelu. Sprawdź połączenie.';
    $('#retry').hidden = false;
  }
}

const xrControllers = [];
const xrRay = new THREE.Raycaster();
function teleport(level, x, z) {
  const head = renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
  rig.position.x += x - head.x;
  rig.position.z += z - head.z;
  rig.position.y = level.y;
}
let exterior;
function setupVR(size) {
  exterior = {
    y:0, spawn:{x:size.x/2+3,z:size.z/2+3},
    canStand:(x,z) => Math.max(Math.abs(x),Math.abs(z)) < 22 && (Math.abs(x)>size.x/2+.25 || Math.abs(z)>size.z/2+.25)
  };
  if (!navigator.xr) return;
  navigator.xr.isSessionSupported('immersive-vr').then(supported => {
    if (!supported) return;
    const slot = $('#vr-slot');
    const button = VRButton.createButton(renderer);
    button.title = 'Spust przenosi na wskazaną podłogę. Przycisk chwytu zmienia kondygnację lub przenosi przed budynek.';
    slot.append(button);
    $('#vr-help').hidden = false;
    slot.hidden = false;
  }).catch(() => {});
  for (let i=0; i<2; i++) {
    const controller = renderer.xr.getController(i);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-1)]),
      new THREE.LineBasicMaterial({ color:0x86bba5 }));
    controller.add(line);
    rig.add(controller);
    xrControllers.push({controller,line});
    controller.addEventListener('selectstart', () => {
      const dest = xrDestination(controller);
      if (dest) { floorIndex = floors.indexOf(dest.level); teleport(dest.level,dest.point.x,dest.point.z); }
    });
    controller.addEventListener('squeezestart', () => {
      floorIndex = floorIndex + 1 < floors.length ? floorIndex + 1 : -1;
      const level = floors[floorIndex] ?? exterior;
      teleport(level,level.spawn.x,level.spawn.z);
    });
  }
  renderer.xr.addEventListener('sessionstart', () => {
    if (walk.active) leaveWalk();
    stopTour(); clearSelection(); setRoof(0,true);
    floorIndex = 0;
    showSurroundings(true);
    controls.enabled = false;
    camera.position.set(0,0,0);
    camera.rotation.set(0,0,0);
    const spawn = floors[0].spawn;
    rig.position.set(spawn.x,spawn.y,spawn.z);
    rig.rotation.y = spawn.yaw;
  });
  renderer.xr.addEventListener('sessionend', () => {
    rig.position.set(0,0,0); rig.rotation.set(0,0,0);
    leaveWalk();
  });
}
function xrDestination(controller) {
  xrRay.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  xrRay.ray.direction.set(0,0,-1).transformDirection(controller.matrixWorld);
  xrRay.far = 12;
  const hit = xrRay.intersectObjects([...pickables(),ground],false)[0];
  if (!hit) return null;
  if (hit.object === ground) return exterior.canStand(hit.point.x,hit.point.z) ? {level:exterior,point:hit.point,distance:hit.distance} : null;
  if (hit.face.normal.y < .8) return null;
  const level = floors.find(level => Math.abs(hit.point.y-level.y)<.035 && level.canStand(hit.point.x, hit.point.z));
  if (!level) return null;
  return { level, point:hit.point, distance:hit.distance };
}
function resize() {
  const width = stage.clientWidth, height = stage.clientHeight;
  if (!width || !height || renderer.xr.isPresenting) return;
  const aspect = width / height;
  if (views.length && !walk.active && !transition) {
    const scale = Math.min(1,camera.aspect) / Math.min(1,aspect);
    camera.position.sub(controls.target).multiplyScalar(scale).add(controls.target);
  }
  redraw = true;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(width,height,false);

}
new ResizeObserver(resize).observe(stage);
resize();
let lastFrame = 0;
renderer.setAnimationLoop(now => {
  const dt = Math.min(Math.max(0,(now-lastFrame)/1000),.05);
  lastFrame = now;
  if (renderer.xr.isPresenting) {
    for (const {controller,line} of xrControllers) {
      if (!controller.visible) continue;
      const dest = xrDestination(controller);
      line.scale.z = dest?.distance ?? 1.4;
      line.material.color.setHex(dest ? 0x48d7a8 : 0x81958e);
    }
  } else if (walk.active) walk.update(dt);
  else {
    updatePresentation(now);
    const moved = controls.update();
    if (!redraw && !moved) return;
  }
  renderer.render(scene,camera);
  redraw = false;
});
load();
function viewPosition(view) {
  const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const distance = view.radius / Math.sin(Math.min(vertical, horizontal)) * 1.08 * (view.zoom || 1);
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
  document.querySelector('#view-number').textContent = index === 2 ? 'Widok konstrukcji' : 'Widok zewnętrzny';
  document.querySelector('#view-title').textContent = view.title;

  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-current', String(Number(button.dataset.view) === index)));
}
function stopTour() {
  tourStart = null;
  roofTransition = null;
  transition = null;
  tourButton.textContent = 'Uruchom pokaz';
  tourButton.setAttribute('aria-pressed', 'false');
  tourState.textContent = 'Widok modelu';
  tourPlayback.hidden = true;
}
function updateTourProgress(elapsed) {
  tourProgress.value = 100 * elapsed / tourDuration;
  const seconds = Math.floor(elapsed / 1000);
  const time = `${seconds} / ${tourDuration / 1000} s`;
  if (tourTime.textContent === time) return;
  tourTime.textContent = time;
  tourStep.textContent = `Ujęcie ${activeView + 1} z ${views.length}`;
  const stageEnd = (activeView + 1) * tourDuration / views.length;
  const remaining = Math.ceil((stageEnd - elapsed) / 1000);
  const next = views[activeView + 1];
  tourNext.textContent = next ? `Za ${remaining} s · ${next.title}` : `Koniec pokazu za ${remaining} s`;
}
function updatePresentation(now) {
  if (renderer.xr.isPresenting || walk.active) return;
  updateRoof(now);
  if (tourStart !== null) {
    const elapsed = Math.max(0, now - tourStart);
    if (elapsed >= tourDuration) { stopTour(); goToView(0); }
    else {
      const next = Math.floor(elapsed / (tourDuration / views.length));
      if (next !== activeView) goToView(next);
      updateTourProgress(elapsed);
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
  redraw = true;
  renderer.shadowMap.needsUpdate = true;
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
