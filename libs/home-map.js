import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

const mount = document.getElementById("mapMount");
const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalCTA = document.getElementById("modalCTA");

if (!mount) throw new Error("mapMount not found");

// ---------- Scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(mount.clientWidth, mount.clientHeight);
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070a12, 8, 60);

const camera = new THREE.PerspectiveCamera(
  55,
  mount.clientWidth / mount.clientHeight,
  0.1,
  200
);
camera.position.set(0, 2, 18);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dir = new THREE.DirectionalLight(0xffffff, 0.7);
dir.position.set(5, 10, 8);
scene.add(dir);

// ---------- Data ----------
const NODES = [
  { year: 1914, title: "Початок війни", locked: false },
  { year: 1915, title: "Війна стає тотальною", locked: true },
  { year: 1916, title: "Верден / Сомма", locked: true },
  { year: 1917, title: "Революції", locked: false },
  { year: 1918, title: "Кінець війни", locked: true }
];

// ---------- Card Texture ----------
function createTexture(text, year, locked) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "rgba(10,14,26,0.9)";
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = locked
    ? "rgba(120,150,210,0.2)"
    : "rgba(255,210,120,0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);

  ctx.fillStyle = locked
    ? "rgba(190,215,255,0.85)"
    : "rgba(255,230,190,0.95)";

  ctx.font = "bold 64px Inter";
  ctx.fillText(year, 40, 90);

  ctx.font = "28px Inter";
  ctx.fillText(text, 40, 160);

  return new THREE.CanvasTexture(c);
}

// ---------- Create Nodes ----------
const group = new THREE.Group();
scene.add(group);

const geometry = new THREE.PlaneGeometry(6, 3.8);
const meshes = [];

NODES.forEach((n, i) => {
  const tex = createTexture(n.title, n.year, n.locked);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true
  });

  const mesh = new THREE.Mesh(geometry, mat);

  // RANDOM 3D DISTRIBUTION
  mesh.position.set(
    (Math.random() - 0.5) * 16,
    (Math.random() - 0.5) * 6,
    -Math.random() * 20
  );

  mesh.rotation.y = (Math.random() - 0.5) * 0.3;
  mesh.userData = { ...n, hover: 0 };

  group.add(mesh);
  meshes.push(mesh);
});

// ---------- Interaction ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener("pointermove", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
});

renderer.domElement.addEventListener("click", () => {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(meshes);
  if (!hits.length) return;

  const node = hits[0].object.userData;
  modalTitle.textContent = `${node.year} — ${node.title}`;
  modalBody.textContent = node.locked
    ? "Повний доступ відкривається після входу."
    : "Демо-прев’ю доступне.";
  modal.classList.remove("hidden");
});

modalClose?.addEventListener("click", () =>
  modal.classList.add("hidden")
);

// ---------- Animation ----------
let t = 0;

function animate() {
  requestAnimationFrame(animate);
  t += 0.005;

  // Breathing forward motion
  camera.position.z -= 0.01;

  // Subtle drift
  camera.position.x = Math.sin(t) * 0.6;
  camera.position.y = 2 + Math.cos(t * 0.8) * 0.4;

  camera.lookAt(0, 0, -10);

  // Hover effect
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(meshes);

  meshes.forEach((m) => {
    const isHover = hits.length && hits[0].object === m;
    m.userData.hover += (isHover ? 1 : 0 - m.userData.hover) * 0.1;

    const scale = 1 + m.userData.hover * 0.08;
    m.scale.set(scale, scale, 1);
  });

  renderer.render(scene, camera);
}

animate();

// Resize
window.addEventListener("resize", () => {
  camera.aspect = mount.clientWidth / mount.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(mount.clientWidth, mount.clientHeight);
});
