// libs/main-gallery.js
import * as THREE from "three";
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl }) {
  if (!mountEl) throw new Error("initMainGallery: mountEl is required");

  // ---------------- utils ----------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth01 = (t) => t * t * (3 - 2 * t);
  const smoothstep = (a, b, x) => smooth01(clamp((x - a) / (b - a), 0, 1));

  function wrapPi(a) {
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
  }

  // exponential smoothing (cinematic)
  function expSmooth(current, target, lambda, dt) {
    const t = 1 - Math.exp(-lambda * dt);
    return current + (target - current) * t;
  }

  // ---------------- renderer ----------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // ---------------- scene & camera ----------------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 5000);

  const CAM_Z = 0;
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, -1);

  scene.fog = new THREE.Fog(0x060812, 1200, 2200);

  // ---------------- layout ----------------
  // ✅ Правка #1: більше “повітря” між картками і рядами (як white ref)
  const CARD_W = 300;
  const CARD_H = 190;

  const R_MID = 980;
  const R_BOT = 1020;
  const R_TOP = 1060;

  const Y_MID = 0;
  const ROW_SEP = CARD_H * 0.78; // було щільно; тепер ближче до white ref
  const Y_BOT = -ROW_SEP;
  const Y_TOP = +ROW_SEP;

  const COUNT = 36;

  const GAP = 260; // ⬅⬅ більше відстань між картками по колу (white ref)
  const STEP_ANGLE = (CARD_W + GAP) / R_MID;

  const PHASE_ALL = 0.35;

  // visibility / fade
  const READABLE_DEG = 42;
  const READABLE_RAD = (READABLE_DEG * Math.PI) / 180;
  const FADE_START = READABLE_RAD * 0.95;
  const FADE_END = READABLE_RAD * 1.85;
  const HARD_CULL = Math.PI * 0.95;

  // ---------------- textures ----------------
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
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

    g.fillStyle = "rgba(9,12,22,1)";
    g.fillRect(0, 0, w, h);

    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(70,140,255,0.18)");
    grd.addColorStop(1, "rgba(70,220,170,0.10)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    const vg = g.createRadialGradient(w * 0.55, h * 0.5, 60, w * 0.55, h * 0.55, 420);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.70)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    g.strokeStyle = "rgba(232,238,252,0.24)";
    g.lineWidth = 4;
    g.strokeRect(18, 18, w - 36, h - 36);

    const rng = mulberry32(seed);
    g.globalAlpha = 0.9;
    g.fillStyle = `rgba(${Math.floor(120 + rng() * 90)},${Math.floor(140 + rng() * 70)},${Math.floor(
      170 + rng() * 60
    )},0.34)`;
    g.beginPath();
    g.ellipse(
      w * 0.62,
      h * 0.63,
      w * (0.18 + rng() * 0.07),
      h * (0.16 + rng() * 0.07),
      rng() * 0.9,
      0,
      Math.PI * 2
    );
    g.fill();
    g.globalAlpha = 1;

    g.fillStyle = "rgba(243,238,215,0.94)";
    g.font = "600 36px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(title || "Card", 44, 88);

    g.fillStyle = "rgba(232,238,252,0.72)";
    g.font = "500 22px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(subtitle || "Module", 44, 124);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    if ("SRGBColorSpace" in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------------- build rows ----------------
  const planeGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

  function createRow({ y, radius, rowKind, phaseOffset }) {
    const group = new THREE.Group();
    group.position.y = y;
    scene.add(group);

    for (let i = 0; i < COUNT; i++) {
      const item =
        GALLERY_ITEMS && GALLERY_ITEMS.length
          ? GALLERY_ITEMS[i % GALLERY_ITEMS.length]
          : { title: `Картка ${i + 1}`, subtitle: "Модуль" };

      const tex = makeCardTexture(item.title, item.subtitle, i * 991 + Math.floor((y + 999) * 10));
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.userData = { i, radius, rowKind, phaseOffset };
      group.add(mesh);

      // рамка (лінії)
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W + 16, CARD_H + 16),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.075,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      frame.position.z = 0.2;
      mesh.add(frame);
    }

    return group;
  }

  // 3 ряди, синхронні по руху, тільки різні фази
  const rowMid = createRow({ y: Y_MID, radius: R_MID, rowKind: "mid", phaseOffset: 0.00 });
  const rowBot = createRow({ y: Y_BOT, radius: R_BOT, rowKind: "bot", phaseOffset: 0.20 });
  const rowTop = createRow({ y: Y_TOP, radius: R_TOP, rowKind: "top", phaseOffset: 0.38 });

  // ---------------- motion ----------------
  let scrollPos = 0;
  let vel = 0;
  let impulse = 0;

  const V_MAX = 0.028;
  const IMPULSE_DECAY = 0.20;
  const DAMPING = 0.92;

  const AUTO_DRIFT = 0; // Variant 1: drift = 0

  // drag
  let down = false;
  let lastX = 0;

  // ✅ Правка #2: cinematic mouse
  let mx = 0, my = 0;
  let mxSm = 0, mySm = 0;
  let camX = 0, camY = 0;

  // snap
  const SNAP_THRESHOLD = 0.18 * V_MAX;
  const SNAP_STRENGTH = 0.030;
  const SNAP_DAMP = 0.90;

  let microY = 0;

  // ---------------- input ----------------
  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mx = (nx - 0.5) * 2;
    my = (0.5 - ny) * 2;
  }

  function onWheel(e) {
    e.preventDefault();
    const d = clamp(e.deltaY, -120, 120);
    impulse += d * 0.00022;
  }

  function onPointerDown(e) {
    down = true;
    lastX = e.clientX;
  }

  function onPointerMove(e) {
    if (!down) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    impulse += -dx * 0.00006;
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

  // ---------------- style ----------------
  function applyStyle(mesh, absAngle, rowKind, isFocused) {
    const tFade = 1 - smoothstep(FADE_START, FADE_END, absAngle);

    let baseOpacity = 1.0;
    let baseScale = 1.0;

    if (rowKind === "mid") {
      baseOpacity = 1.0; baseScale = 1.0;
    } else if (rowKind === "bot") {
      baseOpacity = 0.80; baseScale = 0.92;
    } else {
      baseOpacity = 0.62; baseScale = 0.88;
    }

    const focusBoost = isFocused ? 1.06 : 1.00;
    const focusOpacityBoost = isFocused ? 1.00 : 0.96;

    const minO = rowKind === "mid" ? 0.12 : 0.07;
    const maxO = baseOpacity * focusOpacityBoost;
    mesh.material.opacity = lerp(minO, maxO, tFade);

    const minS = baseScale * 0.80;
    const maxS = baseScale * 1.05 * focusBoost;
    mesh.scale.setScalar(lerp(minS, maxS, tFade));

    mesh.visible = absAngle < HARD_CULL;
  }

  // ---------------- snap ----------------
  function nearestSnapTarget() {
    let bestI = 0;
    let bestAbs = Infinity;

    for (let i = 0; i < COUNT; i++) {
      const theta = i * STEP_ANGLE + scrollPos + PHASE_ALL;
      const a = wrapPi(theta);
      const aa = Math.abs(a);
      if (aa < bestAbs) {
        bestAbs = aa;
        bestI = i;
      }
    }

    const target = -(bestI * STEP_ANGLE + PHASE_ALL);
    return { target, index: bestI };
  }

  let focusedIndex = 0;

  // ---------------- place cards ----------------
  function updateRow(group) {
    for (const mesh of group.children) {
      if (!mesh.isMesh) continue;

      const i = mesh.userData.i;
      const R = mesh.userData.radius;
      const phaseOffset = mesh.userData.phaseOffset || 0;
      const rowKind = mesh.userData.rowKind;

      const theta = i * STEP_ANGLE + scrollPos + PHASE_ALL + phaseOffset;

      const a = wrapPi(theta);
      const absA = Math.abs(a);

      const x = Math.sin(theta) * R;
      const z = -Math.cos(theta) * R;

      mesh.position.set(x, 0, z);

      // face the center
      mesh.lookAt(0, 0, 0);

      // subtle yaw modulation
      mesh.rotation.y += -a * 0.08;

      const isFocused = rowKind === "mid" && i === focusedIndex;
      applyStyle(mesh, absA, rowKind, isFocused);
    }
  }

  // ---------------- resize ----------------
  function onResize() {
    const w = mountEl.clientWidth || window.innerWidth;
    const h = mountEl.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);
  onResize();

  // ---------------- loop ----------------
  let lastT = performance.now();

  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.033);
    lastT = now;

    // integrate impulse
    vel += impulse;
    impulse *= Math.pow(IMPULSE_DECAY, dt * 60);

    vel = clamp(vel, -V_MAX, V_MAX);
    vel *= Math.pow(DAMPING, dt * 60);

    vel += AUTO_DRIFT;

    // snap
    const snap = nearestSnapTarget();
    focusedIndex = snap.index;

    const canSnap = !down && Math.abs(vel) < SNAP_THRESHOLD;
    if (canSnap) {
      const dist = snap.target - scrollPos;
      vel += dist * SNAP_STRENGTH;
      vel *= Math.pow(SNAP_DAMP, dt * 60);
    }

    scrollPos += vel;

    // ✅ cinematic mouse (slow + small)
    mxSm = expSmooth(mxSm, mx, 1.4, dt);  // повільніше
    mySm = expSmooth(mySm, my, 1.4, dt);

    const targetCamX = mxSm * 5.0; // менша амплітуда
    const targetCamY = mySm * 3.0;

    camX = expSmooth(camX, targetCamX, 1.2, dt);
    camY = expSmooth(camY, targetCamY, 1.2, dt);

    microY = expSmooth(microY, clamp(vel * 340, -6, 6), 2.0, dt);

    camera.position.set(camX, camY, CAM_Z);
    camera.lookAt(0, 0, -1);

    rowTop.position.y = Y_TOP + -microY * 0.5;
    rowBot.position.y = Y_BOT + microY * 0.5;
    rowMid.position.y = Y_MID;

    updateRow(rowMid);
    updateRow(rowBot);
    updateRow(rowTop);

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  let rafId = requestAnimationFrame(tick);

  // ---------------- cleanup ----------------
  function disposeRow(group) {
    group.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  return {
    destroy() {
      cancelAnimationFrame(rafId);

      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("wheel", onWheel);

      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      disposeRow(rowMid);
      disposeRow(rowBot);
      disposeRow(rowTop);

      renderer.dispose();

      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    },
  };
}
