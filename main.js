import * as THREE from 'https://unpkg.com/three@0.160.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.1/examples/jsm/controls/OrbitControls.js';

// Basic setup
const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const hud = document.getElementById('hud');
const blockNameEl = document.getElementById('blockName');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(8, 8, 8);

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x4a6741, 0.6);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(20, 30, 10);
dir.castShadow = true;
dir.shadow.mapSize.set(2048, 2048);
scene.add(dir);

// Orbit controls for menu preview; disabled during gameplay
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(8, 0, 8);
orbit.enableDamping = true;

// World parameters
const BLOCK_SIZE = 1;
const WORLD_SIZE = 32; // 32x32 flat ground
const worldGroup = new THREE.Group();
scene.add(worldGroup);

// Simple block palette
const BlockType = {
  Stone: { name: 'سنگ', color: 0x777777 },
  Grass: { name: 'چمن', color: 0x55aa55 },
  Dirt: { name: 'خاک', color: 0x8b5a2b },
  Sand: { name: 'شن', color: 0xecd9a3 },
};
const palette = [BlockType.Stone, BlockType.Grass, BlockType.Dirt, BlockType.Sand];
let selectedIndex = 0;
blockNameEl.textContent = palette[selectedIndex].name;

// Materials cache by color
const colorToMat = new Map();
function getLambert(color) {
  if (!colorToMat.has(color)) {
    colorToMat.set(color, new THREE.MeshLambertMaterial({ color, transparent: false }));
  }
  return colorToMat.get(color);
}

// Geometry for all blocks
const boxGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);

// Simple world storage: Map<"x,y,z", Mesh>
const blocks = new Map();
function keyFrom(x, y, z) { return `${x},${y},${z}`; }

function addBlock(x, y, z, color) {
  const mesh = new THREE.Mesh(boxGeo, getLambert(color));
  mesh.position.set(
    x * BLOCK_SIZE + BLOCK_SIZE / 2,
    y * BLOCK_SIZE + BLOCK_SIZE / 2,
    z * BLOCK_SIZE + BLOCK_SIZE / 2
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  worldGroup.add(mesh);
  blocks.set(keyFrom(x, y, z), mesh);
}

function removeBlock(x, y, z) {
  const k = keyFrom(x, y, z);
  const mesh = blocks.get(k);
  if (mesh) {
    worldGroup.remove(mesh);
    mesh.geometry.dispose();
    // material shared, do not dispose
    blocks.delete(k);
  }
}

// Generate flat world
function generateFlatWorld() {
  const y = 0;
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      const isEdge = x === 0 || z === 0 || x === WORLD_SIZE - 1 || z === WORLD_SIZE - 1;
      const type = isEdge ? BlockType.Stone : BlockType.Grass;
      addBlock(x, y, z, type.color);
    }
  }
}

// Raycaster for interactions
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
mouse.set(0, 0);

// Player state
const player = {
  yaw: 0,
  pitch: 0,
  velocity: new THREE.Vector3(),
  position: new THREE.Vector3(8, 5, 8),
  onGround: false,
};

// Pointer lock controls (custom minimal)
let pointerLocked = false;
function requestPointerLock() {
  renderer.domElement.requestPointerLock();
}
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  hud.classList.toggle('hidden', !pointerLocked);
});

// Input state
const input = {
  forward: false,
  back: false,
  left: false,
  right: false,
  up: false,
  down: false,
  run: false,
  jump: false,
};

window.addEventListener('keydown', (e) => {
  if (!pointerLocked) return;
  switch (e.code) {
    case 'KeyW': input.forward = true; break;
    case 'KeyS': input.back = true; break;
    case 'KeyA': input.left = true; break;
    case 'KeyD': input.right = true; break;
    case 'KeyE': input.up = true; break; // fly up
    case 'KeyQ': input.down = true; break; // fly down
    case 'ShiftLeft': input.run = true; break;
    case 'Space': input.jump = true; break;
    case 'Digit1': selectedIndex = 0; blockNameEl.textContent = palette[selectedIndex].name; break;
    case 'Digit2': selectedIndex = 1; blockNameEl.textContent = palette[selectedIndex].name; break;
    case 'Digit3': selectedIndex = 2; blockNameEl.textContent = palette[selectedIndex].name; break;
    case 'Digit4': selectedIndex = 3; blockNameEl.textContent = palette[selectedIndex].name; break;
  }
});

