// libs/main-gallery.js
import * as THREE from "three";
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl }) {
  if (!mountEl) throw new Error("initMainGallery: mountEl is required");

  // -----------------------------
  // Utils
  // -----------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const smooth01 = (t) => t * t * (3 - 2 * t); // smoothstep 0..1
  const smoothstep = (a, b, x) => smooth01(clamp((x - a) / (b - a), 0, 1));

  const wrapPi = (a) => {
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
  };

  // -----------------------------
  // Renderer
  // -----------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);

  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // -----------------------------
  // Scene / Camera (Orbit around Y)
  // -----------------------------
  const scene = new THREE.Scene();
  scene.fog = null;

  // ФОВ трохи вужчий => “менше пласкості”
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 8000);

  // ✅ КАМЕРА ЗОВНІ КІЛЬЦЯ (щоб не було виду “з краю картки”)
  const CAM_R = 2000;
  const CAM_PHI_BASE = 1.35; // більш "по горизонту", не зверху
  const AUTO_CAM_ROT = 0.055; // дуже повільний автоповорот

  // mouse influence (кінематографічно м’яко)
  const MOUSE_THETA = 0.32;
  const MOUSE_PHI = 0.16;

  let camTheta = 0;
  let camPhi = CAM_PHI_BASE;

  // target (центр сцени)
  const target = new THREE.Vector3(0, 0, 0);

  // -----------------------------
  // Layout: 3 Rows, symmetric, mid is main
  // -----------------------------
  const CARD_W = 360;
  const CARD_H = 240;

  // ✅ Кільця компактніші, щоб центр був у кадрі і не “по краях”
  const R_MID = 900;
  const R_BOT = 980;
  const R_TOP = 1050;

  // ✅ 3 ряди симетрично
  const ROW_GAP = CARD_H * 0.78;
  const Y_MID = 0;
  const Y_TOP = +ROW_GAP;
  const Y_BOT = -ROW_GAP;

  const COUNT = 36;

  // Крок по колу: контроль щільності
  // Важливо: не роби великий GAP, інакше "в кадрі 1-2 картки"
  const GAP = 60;
  const STEP_ANGLE = (CARD_W + GAP) / R_MID;

  // ✅ “Видимий сектор” — гарантує ~до 4 карток у рядку
  // Реально контроль йде через FADE_END + visible=false
  const READABLE_DEG = 40; // вузько, але достатньо для ~4
  const READABLE_RAD = (READABLE_DEG * Math.PI) / 180;

  // коли починаємо гасити і коли вимикаємо
  const FADE_START = READABLE_RAD * 0.55;
  const FADE_END = READABLE_RAD * 1.05;

  // -----------------------------
  // Card Texture (simple canvas)
  // -----------------------------
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCardTexture(title, subtitle, seed) {
    const w = 768,
      h = 512;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");

    // base
    g.fillStyle = "rgba(10,12,22,1)";
    g.fillRect(0, 0, w, h);

    // gradient
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(90,160,255,0.20)");
    grd.addColorStop(1, "rgba(70,240,190,0.12)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // vignette
    const vg = g.createRadialGradient(w * 0.55, h * 0.55, 60, w * 0.55, h * 0.55, 520);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.65)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    // frame
    g.strokeStyle = "rgba(232,238,252,0.28)";
    g.lineWidth = 4;
    g.strokeRect(18, 18, w - 36, h - 36);

    // blob
    const rng = mulberry32(seed);
    g.globalAlpha = 0.95;
    g.fillStyle = `rgba(${Math.floor(120 + rng() * 100)},${Math.floor(
      140 + rng() * 80
    )},${Math.floor(170 + rng() * 70)},0.34)`;
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

    // text
    g.fillStyle = "rgba(245,245,255,0.96)";
    g.font = "700 38px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(title || "Картка", 44, 92);

    g.fillStyle = "rgba(232,238,252,0.78)";
    g.font = "600 22px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(subtitle || "Модуль / Епізод", 44, 130);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    if ("SRGBColorSpace" in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // -----------------------------
  // Build rows
  // -----------------------------
  const planeGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

  function createRow({ y, radius, phase, rowKind }) {
    const group = new THREE.Group();
    group.position.y = y;
    group.userData = { radius, phase, rowKind };
    scene.add(group);

    for (let i = 0; i < COUNT; i++) {
      const item =
        GALLERY_ITEMS && GALLERY_ITEMS.length
          ? GALLERY_ITEMS[i % GALLERY_ITEMS.length]
          : { title: `Картка ${i + 1}`, subtitle: "Модуль / Епізод" };

      const tex = makeCardTexture(item.title, item.subtitle, i * 997 + Math.floor((y + 999) * 10));

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        // ✅ критично: не пишемо в depth, інакше прозорість дає “кашу”
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.userData = { i };
      group.add(mesh);

      // subtle frame overlay
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W + 18, CARD_H + 18),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.10,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      frame.position.z = 0.2;
      mesh.add(frame);
    }

    return group;
  }

  // ✅ 3 ряди (симетрія)
  const rowMid = createRow({ y: Y_MID, radius: R_MID, phase: 0.35, rowKind: "mid" });
  const rowTop = createRow({ y: Y_TOP, radius: R_TOP, phase: 0.55, rowKind: "top" });
  const rowBot = createRow({ y: Y_BOT, radius: R_BOT, phase: 0.15, rowKind: "bot" });

  // -----------------------------
  // Motion (scroll + snap)
  // -----------------------------
  let scrollPos = 0;
  let vel = 0;
  let impulse = 0;

  const V_MAX = 0.030;
  const DAMPING = 0.90;
  const IMPULSE_DECAY = 0.18;

  const SPEED_MID = 1.00;
  const SPEED_TOP = 1.12;
  const SPEED_BOT = 0.86;

  // ✅ snap to nearest card (for “calm” feel)
  const SNAP_ENABLE = true;
  const SNAP_WHEN_VEL_LT = 0.0038;
  const SNAP_LERP = 0.12;
  const SNAP_KILL_VEL = 0.86;

  // input
  let down = false;
  let lastX = 0;

  // mouse target
  let mx = 0,
    my = 0;
  let mxT = 0,
    myT = 0;

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

  // -----------------------------
  // Resize
  // -----------------------------
  function onResize() {
    const w = mountEl.clientWidth || window.innerWidth;
    const h = mountEl.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);
  onResize();

  // -----------------------------
  // Visual style logic
  // -----------------------------
  let focusedIndex = 0;

  function nearestIndexAndTarget(phase) {
    // theta = i*STEP + scrollPos*SPEED + phase ; target theta ~ 0
    const raw = -(scrollPos * SPEED_MID + phase) / STEP_ANGLE;
    const idx = ((Math.round(raw) % COUNT) + COUNT) % COUNT;
    const targetScroll = -((idx * STEP_ANGLE + phase) / SPEED_MID);
    return { idx, targetScroll };
  }

  function applyStyle(mesh, absAngle, rowKind, isFocused) {
    // tFade = 1 near center, 0 outside sector
    const tFade = 1 - smoothstep(FADE_START, FADE_END, absAngle);

    // ✅ base row weights (mid is main)
    let baseOpacity = 1.0;
    let baseScale = 1.0;

    if (rowKind === "mid") {
      baseOpacity = 1.0;
      baseScale = 1.08;
    } else if (rowKind === "top") {
      baseOpacity = 0.70;
      baseScale = 0.92;
    } else {
      baseOpacity = 0.78;
      baseScale = 0.96;
    }

    const focusBoost = isFocused ? 1.10 : 1.0;

    // ✅ NO "ghosts"
    mesh.material.opacity = lerp(0.0, baseOpacity, tFade);

    // scale in/out
    const s = lerp(baseScale * 0.88, baseScale * 1.06 * focusBoost, tFade);
    mesh.scale.setScalar(s);

    // ✅ hard cutoff: outside -> invisible
    mesh.visible = absAngle <= FADE_END * 1.03;
  }

  function updateRow(group, speedMul) {
    const { radius, phase, rowKind } = group.userData;

    for (const mesh of group.children) {
      if (!mesh.isMesh) continue;

      const i = mesh.userData.i;

      const theta = i * STEP_ANGLE + scrollPos * speedMul + phase;
      const a = wrapPi(theta);
      const absA = Math.abs(a);

      const x = Math.sin(theta) * radius;
      const z = Math.cos(theta) * radius;

      mesh.position.set(x, 0, z);

      // face camera
      mesh.lookAt(camera.position.x, camera.position.y, camera.position.z);

      // ✅ no accumulation: stable twist
      mesh.rotation.y = -a * 0.08;

      const isFocused = rowKind === "mid" && i === focusedIndex;
      applyStyle(mesh, absA, rowKind, isFocused);
    }
  }

  // -----------------------------
  // Main loop
  // -----------------------------
  let lastT = performance.now();

  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.033);
    lastT = now;

    // inertia
    vel += impulse;
    impulse *= Math.pow(IMPULSE_DECAY, dt * 60);
    vel = clamp(vel, -V_MAX, V_MAX);
    vel *= Math.pow(DAMPING, dt * 60);
    scrollPos += vel;

    // mouse smoothing
    mx = lerp(mx, mxT, 1 - Math.pow(0.965, dt * 60));
    my = lerp(my, myT, 1 - Math.pow(0.965, dt * 60));

    // camera orbit
    const thetaBase = now * 0.001 * AUTO_CAM_ROT;
    const thetaGoal = thetaBase + mx * MOUSE_THETA;

    const phiGoal = clamp(
      CAM_PHI_BASE + -my * MOUSE_PHI,
      1.18, // min
      1.50  // max
    );

    camTheta = lerp(camTheta, thetaGoal, 1 - Math.pow(0.92, dt * 60));
    camPhi = lerp(camPhi, phiGoal, 1 - Math.pow(0.92, dt * 60));

    // spherical -> cartesian
    const sx = Math.sin(camPhi) * Math.sin(camTheta);
    const sy = Math.cos(camPhi);
    const sz = Math.sin(camPhi) * Math.cos(camTheta);

    camera.position.set(sx * CAM_R, sy * CAM_R, sz * CAM_R);
    camera.lookAt(target);

    // snap focus
    const snap = nearestIndexAndTarget(rowMid.userData.phase);
    focusedIndex = snap.idx;

    if (SNAP_ENABLE && !down && Math.abs(vel) < SNAP_WHEN_VEL_LT) {
      scrollPos = lerp(scrollPos, snap.targetScroll, SNAP_LERP);
      vel *= SNAP_KILL_VEL;
    }

    // update rows
    updateRow(rowMid, SPEED_MID);
    updateRow(rowTop, SPEED_TOP);
    updateRow(rowBot, SPEED_BOT);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  // -----------------------------
  // Cleanup
  // -----------------------------
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
