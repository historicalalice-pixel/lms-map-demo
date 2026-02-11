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

  // ---------- constants (this is the "model") ----------
  const COUNT = 10;

  // spacing on X between neighbor cards (center-to-center)
  const SPACING_X = 380;

  // depth per step from center (how quickly it goes "into" the screen)
  const DEPTH_STEP = 340;

  // scale falloff per offset
  const SCALE_STEP = 0.10;

  // opacity falloff per offset
  const OPACITY_STEP = 0.26;

  // how many cards to keep alive around center (like their "window")
  const WINDOW = 3; // shows offsets -3..+3 => 7 cards max

  // easing for index following target
  const FOLLOW = 0.10;

  // ---------- card factory (simple canvas label) ----------
  function makeLabelTexture(text) {
    const w = 640, h = 420;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
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
  let targetIndex = 0;   // the "desired" center card
  let currentIndex = 0;  // eased towards targetIndex

  // ---------- controls ----------
  // Wheel: step by +/-1, no inertia physics – just controlled stepping
  function onWheel(e) {
    const dy = e.deltaY;
    if (Math.abs(dy) < 2) return;
    targetIndex += dy > 0 ? 1 : -1;
    targetIndex = clamp(targetIndex, 0, COUNT - 1);
  }

  // Drag: accumulate dx and convert into index steps
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

    // every ~110px drag => step 1 index
    const STEP_PX = 110;
    while (dragAcc > STEP_PX) {
      targetIndex -= 1; // dragging right should move left
      dragAcc -= STEP_PX;
    }
    while (dragAcc < -STEP_PX) {
      targetIndex += 1; // dragging left should move right
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

  // ---------- layout function (THE CORE) ----------
  function layoutCard(mesh) {
    const i = mesh.userData.index;

    // offset relative to animated center (this is the whole trick)
    const offset = i - currentIndex;
    const absO = Math.abs(offset);

    // only keep a small window visible (like 100lostspecies)
    if (absO > WINDOW + 0.2) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    // target transforms from offset
    const x = offset * SPACING_X;

    // go into the screen as you move away from center
    const z = -absO * DEPTH_STEP;

    // slight "arc" feel without cylinder math: drop a bit on Y towards edges
    const y = -absO * 24;

    // scale + opacity falloff
    const s = clamp(1 - absO * SCALE_STEP, 0.6, 1.0);
    const op = clamp(1 - absO * OPACITY_STEP, 0.08, 1.0);

    // tiny yaw so edges feel angled
    const yaw = clamp(-offset * 0.10, -0.35, 0.35);

    mesh.position.set(x, y, z);
    mesh.scale.setScalar(s);
    mesh.material.opacity = op;

    // face camera, then apply a controlled yaw
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

    // smooth follow (no physics, just cinematic easing)
    const t = 1 - Math.pow(1 - FOLLOW, dt * 60);
    currentIndex = lerp(currentIndex, targetIndex, t);

    // layout cards
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
