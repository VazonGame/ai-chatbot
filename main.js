import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  AmbientLight,
  DirectionalLight,
  BoxGeometry,
  MeshLambertMaterial,
  Mesh,
  Group,
  Raycaster,
  Vector2,
  Vector3,
  Matrix3,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  GridHelper
} from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';

// ---------- Basic setup ----------
const container = document.getElementById('app');

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0xbfd1e5);

const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(12, 14, 18);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.update();

// disable orbiting during RMB place action
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 2) controls.enabled = false;
}, true);
window.addEventListener('pointerup', (e) => {
  if (e.button === 2) controls.enabled = true;
}, true);
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// Lights
scene.add(new AmbientLight(0xffffff, 0.6));
const dirLight = new DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = false;
scene.add(dirLight);

// Helpers
const grid = new GridHelper(80, 80, 0x000000, 0x000000);
grid.material.opacity = 0.08;
grid.material.transparent = true;
grid.position.y = -0.5;
scene.add(grid);

// ---------- Voxel world ----------
const STORAGE_KEY = 'voxel-world-v1';
const blockGeometry = new BoxGeometry(1, 1, 1);
const MATERIALS = {
  grass: new MeshLambertMaterial({ color: 0x7cc75b }),
  dirt: new MeshLambertMaterial({ color: 0x8b5a2b }),
  stone: new MeshLambertMaterial({ color: 0x888c8d })
};
const BLOCK_TYPES = ['grass', 'dirt', 'stone'];
let currentBlockType = 'grass';

const worldGroup = new Group();
scene.add(worldGroup);

// key: "x,y,z" -> { type, mesh }
const blocks = new Map();

function keyFromXYZ(x, y, z) {
  return `${x}|${y}|${z}`;
}

function addBlock(x, y, z, type) {
  x = Math.round(x); y = Math.round(y); z = Math.round(z);
  const key = keyFromXYZ(x, y, z);
  if (blocks.has(key)) return;
  const mesh = new Mesh(blockGeometry, MATERIALS[type] || MATERIALS.grass);
  mesh.position.set(x, y, z);
  mesh.userData = { type, key };
  worldGroup.add(mesh);
  blocks.set(key, { type, mesh });
}

function removeBlock(x, y, z) {
  x = Math.round(x); y = Math.round(y); z = Math.round(z);
  const key = keyFromXYZ(x, y, z);
  const data = blocks.get(key);
  if (!data) return;
  worldGroup.remove(data.mesh);
  data.mesh.geometry.dispose?.(); // geometry shared; safe even if called often in this simple demo
  blocks.delete(key);
}

function clearWorld() {
  for (const { mesh } of blocks.values()) {
    worldGroup.remove(mesh);
  }
  blocks.clear();
}

function generateGround(size = 20) {
  const half = Math.floor(size / 2);
  for (let x = -half; x < half; x++) {
    for (let z = -half; z < half; z++) {
      addBlock(x, 0, z, 'grass');
    }
  }
}

// ---------- Raycasting & interactions ----------
const raycaster = new Raycaster();
const mouse = new Vector2();

const highlight = (() => {
  const edges = new EdgesGeometry(blockGeometry);
  const line = new LineSegments(edges, new LineBasicMaterial({ color: 0xffff00 }));
  line.visible = false;
  scene.add(line);
  return line;
})();

function updateMouseFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function intersectBlocks() {
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(worldGroup.children, false);
  return intersects[0] || null;
}

function faceToWorldDir(face, object) {
  const normalMatrix = new Matrix3().getNormalMatrix(object.matrixWorld);
  const worldNormal = face.normal.clone().applyMatrix3(normalMatrix).normalize();
  return new Vector3(
    Math.round(worldNormal.x),
    Math.round(worldNormal.y),
    Math.round(worldNormal.z)
  );
}

function onPointerMove(event) {
  updateMouseFromEvent(event);
  const hit = intersectBlocks();
  if (hit) {
    highlight.visible = true;
    highlight.position.copy(hit.object.position);
  } else {
    highlight.visible = false;
  }
}

function onPointerDown(event) {
  updateMouseFromEvent(event);
  const hit = intersectBlocks();
  if (!hit) return;
  if (event.button === 0) {
    // remove
    const p = hit.object.position;
    removeBlock(p.x, p.y, p.z);
    saveWorldThrottled();
  } else if (event.button === 2) {
    // place adjacent
    if (!hit.face) return;
    const dir = faceToWorldDir(hit.face, hit.object);
    const base = hit.object.position;
    const nx = base.x + dir.x;
    const ny = base.y + dir.y;
    const nz = base.z + dir.z;
    addBlock(nx, ny, nz, currentBlockType);
    saveWorldThrottled();
  }
}

renderer.domElement.addEventListener('pointermove', onPointerMove);
renderer.domElement.addEventListener('pointerdown', onPointerDown);

// ---------- UI: hotbar & keys ----------
const hotbar = document.getElementById('hotbar');
const toast = document.getElementById('toast');

function setCurrentType(type) {
  if (!BLOCK_TYPES.includes(type)) return;
  currentBlockType = type;
  for (const btn of hotbar.querySelectorAll('.slot')) {
    const selected = btn.dataset.type === type;
    btn.classList.toggle('selected', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  }
  showToast(`بلوک: ${type === 'grass' ? 'چمن' : type === 'dirt' ? 'خاک' : 'سنگ'}`);
}

hotbar.addEventListener('click', (e) => {
  const btn = e.target.closest('button.slot');
  if (!btn) return;
  setCurrentType(btn.dataset.type);
});

document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
  if (e.key === '1' || e.key === '١' || e.key === '۱') setCurrentType('grass');
  if (e.key === '2' || e.key === '٢' || e.key === '۲') setCurrentType('dirt');
  if (e.key === '3' || e.key === '٣' || e.key === '۳') setCurrentType('stone');
  if (e.key === 's' || e.key === 'S') { saveWorld(); showToast('ذخیره شد'); }
  if (e.key === 'l' || e.key === 'L') { loadWorld(true); showToast('بارگذاری شد'); }
  if (e.key === 'r' || e.key === 'R') { resetWorld(); showToast('بازنشانی شد'); }
});

function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 900);
}

// ---------- Persistence ----------
function saveWorld() {
  const arr = [];
  for (const [key, { type, mesh }] of blocks.entries()) {
    const { x, y, z } = mesh.position;
    arr.push({ x, y, z, type });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

const saveWorldThrottled = throttle(saveWorld, 150);

function loadWorld(fromStorageOnly = false) {
  clearWorld();
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const arr = JSON.parse(saved);
      for (const b of arr) addBlock(b.x, b.y, b.z, b.type);
    } catch (err) {
      console.warn('Failed to parse saved world', err);
    }
  } else if (!fromStorageOnly) {
    generateGround(24);
  }
}

function resetWorld() {
  clearWorld();
  generateGround(24);
  localStorage.removeItem(STORAGE_KEY);
}

// ---------- Utils ----------
function throttle(fn, wait) {
  let last = 0, t;
  return function(...args) {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      fn.apply(this, args);
    } else {
      clearTimeout(t);
      t = setTimeout(() => {
        last = Date.now();
        fn.apply(this, args);
      }, remaining);
    }
  };
}

// ---------- Resize & render loop ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// ---------- Boot ----------
setCurrentType('grass');
loadWorld();

