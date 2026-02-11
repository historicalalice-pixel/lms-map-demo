// libs/main-gallery.js
// Curved 3-belt gallery (Three.js, no DOM). Uses CDN importmap: import * as THREE from "three".

import * as THREE from "three";
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl }) {
  if (!mountEl) throw new Error("initMainGallery: mountEl is required");

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth01 = (t) => t * t * (3 - 2 * t);
  const smoothstep = (a, b, x) => smooth01(clamp((x - a) / (b - a), 0, 1));
  const wrapPi = (a) => {
    let x = a % (Math.PI * 2);
    if (x > Math.PI) x -= Math.PI * 2;
    if (x < -Math.PI) x += Math.PI * 2;
    return x;
  };

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);

  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // ---------- scene / camera ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x060812, 1200, 2400);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 5000);
  const CAM_Z = 900;
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  // ---------- cards layout ----------
  const CARD_W = 330;
  const CARD_H = 210;

  // Put belts reasonably close so they are visible without guesswork
  const R_MID = 720;
  const R_BOT = 760;
  const R_TOP = 800;

  const Y_MID = 0;
  const Y_BOT = -(CARD_H * 0.70);
  const Y_TOP = +(CARD_H * 0.92);

  const COUNT = 36;
  const GAP = 180;

  const STEP_MID = (CARD_W + GAP) / R_MID;
  const STEP_BOT = (CARD_W + GAP) / R_BOT;
  const STEP_TOP = (CARD_W + GAP) / R_TOP;

  // readable window
  const FADE_START = (36 * Math.PI) / 180;
  const FADE_END = (62 * Math.PI) / 180;
  const HARD_CULL = Math.PI * 0.92;

  // ---------- textures ----------
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCardTexture(title, subtitle, seed) {
    const w = 768, h = 512;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");

    // base
    g.fillStyle = "rgba(9,12,22,1)";
    g.fillRect(0, 0, w, h);

    // gradient
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(70,140,255,0.18)");
    grd.addColorStop(1, "rgba(70,220,170,0.10)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // vignette
    const vg = g.createRadialGradient(w * 0.55, h * 0.52, 60, w * 0.55, h * 0.55, 420);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.70)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    // frame
    g.strokeStyle = "rgba(232,238,252,0.24)";
    g.lineWidth = 4;
    g.strokeRect(18, 18, w - 36, h - 36);

    // blob
    const rng = mulberry32(seed);
    g.globalAlpha = 0.9;
    g.fillStyle = `rgba(${Math.floor(120 + rng() * 90)},${Math.floor(140 + rng() * 70)},${Math.floor(170 + rng() * 60)},0.34)`;
    g.beginPath();
    g.ellipse(w * 0.62, h * 0.63, w * (0.18 + rng() * 0.07), h * (0.16 + rng() * 0.07), rng() * 0.9, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;

    // text
    g.fillStyle = "rgba(243,238,215,0.94)";
    g.font = "600 36px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(title || "Card", 44, 88);

    g.fillStyle = "rgba(232,238,252,0.72)";
    g.font = "500 22px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(subtitle || "Module", 44, 124);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------- build belts ----------
  const planeGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

  function createRow({ y, radius, stepAngle, phase, rowKind }) {
    const group = new THREE.Group();
    group.position.y = y;
    scene.add(group);

    for (let i = 0; i < COUNT; i++) {
      const item = (GALLERY_ITEMS?.length)
        ? GALLERY_ITEMS[i % GALLERY_ITEMS.length]
        : { title: `Картка ${i + 1}`, subtitle: `Модуль` };

      const tex = makeCardTexture(item.title, item.subtitle, i * 991 + Math.floor((y + 999) * 10));

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.userData = { i, radius, stepAngle, phase, rowKind };
      group.add(mesh);

      // subtle frame overlay
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W + 18, CARD_H + 18),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.08,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      frame.position.z = 0.25;
      mesh.add(frame);
    }

    return group;
  }

  const rowMid = createRow({ y: Y_MID, radius: R_MID, stepAngle: STEP_MID, phase: 0.35, rowKind: "mid" });
  const rowBot = createRow({ y: Y_BOT, radius: R_BOT, stepAngle: STEP_BOT, phase: 0.85, rowKind: "bot" });
  const rowTop = createRow({ y: Y_TOP, radius: R_TOP, stepAngle: STEP_TOP, phase: 1.25, rowKind: "top" });

  // ---------- motion ----------
  let scrollPos = 0;
  let vel = 0;
  let impulse = 0;

  const V_MAX = 0.03;
  const IMPULSE_DECAY = 0.20;
  const DAMPING = 0.92;

  const SPEED_MID = 1.0;
  const SPEED_BOT = 0.85;
  const SPEED_TOP = 1.15;

  let down = false;
  let lastX = 0;

  // parallax
  let mx = 0, my = 0;
  let camX = 0, camY = 0;

  // ---------- style ----------
  function applyStyle(mesh, absA, rowKind) {
    if (absA > HARD_CULL) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    let op = 1;
    if (absA > FADE_START) {
      const t = smoothstep(FADE_START, FADE_END, absA);
      op = lerp(1, 0.08, t);
    }

    if (rowKind === "top") op *= 0.78;
    if (rowKind === "bot") op *= 0.84;

    mesh.material.opacity = op;

    const s = lerp(1.0, 0.92, smoothstep(0, FADE_END, absA));
    mesh.scale.setScalar(s);
  }

  function updateRow(group, speedMul, rowKind) {
    for (const mesh of group.children) {
      if (!mesh.isMesh) continue;

      const i = mesh.userData.i;
      const R = mesh.userData.radius;
      const step = mesh.userData.stepAngle;
      const phase = mesh.userData.phase;

      const theta = i * step + scrollPos * speedMul + phase;
      const a = wrapPi(theta);
      const absA = Math.abs(a);

      // ✅ IMPORTANT: put cards in front of camera (camera at +Z looking to 0 => front hemisphere is -Z)
      const x = Math.sin(theta) * R;
      const z = -Math.cos(theta) * R;
      mesh.position.set(x, 0, z);

      mesh.lookAt(camera.position.x, camera.position.y - group.position.y, camera.position.z);
      mesh.rotation.y += (-a) * 0.10;

      applyStyle(mesh, absA, rowKind);
    }
  }

  // ---------- input ----------
  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mx = (nx - 0.5) * 2;
    my = (ny - 0.5) * 2;
  }

  function onWheel(e) {
    const delta = clamp(e.deltaY, -140, 140);
    impulse += (-delta) * 0.00004;
    impulse = clamp(impulse, -V_MAX, V_MAX);
  }

  function onPointerDown(e) {
    down = true;
    lastX = e.clientX;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!down) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;

    impulse += dx * 0.00007;
    impulse = clamp(impulse, -V_MAX, V_MAX);
  }

  function onPointerUp(e) {
    down = false;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
  }

  window.addEventListener("mousemove", onMouseMove, { passive: true });
  renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });

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
  let lastT = performance.now();
  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.033);
    lastT = now;

    vel += impulse;
    impulse *= Math.pow(IMPULSE_DECAY, dt * 60);

    vel = clamp(vel, -V_MAX, V_MAX);
    vel *= Math.pow(DAMPING, dt * 60);

    scrollPos += vel * (dt * 60);

    // camera parallax
    camX = lerp(camX, mx * 22, 0.06);
    camY = lerp(camY, -my * 16, 0.06);
    camera.position.x = camX;
    camera.position.y = camY;
    camera.lookAt(0, 0, 0);

    updateRow(rowMid, SPEED_MID, "mid");
    updateRow(rowBot, SPEED_BOT, "bot");
    updateRow(rowTop, SPEED_TOP, "top");

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

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
