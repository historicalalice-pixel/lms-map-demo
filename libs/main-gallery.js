// libs/main-gallery.js
import * as THREE from "three";
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl }) {
  if (!mountEl) throw new Error("initMainGallery: mountEl is required");

  // ---------- utils ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth01 = (t) => t * t * (3 - 2 * t); // smoothstep(0..1)
  const smoothstep = (a, b, x) => smooth01(clamp((x - a) / (b - a), 0, 1));
  const wrapPi = (a) => {
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
  };

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // ---------- scene & camera ----------
  const scene = new THREE.Scene();
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000);

  // ✅ camera orbit (fixed)
  const CAM_R = 1250;        // ✅ було 1850: занадто далеко
  const CAM_PHI_BASE = 1.42; // ✅ було 1.10: занадто "зверху"
  const CAM_THETA_BASE = 0.0;
  const AUTO_CAM_ROT = 0.06; // рад/с — дуже повільно

  let camTheta = CAM_THETA_BASE;
  let camPhi = CAM_PHI_BASE;

  camera.position.set(0, 0, CAM_R);
  camera.lookAt(0, 0, 0);

  // ---------- layout ----------
  const CARD_W = 360;
  const CARD_H = 240;

  const R_MID = 1180;
  const R_BOT = 1240;
  const R_TOP = 1300;

  const Y_MID = 0;
  const Y_BOT = -(CARD_H * 0.72);
  const Y_TOP = +(CARD_H * 0.72);

  const COUNT = 36;

  const GAP = 300;
  const STEP_ANGLE = (CARD_W + GAP) / R_MID;

  // ✅ readable сектор (<=4 картки у фокусі)
  const READABLE_DEG = 34; // ✅ було 55: давав "вінок" по краях
  const READABLE_RAD = (READABLE_DEG * Math.PI) / 180;

  const FADE_START = READABLE_RAD * 0.55;
  const FADE_END = READABLE_RAD * 1.15;

  // ---------- texture ----------
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
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");

    g.fillStyle = "rgba(10,12,22,1)";
    g.fillRect(0, 0, w, h);

    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(90,160,255,0.22)");
    grd.addColorStop(1, "rgba(70,240,190,0.14)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    const vg = g.createRadialGradient(w * 0.55, h * 0.55, 80, w * 0.55, h * 0.55, 460);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.62)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    g.strokeStyle = "rgba(232,238,252,0.28)";
    g.lineWidth = 4;
    g.strokeRect(18, 18, w - 36, h - 36);

    const rng = mulberry32(seed);
    g.globalAlpha = 0.95;
    g.fillStyle = `rgba(${Math.floor(120 + rng() * 100)},${Math.floor(140 + rng() * 80)},${Math.floor(170 + rng() * 70)},0.36)`;
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

    g.fillStyle = "rgba(245,245,255,0.96)";
    g.font = "700 38px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(title || "Card", 44, 92);

    g.fillStyle = "rgba(232,238,252,0.78)";
    g.font = "600 22px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(subtitle || "Module", 44, 130);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    if ("SRGBColorSpace" in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------- build rows ----------
  const planeGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

  function createRow({ y, radius, phase, rowKind }) {
    const group = new THREE.Group();
    group.position.y = y;
    group.userData.phase = phase;
    group.userData.rowKind = rowKind;
    scene.add(group);

    for (let i = 0; i < COUNT; i++) {
      const item =
        GALLERY_ITEMS && GALLERY_ITEMS.length
          ? GALLERY_ITEMS[i % GALLERY_ITEMS.length]
          : { title: `Картка ${i + 1}`, subtitle: "Модуль" };

      const tex = makeCardTexture(item.title, item.subtitle, i * 997 + Math.floor((y + 999) * 10));
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false, // ✅ важливо для прозорості
      });

      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.userData = { i, radius, phase, rowKind };
      group.add(mesh);

      // frame overlay
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W + 18, CARD_H + 18),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      frame.position.z = 0.2;
      mesh.add(frame);
    }

    return group;
  }

  const rowMid = createRow({ y: Y_MID, radius: R_MID, phase: 0.35, rowKind: "mid" });
  const rowBot = createRow({ y: Y_BOT, radius: R_BOT, phase: 0.18, rowKind: "bot" });
  const rowTop = createRow({ y: Y_TOP, radius: R_TOP, phase: 0.52, rowKind: "top" });

  // ---------- motion ----------
  let scrollPos = 0;
  let vel = 0;
  let impulse = 0;

  const V_MAX = 0.032;
  const DAMPING = 0.9;
  const IMPULSE_DECAY = 0.18;

  const AUTO_DRIFT = 0;

  // snap
  const SNAP_ENABLE = true;
  const SNAP_WHEN_VEL_LT = 0.004;
  const SNAP_LERP = 0.1;
  const SNAP_KILL_VEL = 0.88;

  const SPEED_MID = 1.0;
  const SPEED_BOT = 0.86;
  const SPEED_TOP = 1.12;

  // mouse control (smooth)
  let mx = 0, my = 0;
  let mxT = 0, myT = 0;
  let thetaT = 0;
  let phiT = 0;

  // ---------- input ----------
  let down = false;
  let lastX = 0;

  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mxT = (nx - 0.5) * 2;
    myT = (0.5 - ny) * 2;
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

  // ---------- snap target ----------
  function nearestIndexAndTarget(phase) {
    const raw = -(scrollPos * SPEED_MID + phase) / STEP_ANGLE;
    const idx = ((Math.round(raw) % COUNT) + COUNT) % COUNT;
    const target = -((idx * STEP_ANGLE + phase) / SPEED_MID);
    return { idx, target };
  }

  function applyStyle(mesh, absAngle, rowKind, isFocused) {
    const tFade = 1 - smoothstep(FADE_START, FADE_END, absAngle);

    let baseOpacity = 1.0;
    let baseScale = 1.0;

    if (rowKind === "mid") {
      baseOpacity = 1.0;
      baseScale = 1.06;
    }
    if (rowKind === "bot") {
      baseOpacity = 0.78;
      baseScale = 0.94;
    }
    if (rowKind === "top") {
      baseOpacity = 0.7;
      baseScale = 0.9;
    }

    const focusBoost = isFocused ? 1.08 : 1.0;

    const minO = 0.0;
    const maxO = baseOpacity;
    mesh.material.opacity = lerp(minO, maxO, tFade);

    const minS = baseScale * 0.86;
    const maxS = baseScale * 1.06 * focusBoost;
    mesh.scale.setScalar(lerp(minS, maxS, tFade));

    mesh.visible = absAngle < FADE_END * 1.05;
  }

  let focusedIndex = 0;

  function updateRow(group, speedMul, rowKind) {
    const phase = group.userData.phase;

    for (const mesh of group.children) {
      if (!mesh.isMesh) continue;

      const i = mesh.userData.i;
      const R = mesh.userData.radius;

      const theta = i * STEP_ANGLE + scrollPos * speedMul + phase;
      const a = wrapPi(theta);
      const absA = Math.abs(a);

      const x = Math.sin(theta) * R;
      const z = Math.cos(theta) * R;

      mesh.position.set(x, 0, z);

      // face camera
      mesh.lookAt(camera.position.x, camera.position.y, camera.position.z);

      // ✅ no accumulation — stable
      mesh.rotation.y = -a * 0.08;

      const isFocused = rowKind === "mid" && i === focusedIndex;
      applyStyle(mesh, absA, rowKind, isFocused);
    }
  }

  // ---------- loop ----------
  let lastT = performance.now();

  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.033);
    lastT = now;

    vel += impulse;
    impulse *= Math.pow(IMPULSE_DECAY, dt * 60);

    vel = clamp(vel, -V_MAX, V_MAX);
    vel *= Math.pow(DAMPING, dt * 60);
    vel += AUTO_DRIFT;

    scrollPos += vel;

    // mouse smoothing
    mx = lerp(mx, mxT, 1 - Math.pow(0.965, dt * 60));
    my = lerp(my, myT, 1 - Math.pow(0.965, dt * 60));

    // auto orbit around Y
    const thetaBase = now * 0.001 * AUTO_CAM_ROT;

    thetaT = mx * 0.35;
    phiT = clamp(CAM_PHI_BASE + -my * 0.18, 1.10, 1.52); // ✅ під нову базу

    const thetaGoal = thetaBase + thetaT;

    camTheta = lerp(camTheta, thetaGoal, 1 - Math.pow(0.92, dt * 60));
    camPhi = lerp(camPhi, phiT, 1 - Math.pow(0.92, dt * 60));

    const sx = Math.sin(camPhi) * Math.sin(camTheta);
    const sy = Math.cos(camPhi);
    const sz = Math.sin(camPhi) * Math.cos(camTheta);

    camera.position.set(sx * CAM_R, sy * CAM_R, sz * CAM_R);
    camera.lookAt(0, 0, 0);

    // snap
    const snap = nearestIndexAndTarget(rowMid.userData.phase);
    focusedIndex = snap.idx;

    if (SNAP_ENABLE && !down && Math.abs(vel) < SNAP_WHEN_VEL_LT) {
      scrollPos = lerp(scrollPos, snap.target, SNAP_LERP);
      vel *= SNAP_KILL_VEL;
    }

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
