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
  const smooth01 = (t) => t * t * (3 - 2 * t);
  const smoothstep = (a, b, x) => smooth01(clamp((x - a) / (b - a), 0, 1));

  const wrapPi = (a) => {
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
  };

  // signed shortest delta between indices on ring
  const ringDelta = (i, focus, count) => {
    let d = i - focus;
    d = ((d % count) + count) % count; // 0..count-1
    if (d > count / 2) d -= count; // -count/2..count/2
    return d;
  };

  // -----------------------------
  // Renderer
  // -----------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  // трохи допомагає з прозорістю
  renderer.sortObjects = true;

  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // -----------------------------
  // Scene / Camera
  // -----------------------------
  const scene = new THREE.Scene();
  scene.fog = null;

  // Тримаємо “кінематографічний” фокус, не супер-широкий
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 8000);

  // Orbit навколо Y
  const CAM_R = 2050;        // камера ДАЛЕКО від кільця => не “в площині карток”
  const CAM_PHI_BASE = 1.33; // майже по горизонту
  const AUTO_CAM_ROT = 0.055;

  const MOUSE_THETA = 0.30;
  const MOUSE_PHI = 0.14;

  let camTheta = 0;
  let camPhi = CAM_PHI_BASE;

  // -----------------------------
  // Layout (3 rows) — згідно ТЗ
  // -----------------------------
  const CARD_W = 360;
  const CARD_H = 240;

  // ✅ компактніше кільце, щоб центр був у кадрі
  const R_MID = 980;
  const R_TOP = 1080;
  const R_BOT = 1040;

  // ✅ 3 ряди, симетрично
  const ROW_GAP = CARD_H * 0.80;
  const Y_MID = 0;
  const Y_TOP = +ROW_GAP;
  const Y_BOT = -ROW_GAP;

  const COUNT = 36;

  // Крок між картками по колу.
  // Важливо: ми НЕ намагаємось “показати всі”, ми показуємо 4.
  const GAP = 110;
  const STEP_ANGLE = (CARD_W + GAP) / R_MID;

  // ✅ В рядку максимум 4 картки (жорстко)
  // Беремо 4 індекси навколо фокуса:
  // [-2, -1, 0, +1] (симетрично відносно центру)
  const VISIBLE_DELTAS = new Set([-2, -1, 0, 1]);

  // Де починаємо “гасити” на краю сектора (для м’якості)
  const EDGE_START = STEP_ANGLE * 1.25; // приблизно після 2-ї картки від центру
  const EDGE_END = STEP_ANGLE * 2.2;

  // -----------------------------
  // Card texture
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
    const w = 768, h = 512;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");

    g.fillStyle = "rgba(10,12,22,1)";
    g.fillRect(0, 0, w, h);

    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(90,160,255,0.20)");
    grd.addColorStop(1, "rgba(70,240,190,0.12)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    const vg = g.createRadialGradient(w * 0.55, h * 0.55, 70, w * 0.55, h * 0.55, 520);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.66)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    g.strokeStyle = "rgba(232,238,252,0.28)";
    g.lineWidth = 4;
    g.strokeRect(18, 18, w - 36, h - 36);

    const rng = mulberry32(seed);
    g.globalAlpha = 0.95;
    g.fillStyle = `rgba(${Math.floor(120 + rng() * 100)},${Math.floor(140 + rng() * 80)},${Math.floor(170 + rng() * 70)},0.34)`;
    g.beginPath();
    g.ellipse(
      w * 0.62,
      h * 0.63,
      w * (0.18 + rng() * 0.07),
      h * (0.16 + rng() * 0.07),
      rng() * 0.9,
      0, Math.PI * 2
    );
    g.fill();
    g.globalAlpha = 1;

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
  const planeGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);

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
        depthWrite: false, // ✅ критично для прозорості
        depthTest: true,
      });

      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.userData = { i };
      group.add(mesh);

      // легкий frame як окремий mesh
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W + 18, CARD_H + 18),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.10,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: true,
        })
      );
      frame.position.z = 0.25;
      mesh.add(frame);
    }

    return group;
  }

  const rowMid = createRow({ y: Y_MID, radius: R_MID, phase: 0.35, rowKind: "mid" });
  const rowTop = createRow({ y: Y_TOP, radius: R_TOP, phase: 0.55, rowKind: "top" });
  const rowBot = createRow({ y: Y_BOT, radius: R_BOT, phase: 0.15, rowKind: "bot" });

  // -----------------------------
  // Motion: scroll + snap
  // -----------------------------
  let scrollAngle = 0; // ми крутимо кільце кутом
  let vel = 0;
  let impulse = 0;

  const V_MAX = 0.030;
  const DAMPING = 0.90;
  const IMPULSE_DECAY = 0.18;

  // snap: “спокійний” рух
  const SNAP_ENABLE = true;
  const SNAP_WHEN_VEL_LT = 0.0038;
  const SNAP_LERP = 0.14;
  const SNAP_KILL_VEL = 0.84;

  // parallax speeds per row
  const SPEED_MID = 1.00;
  const SPEED_TOP = 1.12;
  const SPEED_BOT = 0.86;

  // input
  let down = false;
  let lastX = 0;

  // mouse target
  let mx = 0, my = 0;
  let mxT = 0, myT = 0;

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
  // Focus + snap target
  // -----------------------------
  function focusedIndexFromAngle(phase) {
    // theta = i*STEP + scrollAngle + phase  => theta≈0 => i≈-(scroll+phase)/STEP
    const raw = -(scrollAngle + phase) / STEP_ANGLE;
    const idx = ((Math.round(raw) % COUNT) + COUNT) % COUNT;
    return idx;
  }

  function snapAngleToIndex(idx, phase) {
    // want: idx*STEP + scroll + phase = 0 => scroll = -(idx*STEP + phase)
    return -(idx * STEP_ANGLE + phase);
  }

  // -----------------------------
  // Styling (mid row main)
  // -----------------------------
  function rowWeights(rowKind) {
    if (rowKind === "mid") return { baseOpacity: 1.0, baseScale: 1.10 };
    if (rowKind === "top") return { baseOpacity: 0.68, baseScale: 0.92 };
    return { baseOpacity: 0.76, baseScale: 0.96 };
  }

  function applyStyle(mesh, absTheta, rowKind, isFocused) {
    const { baseOpacity, baseScale } = rowWeights(rowKind);

    // edge fade (мʼякий край для 4-х карток, але без “примар”)
    const tEdge = 1 - smoothstep(EDGE_START, EDGE_END, absTheta);

    // focus boost (центр головний)
    const focusBoost = isFocused ? 1.10 : 1.0;

    mesh.material.opacity = lerp(0.0, baseOpacity, tEdge);

    const s = lerp(baseScale * 0.92, baseScale * 1.06 * focusBoost, tEdge);
    mesh.scale.setScalar(s);
  }

  // -----------------------------
  // Update row: show ONLY 4 cards
  // -----------------------------
  let focusedMid = 0;

  function updateRow(group, speedMul) {
    const { radius, phase, rowKind } = group.userData;

    // focal index for THIS row depends on its speed (parallax)
    // to keep alignment across rows we still anchor focus by mid
    const focus = focusedMid;

    for (const mesh of group.children) {
      if (!mesh.isMesh) continue;

      const i = mesh.userData.i;

      // delta around the ring relative to focus
      const d = ringDelta(i, focus, COUNT);

      // ✅ HARD rule: max 4 cards
      if (!VISIBLE_DELTAS.has(d)) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      // normal carousel angle:
      // theta = i*STEP + scrollAngle*speed + phase
      const theta = i * STEP_ANGLE + scrollAngle * speedMul + phase;
      const a = wrapPi(theta);
      const absA = Math.abs(a);

      const x = Math.sin(theta) * radius;
      const z = Math.cos(theta) * radius;

      mesh.position.set(x, 0, z);

      // face camera
      mesh.lookAt(camera.position.x, camera.position.y, camera.position.z);

      // subtle twist (NO accumulation)
      mesh.rotation.y = -a * 0.08;

      // style
      const isFocused = rowKind === "mid" && d === 0;
      applyStyle(mesh, absA, rowKind, isFocused);

      // ✅ Transparent sorting control:
      // render far first, near last (to avoid “каша”)
      // bigger absA => farther from center => should render earlier
      // So renderOrder smaller for bigger absA
      mesh.renderOrder = 10000 - Math.round(absA * 1000);

      // also push children (frame) after parent a bit
      if (mesh.children && mesh.children.length) {
        for (const ch of mesh.children) ch.renderOrder = mesh.renderOrder + 1;
      }
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

    scrollAngle += vel;

    // mouse smoothing
    mx = lerp(mx, mxT, 1 - Math.pow(0.965, dt * 60));
    my = lerp(my, myT, 1 - Math.pow(0.965, dt * 60));

    // camera orbit
    const thetaBase = now * 0.001 * AUTO_CAM_ROT;
    const thetaGoal = thetaBase + mx * MOUSE_THETA;
    const phiGoal = clamp(CAM_PHI_BASE + -my * MOUSE_PHI, 1.18, 1.48);

    camTheta = lerp(camTheta, thetaGoal, 1 - Math.pow(0.92, dt * 60));
    camPhi = lerp(camPhi, phiGoal, 1 - Math.pow(0.92, dt * 60));

    const sx = Math.sin(camPhi) * Math.sin(camTheta);
    const sy = Math.cos(camPhi);
    const sz = Math.sin(camPhi) * Math.cos(camTheta);

    camera.position.set(sx * CAM_R, sy * CAM_R, sz * CAM_R);
    camera.lookAt(0, 0, 0);

    // focus + snap (по центральному ряду)
    focusedMid = focusedIndexFromAngle(rowMid.userData.phase);

    if (SNAP_ENABLE && !down && Math.abs(vel) < SNAP_WHEN_VEL_LT) {
      const targetAngle = snapAngleToIndex(focusedMid, rowMid.userData.phase);
      scrollAngle = lerp(scrollAngle, targetAngle, SNAP_LERP);
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
