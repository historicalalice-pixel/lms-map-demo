// libs/main-gallery.js
import * as THREE from "./three.module.js";

/**
 * Main Gallery (100lostspecies-like belts)
 * - 2 belts visible by default, 3rd sits above and appears when user drags upward / scrolls up
 * - infinite loop horizontally (around cylinder) and vertically (belts wrap)
 * - slow auto-drift + wheel + drag with inertia
 */
export function initMainGallery({ mountEl }) {
  // cleanup previous canvas
  mountEl.innerHTML = "";

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setClearColor(0x000000, 0);
  mountEl.appendChild(renderer.domElement);

  // ---------- scene / camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    52,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    8000
  );

  // camera sits slightly inside, looking forward (-Z)
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  // ---------- utils ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (cur, target, lambda, dt) =>
    lerp(cur, target, 1 - Math.exp(-lambda * dt));

  // ---------- interaction state ----------
  const mouse = { x: 0, y: 0 };
  let wheelVelY = 0;     // vertical move velocity
  let wheelVelX = 0;     // horizontal drift velocity (belt rotation)
  let scrollY = 0;       // vertical position (world)
  let scrollX = 0;       // horizontal rotation phase

  // drag-to-pull-up (for hidden 3rd belt feeling)
  let isDown = false;
  let downX = 0;
  let downY = 0;
  let dragVelY = 0;
  let dragVelX = 0;

  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mouse.x = (nx - 0.5) * 2; // -1..1
    mouse.y = (ny - 0.5) * 2; // -1..1
  }
  window.addEventListener("mousemove", onMouseMove);

  function onPointerDown(e) {
    isDown = true;
    downX = e.clientX;
    downY = e.clientY;
    dragVelX = 0;
    dragVelY = 0;
  }
  function onPointerMove(e) {
    if (!isDown) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    downX = e.clientX;
    downY = e.clientY;

    // dragging up (dy negative) reveals upper belt (move "up")
    // Keep it gentle (no jerks)
    dragVelY += (-dy) * 0.012; // vertical
    dragVelX += (dx) * 0.0009; // horizontal
  }
  function onPointerUp() {
    isDown = false;
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      // wheel: mainly vertical travel (like moving inside the sphere)
      const dy = clamp(e.deltaY, -160, 160);
      wheelVelY += dy * 0.010;

      // a tiny horizontal influence so it never feels dead
      wheelVelX += dy * 0.0000025;
    },
    { passive: false }
  );

  // ---------- world ----------
  const world = new THREE.Group();
  scene.add(world);

  // ---------- belts parameters ----------
  // cylinder radius controls “inside-sphere” curvature
  const R = 320;               // closer curvature
  const BELT_SPACING = 110;    // vertical distance between belts

  // how many cards around the ring
  const PER = 64;              // more = denser + no gaps
  const STEP = (Math.PI * 2) / PER;

  // card size (bigger + closer like reference)
  const CARD_W = 150;
  const CARD_H = 96;

  // palette (placeholder colors)
  const palette = [
    0x9fd3ff, 0xb4ffd8, 0xd8b9ff, 0xffd2b0,
    0xbbe3ff, 0xc6ffd8, 0xf0c8ff, 0xffe1b8,
    0xa9bfff, 0xb1ffd0, 0xe6c2ff, 0xffc7a6,
  ];

  function makeCard(i) {
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const mat = new THREE.MeshBasicMaterial({
      color: palette[i % palette.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false, // less popping
    });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  function createBelt(seed = 0) {
    const belt = new THREE.Group();
    world.add(belt);

    const cards = [];
    for (let i = 0; i < PER; i++) {
      const mesh = makeCard(i + seed);

      // subtle random tilt (but NOT spinning fast)
      mesh.rotation.z = (Math.random() - 0.5) * 0.18;

      belt.add(mesh);
      cards.push({
        mesh,
        base: i * STEP,
        wob: Math.random() * 1000,
      });
    }

    return { belt, cards };
  }

  // 3 belts (3rd initially above viewport; we’ll reveal by moving up)
  const belts = [
    { ...createBelt(0),  baseY: -0.5 * BELT_SPACING },
    { ...createBelt(40), baseY:  0.5 * BELT_SPACING },
    { ...createBelt(90), baseY:  1.5 * BELT_SPACING }, // "hidden" above (revealed when scrollY goes negative)
  ];

  // ---------- rendering logic ----------
  function updateBelt(b, t, phaseX) {
    // We look forward along -Z, so "front" is z negative.
    // Offset by -PI/2 to place many cards in front initially.
    const frontOffset = -Math.PI / 2;

    for (const c of b.cards) {
      const a = c.base + phaseX + frontOffset;

      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;

      // gentle wobble, very small
      const wobY = Math.sin(t * 0.65 + c.wob) * 3.0;

      c.mesh.position.set(x, wobY, z);

      // Face inward to center -> we are "inside"
      c.mesh.lookAt(0, 0, 0);

      // Fade/scale based on how much in front (z negative is front)
      // map z: [-R..+R] -> [1..0]
      const front = clamp(((-z) / R + 1) * 0.5, 0, 1);

      const s = lerp(0.92, 1.55, Math.pow(front, 1.15));
      c.mesh.scale.set(s, s, 1);

      // opacity stronger in front so dates/cards visible
      c.mesh.material.opacity = lerp(0.18, 0.92, Math.pow(front, 1.1));
    }
  }

  // ---------- animate ----------
  let last = performance.now();

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    const t = now / 1000;

    // slow auto drift (NOT fast)
    const autoX = 0.12;   // horizontal slow
    const autoY = 0.00;   // keep vertical neutral by default

    wheelVelX += autoX * dt * 0.35;
    wheelVelY += autoY * dt;

    // apply drag impulses
    wheelVelY += dragVelY * dt;
    wheelVelX += dragVelX * dt;

    // decay drag velocities quickly
    dragVelY *= Math.pow(0.15, dt * 60);
    dragVelX *= Math.pow(0.20, dt * 60);

    // inertia / friction (prevents jerk)
    wheelVelY *= Math.pow(0.86, dt * 60);
    wheelVelX *= Math.pow(0.90, dt * 60);

    // integrate
    scrollY += wheelVelY * dt * 60;
    scrollX += wheelVelX * dt * 60;

    // world vertical wrap => infinite belts
    const totalH = BELT_SPACING * belts.length;
    // keep scrollY around 0 for numeric stability
    if (scrollY > totalH) scrollY -= totalH;
    if (scrollY < -totalH) scrollY += totalH;

    // Parallax camera (very gentle, like reference)
    const targetCamX = mouse.x * 16;
    const targetCamY = -mouse.y * 10;
    camera.position.x = damp(camera.position.x, targetCamX, 6.5, dt);
    camera.position.y = damp(camera.position.y, targetCamY, 6.5, dt);
    camera.lookAt(0, 0, -1);

    // Apply vertical travel by shifting belts (not camera) => stable framing
    for (let i = 0; i < belts.length; i++) {
      const b = belts[i];

      // position each belt, then wrap into view window
      let y = b.baseY - scrollY;

      // wrap y into [-totalH/2 .. totalH/2] so belts recycle endlessly
      while (y < -totalH / 2) y += totalH;
      while (y >  totalH / 2) y -= totalH;

      b.belt.position.y = y;

      // slight different horizontal phases per belt (feels layered)
      const beltPhase =
        scrollX * (1 - i * 0.08) + i * 0.65;

      updateBelt(b, t, beltPhase);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------- resize ----------
  function onResize() {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  return {
    destroy() {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
