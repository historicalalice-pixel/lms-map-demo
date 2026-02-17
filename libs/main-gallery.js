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
  renderer.sortObjects = true;

  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // -----------------------------
  // Scene / Camera (orbit Y, cinematic)
  // -----------------------------
  const scene = new THREE.Scene();
  scene.fog = null;

  // “дорожчий” вигляд — вужчий FOV
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 9000);

  // Камера ЗОВНІ кільця, стабільна композиція
  const CAM_R = 2100;
  const CAM_PHI_BASE = 1.30;   // майже горизонт
  const AUTO_CAM_ROT = 0.045;  // дуже повільно

  // Мишка — мінімальний вплив (кінематографічно)
  const MOUSE_THETA = 0.18;
  const MOUSE_PHI = 0.10;

  let camTheta = 0;
  let camPhi = CAM_PHI_BASE;

  // -----------------------------
  // Layout (3 rows) — product-like
  // -----------------------------
  const CARD_W = 360;
  const CARD_H = 240;

  // Кільце компактне, щоб центр завжди “в кадрі”
  const R_MID = 1020;
  const R_TOP = 1080;
  const R_BOT = 960;

  // Ряди рознесені сильніше (менше “стеку”)
  const ROW_GAP = CARD_H * 1.05;
  const Y_MID = 0;
  const Y_TOP = +ROW_GAP;
  const Y_BOT = -ROW_GAP;

  const COUNT = 36;

  // Крок по колу: тримаємо “карусельність”, але не щільно
  const GAP = 140;
  const STEP_ANGLE = (CARD_W + GAP) / R_MID;

  // ✅ Жорстка видимість під ТЗ:
  // - mid: 4 картки ([-2,-1,0,+1])
  // - top/bot: 2 картки ([-1,0]) — підтримка, не шум
  const VISIBLE_MID = new Set([-2, -1, 0, 1]);
  const VISIBLE_SIDE = new Set([-1, 0]);

  // -----------------------------
  // Textures (draw “glass” inside texture, keep material opaque)
  // -----------------------------
  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function makeCardTexture(title, subtitle, seed) {
    const w = 768, h = 512;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");

    const rng = mulberry32(seed);

    // background (opaque, no transparency)
    g.fillStyle = "rgb(10,12,22)";
    g.fillRect(0, 0, w, h);

    // subtle gradient
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(90,160,255,0.20)");
    grd.addColorStop(1, "rgba(70,240,190,0.10)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // “glass plate” illusion (still opaque)
    g.save();
    roundedRect(g, 22, 22, w - 44, h - 44, 26);
    g.clip();

    const glass = g.createRadialGradient(w * 0.55, h * 0.45, 80, w * 0.55, h * 0.45, 520);
    glass.addColorStop(0, "rgba(255,255,255,0.10)");
    glass.addColorStop(1, "rgba(255,255,255,0.02)");
    g.fillStyle = glass;
    g.fillRect(0, 0, w, h);

    // subtle blob
    g.globalAlpha = 0.9;
    g.fillStyle = `rgba(${Math.floor(120 + rng() * 100)},${Math.floor(140 + rng() * 80)},${Math.floor(
      170 + rng() * 70
    )},0.30)`;
    g.beginPath();
    g.ellipse(
      w * 0.66,
      h * 0.62,
      w * (0.18 + rng() * 0.06),
      h * (0.16 + rng() * 0.06),
      rng() * 0.9,
      0,
      Math.PI * 2
    );
    g.fill();
    g.globalAlpha = 1;

    // vignette inside
    const vg = g.createRadialGradient(w * 0.55, h * 0.55, 120, w * 0.55, h * 0.55, 620);
    vg.addColorStop(0, "rgba(0,0,0,0.00)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    g.restore();

    // border
    g.strokeStyle = "rgba(232,238,252,0.28)";
    g.lineWidth = 4;
    roundedRect(g, 18, 18, w - 36, h - 36, 26);
    g.stroke();

    // inner border
    g.strokeStyle = "rgba(232,238,252,0.10)";
    g.lineWidth = 2;
    roundedRect(g, 40, 40, w - 80, h - 80, 20);
    g.stroke();

    // text
    g.fillStyle = "rgba(245,245,255,0.96)";
    g.font = "700 38px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(title || "Картка", 56, 104);

    g.fillStyle = "rgba(232,238,252,0.72)";
    g.font = "600 22px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(subtitle || "Модуль / Епізод", 56, 142);

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

      const tex = makeCardTexture(item.title, item.subtitle, i * 991 + Math.floor((y + 1000) * 7));

      // ✅ OPAQUE material => no transparency sorting hell
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: true,
        depthTest: true,
      });

      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.userData = { i };
      group.add(mesh);
    }

    return group;
  }

  const rowMid = createRow({ y: Y_MID, radius: R_MID, phase: 0.35, rowKind: "mid" });
  const rowTop = createRow({ y: Y_TOP, radius: R_TOP, phase: 0.55, rowKind: "top" });
  const rowBot = createRow({ y: Y_BOT, radius: R_BOT, phase: 0.15, rowKind: "bot" });

  // -----------------------------
  // Motion: scroll + snap (calm)
  // -----------------------------
  let scrollAngle = 0;
  let vel = 0;
  let impulse = 0;

  const V_MAX = 0.028;
  const DAMPING = 0.90;
  const IMPULSE_DECAY = 0.18;

  // parallax per row (subtle)
  const SPEED_MID = 1.0;
  const SPEED_TOP = 1.08;
  const SPEED_BOT = 0.90;

  const SNAP_ENABLE = true;
  const SNAP_WHEN_VEL_LT = 0.0035;
  const SNAP_LERP = 0.14;
  const SNAP_KILL_VEL = 0.84;

  // input
  let down = false;
  let lastX = 0;

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
  // Focus + snap
  // -----------------------------
  function focusedIndexFromAngle(phase) {
    const raw = -(scrollAngle + phase) / STEP_ANGLE;
    const idx = ((Math.round(raw) % COUNT) + COUNT) % COUNT;
    return idx;
  }

  function snapAngleToIndex(idx, phase) {
    return -(idx * STEP_ANGLE + phase);
  }

  let focusedMid = 0;

  // -----------------------------
  // Product-like styling
  // -----------------------------
  function styleByDelta(mesh, absD, rowKind) {
    // “дорогий” фокус: центр великий, бокові менші і темніші
    // без opacity, тільки scale + color dimming (бо матеріал opaque)
    let baseScale = 1.0;
    let dim = 1.0;

    if (rowKind === "mid") {
      baseScale = 1.10;
      dim = 1.0;
    } else {
      baseScale = 0.92;
      dim = 0.78;
    }

    // absD: 0 (центр), 1 (сусід), 2 (край для mid)
    const t = absD === 0 ? 1 : absD === 1 ? 0.78 : 0.62;

    const s = baseScale * lerp(0.92, 1.05, t);
    mesh.scale.setScalar(s);

    const c = lerp(0.62, 1.0, t) * dim;
    mesh.material.color.setScalar(c);
  }

  function updateRow(group, speedMul) {
    const { radius, phase, rowKind } = group.userData;

    const visibleSet = rowKind === "mid" ? VISIBLE_MID : VISIBLE_SIDE;
    const focus = focusedMid;

    for (const mesh of group.children) {
      if (!mesh.isMesh) continue;

      const i = mesh.userData.i;
      const d = ringDelta(i, focus, COUNT);

      if (!visibleSet.has(d)) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      const theta = i * STEP_ANGLE + scrollAngle * speedMul + phase;

      const x = Math.sin(theta) * radius;
      const z = Math.cos(theta) * radius;

      // Легка “сцена як продукт”: центральний ряд трохи попереду по Z
      const zBias = rowKind === "mid" ? 28 : rowKind === "top" ? -6 : -10;

      mesh.position.set(x, 0, z + zBias);

      // Дивиться на камеру
      mesh.lookAt(camera.position.x, camera.position.y, camera.position.z);

      // М’який “twist” без накопичення
      mesh.rotation.y = -Math.sin(theta) * 0.06;

      styleByDelta(mesh, Math.abs(d), rowKind);

      // Opaque — renderOrder майже не потрібен, але хай буде стабільність
      mesh.renderOrder = 1000 + (rowKind === "mid" ? 20 : 0) + (10 - Math.abs(d));
    }
  }

  // -----------------------------
  // Loop
  // -----------------------------
  let lastT = performance.now();

  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.033);
    lastT = now;

    vel += impulse;
    impulse *= Math.pow(IMPULSE_DECAY, dt * 60);
    vel = clamp(vel, -V_MAX, V_MAX);
    vel *= Math.pow(DAMPING, dt * 60);
    scrollAngle += vel;

    // mouse smoothing
    mx = lerp(mx, mxT, 1 - Math.pow(0.965, dt * 60));
    my = lerp(my, myT, 1 - Math.pow(0.965, dt * 60));

    // camera orbit (very calm)
    const thetaBase = now * 0.001 * AUTO_CAM_ROT;
    const thetaGoal = thetaBase + mx * MOUSE_THETA;
    const phiGoal = clamp(CAM_PHI_BASE + -my * MOUSE_PHI, 1.18, 1.42);

    camTheta = lerp(camTheta, thetaGoal, 1 - Math.pow(0.92, dt * 60));
    camPhi = lerp(camPhi, phiGoal, 1 - Math.pow(0.92, dt * 60));

    const sx = Math.sin(camPhi) * Math.sin(camTheta);
    const sy = Math.cos(camPhi);
    const sz = Math.sin(camPhi) * Math.cos(camTheta);

    camera.position.set(sx * CAM_R, sy * CAM_R, sz * CAM_R);
    camera.lookAt(0, 0, 0);

    // focus + snap (mid row is master)
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
