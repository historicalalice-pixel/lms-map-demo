// libs/main-gallery.js
// 3-row curved "inside sphere" gallery (100lostspecies-inspired):
// - Center row: max ~4 readable cards
// - Bottom row: ~half visible
// - Top row: ~1/3 visible
// - Slow inertial movement (wheel + drag)
// - Camera Z fixed (no zoom-out / fly-away)
// - Endless loop (360° ring)

import * as THREE from "three"; // <-- якщо локально: "./three.module.js"
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl }) {
  if (!mountEl) throw new Error("initMainGallery: mountEl is required");

  // ---------- utils ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setClearColor(0x000000, 0);
  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);

  // Make wheel/drag work nicely
  renderer.domElement.style.touchAction = "none";

  // ---------- scene ----------
  const scene = new THREE.Scene();

  // ---------- camera (NO zoom / fixed Z) ----------
  const camera = new THREE.PerspectiveCamera(
    46, // tuned so center belt shows ~4 readable cards
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    5000
  );

  const CAM_Z = 900; // fixed Z
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  // ---------- light (soft) ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 0.45);
  dir.position.set(300, 600, 500);
  scene.add(dir);

  // ---------- geometry / layout tuning ----------
  // Bigger cards + bigger gap => fewer readable cards in frame.
  const CARD_W = 320;
  const CARD_H = 210;

  // Cylinder radius: smaller => stronger curvature (fewer visible), larger => flatter (more visible)
  const R = 980;

  // Distance between cards along arc (increase to see fewer + more spacing)
  const GAP = 170;

  // Rows: center fully visible; bottom half visible; top third visible.
  const Y_CENTER = 0;
  const Y_BOTTOM = -(CARD_H * 0.70); // ~half visible
  const Y_TOP = +(CARD_H * 0.92);    // ~third visible

  // Count: enough to avoid seeing "ends"
  const COUNT = 34;

  // Convert arc step (world units) to angle step:
  const STEP_ANGLE = (CARD_W + GAP) / R;

  // ---------- card textures (always visible) ----------
  function makeCardTexture(title, subtitle, seed) {
    const w = 768, h = 512;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");

    // base
    g.fillStyle = "rgba(10,14,26,1)";
    g.fillRect(0, 0, w, h);

    // gradient
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(60,140,255,0.20)");
    grd.addColorStop(1, "rgba(50,220,180,0.10)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // vignette
    const vg = g.createRadialGradient(w*0.55, h*0.45, 50, w*0.55, h*0.55, 420);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.65)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    // frame
    g.strokeStyle = "rgba(232,238,252,0.22)";
    g.lineWidth = 4;
    g.strokeRect(18, 18, w - 36, h - 36);

    // pseudo “art blob”
    const rng = mulberry32(seed);
    g.globalAlpha = 0.9;
    g.fillStyle = `rgba(${Math.floor(120+rng()*90)},${Math.floor(140+rng()*70)},${Math.floor(170+rng()*60)},0.35)`;
    g.beginPath();
    g.ellipse(w*0.62, h*0.62, w*(0.18+rng()*0.06), h*(0.16+rng()*0.06), rng()*0.8, 0, Math.PI*2);
    g.fill();
    g.globalAlpha = 1;

    // text
    g.fillStyle = "rgba(243,238,215,0.92)";
    g.font = "600 36px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(title || "Untitled", 44, 88);

    g.fillStyle = "rgba(232,238,252,0.70)";
    g.font = "500 22px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(subtitle || "Module", 44, 124);

    const tex = new THREE.CanvasTexture(c);
    // keep safe across three versions:
    if ("SRGBColorSpace" in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  function mulberry32(a) {
    return function() {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- build rows ----------
  const planeGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

  function createRow(y, phase) {
    const g = new THREE.Group();
    g.position.y = y;
    scene.add(g);

    for (let i = 0; i < COUNT; i++) {
      const item = GALLERY_ITEMS?.[i % (GALLERY_ITEMS?.length || 1)] || {
        title: `Card ${i+1}`,
        subtitle: `Row`,
      };

      const tex = makeCardTexture(item.title, item.subtitle, i * 997 + Math.floor((y + 1000) * 10));
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false, // avoid alpha-z weirdness
      });

      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.userData.i = i;
      mesh.userData.phase = phase;
      g.add(mesh);
    }
    return g;
  }

  const rowTop = createRow(Y_TOP, 1.25);
  const rowMid = createRow(Y_CENTER, 0.35);
  const rowBot = createRow(Y_BOTTOM, 0.85);

  // ---------- motion state ----------
  // We rotate rows by a "scrollAngle". This is endless (wrap not required).
  let scrollAngle = 0;
  let vel = 0;
  let targetImpulse = 0;

  // Parallax (camera x/y only, z fixed)
  let mx = 0, my = 0;
  let camX = 0, camY = 0;

  // Drag
  let down = false;
  let lastX = 0;

  // ---------- input ----------
  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mx = (nx - 0.5) * 2;
    my = (0.5 - ny) * 2; // invert (up is +)
  }

  function onWheel(e) {
    e.preventDefault();
    const d = clamp(e.deltaY, -120, 120);
    // VERY slow wheel -> impulse
    targetImpulse += d * 0.00022;
  }

  function onPointerDown(e) {
    down = true;
    lastX = e.clientX;
  }

  function onPointerMove(e) {
    if (!down) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    // slow drag -> impulse
    targetImpulse += (-dx) * 0.00006;
  }

  function onPointerUp() {
    down = false;
  }

  window.addEventListener("mousemove", onMouseMove, { passive: true });
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });

  // ---------- visibility model: "≤4 readable" ----------
  // We fade/scale aggressively by how "front-facing" the card is.
  // front = 1 when near front (z positive), ~0 when behind.
  function applyCardStyle(mesh, front, isCenterRow) {
    // readable window tuned so center shows about 4
    const start = isCenterRow ? 0.62 : 0.68;
    const end   = isCenterRow ? 0.90 : 0.88;

    // smoothstep-like
    let t = clamp((front - start) / (end - start), 0, 1);
    t = t * t * (3 - 2 * t);

    // opacity never goes to 0 (so "не зникає")
    const minO = isCenterRow ? 0.10 : 0.06;
    const maxO = isCenterRow ? 0.96 : 0.55;
    mesh.material.opacity = lerp(minO, maxO, t);

    // scale hierarchy
    const s0 = isCenterRow ? 0.86 : 0.74;
    const s1 = isCenterRow ? 1.06 : 0.86;
    const s = lerp(s0, s1, t);
    mesh.scale.setScalar(s);
  }

  // ---------- place cards on inner cylinder ----------
  function updateRow(group, speedMul) {
    for (const mesh of group.children) {
      const i = mesh.userData.i || 0;
      const phase = mesh.userData.phase || 0;

      const a = i * STEP_ANGLE + scrollAngle * speedMul + phase;

      const x = Math.sin(a) * R;
      const z = Math.cos(a) * R;      // z>0 is closer to camera
      mesh.position.set(x, 0, z);

      // face camera (billboard-ish)
      mesh.lookAt(camera.position.x, camera.position.y - group.position.y, camera.position.z);

      // frontness (0..1)
      const front = clamp((z / R + 1) * 0.5, 0, 1);

      const isCenterRow = group === rowMid;
      applyCardStyle(mesh, front, isCenterRow);
    }
  }

  // ---------- loop ----------
  let lastT = performance.now();
  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.033);
    lastT = now;

    // input -> velocity (impulse), then decay
    vel += targetImpulse;
    targetImpulse *= Math.pow(0.20, dt * 60); // impulse decays quickly

    // damping (smooth inertial)
    vel *= Math.pow(0.90, dt * 60);
    vel = clamp(vel, -0.03, 0.03);

    // slow auto drift (barely)
    vel += 0.00002;

    scrollAngle += vel;

    // camera parallax (x/y only)
    camX = lerp(camX, mx * 28, 1 - Math.pow(0.86, dt * 60));
    camY = lerp(camY, my * 16, 1 - Math.pow(0.86, dt * 60));
    camera.position.set(camX, camY, CAM_Z);
    camera.lookAt(0, 0, 0);

    // update rows (slightly different speeds => depth)
    updateRow(rowMid, 1.00);
    updateRow(rowBot, 0.94);
    updateRow(rowTop, 1.06);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------- resize ----------
  function onResize() {
    const w = mountEl.clientWidth || window.innerWidth;
    const h = mountEl.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  return {
    destroy() {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
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