window.addEventListener('keyup', (e) => {
  if (!pointerLocked) return;
  switch (e.code) {
    case 'KeyW': input.forward = false; break;
    case 'KeyS': input.back = false; break;
    case 'KeyA': input.left = false; break;
    case 'KeyD': input.right = false; break;
    case 'KeyE': input.up = false; break;
    case 'KeyQ': input.down = false; break;
    case 'ShiftLeft': input.run = false; break;
    case 'Space': input.jump = false; break;
  }
});

// Mouse look
window.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  const sensitivity = 0.0025;
  player.yaw -= e.movementX * sensitivity;
  player.pitch -= e.movementY * sensitivity;
  const maxPitch = Math.PI / 2 - 0.01;
  player.pitch = Math.max(-maxPitch, Math.min(maxPitch, player.pitch));
});

// Click interactions
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (e) => {
  if (!pointerLocked) return;
  if (e.button === 0) {
    breakBlock();
  } else if (e.button === 2) {
    placeBlock();
  }
});

// Helper: world to grid coordinates
function toGrid(v) {
  return {
    x: Math.floor(v.x / BLOCK_SIZE),
    y: Math.floor(v.y / BLOCK_SIZE),
    z: Math.floor(v.z / BLOCK_SIZE),
  };
}

function raycastGrid(maxDistance = 6) {
  // Set ray from camera center
  raycaster.setFromCamera(mouse, camera);
  // Intersect worldGroup children
  const intersects = raycaster.intersectObjects(worldGroup.children, false);
  if (intersects.length === 0) return null;
  const hit = intersects[0];
  if (hit.distance > maxDistance) return null;
  // Compute targeted block and adjacent empty cell for placement
  const hitPoint = hit.point.clone().add(hit.face.normal.multiplyScalar(0.001));
  const normal = hit.face.normal.clone();
  const hitGrid = toGrid(hit.point.clone().sub(normal.multiplyScalar(0.5)));
  const placeGrid = toGrid(hitPoint.clone().add(hit.face.normal.clone().multiplyScalar(0.5)));
  return { hitGrid, placeGrid };
}

function breakBlock() {
  const result = raycastGrid();
  if (!result) return;
  const { x, y, z } = result.hitGrid;
  removeBlock(x, y, z);
}

function placeBlock() {
  const result = raycastGrid();
  if (!result) return;
  const { x, y, z } = result.placeGrid;
  const key = keyFrom(x, y, z);
  if (blocks.has(key)) return;
  addBlock(x, y, z, palette[selectedIndex].color);
}

// Physics-less fly movement with simple damping; optional jump for feel
const upVector = new THREE.Vector3(0, 1, 0);
function updatePlayerControls(dt) {
  const lookDir = new THREE.Vector3(
    -Math.sin(player.yaw) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    -Math.cos(player.yaw) * Math.cos(player.pitch)
  ).normalize();
  const rightDir = new THREE.Vector3().crossVectors(lookDir, upVector).normalize();
  const forwardDir = new THREE.Vector3(lookDir.x, 0, lookDir.z).normalize();

  let speed = input.run ? 8 : 4; // m/s
  const vel = player.velocity;
  vel.set(0, 0, 0);
  if (input.forward) vel.add(forwardDir);
  if (input.back) vel.add(forwardDir.clone().multiplyScalar(-1));
  if (input.left) vel.add(rightDir.clone().multiplyScalar(-1));
  if (input.right) vel.add(rightDir);
  if (input.up) vel.add(upVector);
  if (input.down) vel.add(upVector.clone().multiplyScalar(-1));
  if (vel.lengthSq() > 0) vel.normalize().multiplyScalar(speed);
  player.position.addScaledVector(vel, dt);

  // Position camera
  camera.position.copy(player.position);
  const target = player.position.clone().add(lookDir);
  camera.lookAt(target);
}

// Resize
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

// Game loop
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (pointerLocked) {
    updatePlayerControls(dt);
  } else {
    orbit.update();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Start handling
startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  requestPointerLock();
});

renderer.domElement.addEventListener('click', () => {
  if (!pointerLocked) requestPointerLock();
});

// Initialize world
generateFlatWorld();

// Start loop
requestAnimationFrame(tick);

