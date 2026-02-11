// libs/main-gallery.js
// Math-only prototype: 100lostspecies-style index-relative layout (10 cards, single row).
// Uses Three.js via importmap: "three".

import * as THREE from "three";

export function initMainGalleryMath({ mountEl }) {
  if (!mountEl) throw new Error("initMainGalleryMath: mountEl is required");

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x0b0f1a, 1);

  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // ---------- scene/camera ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);
  camera.position.set(0, 0, 1100);
  camera.lookAt(0, 0, 0);

  // ---------- constants (100lostspecies-feel tuning) ----------
  const COUNT = 10;

  // spacing between neighbor cards
  const SPACING_X = 420;

  // depth per step from center
  const DEPTH_STEP = 420;

  // scale / opacity falloff
  const SCALE_STEP = 0.13;
  const OPACITY_STEP = 0.32;

  // visible window around center
  const WINDOW = 3; // offsets -3..+3 (7 cards max)

  // easing follow (cinematic)
  const FOLLOW = 0.10;

  // ---------- card factory (simple canvas label) ----------
  function makeLabelTexture(text) {
    const w = 640, h = 420;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");

    // background
    g.fillStyle = "rgba(18,22,35,1)";
    g.fillRect(0, 0, w, h);

    // border
    g.strokeStyle = "rgba(240,240,255,0.20)";
    g.lineWidth = 6;
    g.strokeRect(18, 18, w - 36, h - 36);

    // title
    g.fillStyle = "rgba(240,240,255,0.92)";
    g.font = "700 46px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(text, 44, 98);

    // subtitle
    g.fillStyle = "rgba(240,240,255,0.55)";
    g.font = "500 26px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText("offset-based layout", 44, 140);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------- build 10 cards ----------
  const cardGeo = new THREE.PlaneGeometry(340, 220);
  const cards = [];

  for (let i = 0; i < COUNT; i++) {
    const tex = makeLabelTexture(`Card ${i + 1}`);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(cardGeo, mat);
    mesh.userData.index = i;
    scene.add(mesh);
    cards.push(mesh);
  }

  // ---------- state ----------
  let targetIndex = 0;
  let currentIndex = 0;

  // ---------- controls ----------
  function onWheel(e) {
    const dy = e.deltaY;
    if (Math.abs(dy) < 2) return;
    targetIndex += dy > 0 ? 1 : -1;
    targetIndex = clamp(targetIndex, 0, COUNT - 1);
  }

  let down = false;
  let lastX = 0;
  let dragAcc = 0;

  function onPointerDown(e) {
    down = true;
    lastX = e.clientX;
    dragAcc = 0;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!down) return;

    const dx = e.clientX - lastX;
    lastX = e.clientX;
    dragAcc += dx;

    const STEP_PX = 110;

    while (dragAcc > STEP_PX) {
      targetIndex -= 1; // drag right -> previous
      dragAcc -= STEP_PX;
    }
    while (dragAcc < -STEP_PX) {
      targetIndex += 1; // drag left -> next
      dragAcc += STEP_PX;
    }

    targetIndex = clamp(targetIndex, 0, COUNT - 1);
  }

  function onPointerUp(e) {
    down = false;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
  }

  renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });

  // ---------- core layout (100lostspecies logic) ----------
  function layoutCard(mesh) {
    const i = mesh.userData.index;
    const offset = i - currentIndex;
    const absO = Math.abs(offset);

    // windowing like 100lostspecies
    if (absO > WINDOW + 0.2) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    const isCenter = absO < 0.001;

    // ✅ non-linear depth curve (more cinematic)
    const depthFactor = Math.pow(absO, 1.25);

    const x = offset * SPACING_X;
    const z = -depthFactor * DEPTH_STEP;
    const y = -depthFactor * 28;

    // ✅ center stays "heavy"
    let s = 1 - depthFactor * SCALE_STEP;
    if (isCenter) s = 1.05;

    let op = 1 - depthFactor * OPACITY_STEP;
    if (isCenter) op = 1;

    s = clamp(s, 0.5, 1.05);
    op = clamp(op, 0.04, 1);

    // yaw adds depth feeling at edges
    const yaw = clamp(-offset * 0.12, -0.42, 0.42);

    mesh.position.set(x, y, z);
    mesh.scale.setScalar(s);
    mesh.material.opacity = op;

    mesh.lookAt(camera.position);
    mesh.rotation.y += yaw;
  }

  // ---------- resize ----------
  function onResize() {
    const w = mountEl.clientWidth || window.innerWidth;
    const h = mountEl.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);
  onResize();

  // ---------- loop ----------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;

    // smooth follow
    const t = 1 - Math.pow(1 - FOLLOW, dt * 60);
    currentIndex = lerp(currentIndex, targetIndex, t);

    for (const c of cards) layoutCard(c);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    destroy() {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
