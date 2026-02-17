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

  // wrap to (-range/2 .. +range/2]
  const wrapCentered = (x, range) => {
    let v = x % range;
    if (v > range / 2) v -= range;
    if (v <= -range / 2) v += range;
    return v;
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
  // Scene / Camera
  // -----------------------------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 9000);

  // camera base
  const CAM_Z = 2200; // further => reads like rows, not cluster
  const CAM_Y = 120;

  // drift (very subtle)
  const DRIFT_SPD = 0.18;
  const DRIFT_X = 18;
  const DRIFT_Y = 14;

  // micro-parallax by mouse (also subtle)
  const MOUSE_X = 28;
  const MOUSE_Y = 20;

  let mx = 0, my = 0, mxT = 0, myT = 0;

  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mxT = (nx - 0.5) * 2;
    myT = (0.5 - ny) * 2;
  }
  window.addEventListener("mousemove", onMouseMove, { passive: true });

  // -----------------------------
  // Layout: 3 straight rails (no sphere)
  // -----------------------------
  const CARD_W = 360;
  const CARD_H = 240;

  // ✅ spacing to avoid overlap + "premium air"
  const GAP_X = 260;
  const STEP_X = CARD_W + GAP_X;

  const ROW_GAP = CARD_H * 1.05;
  const Y_MID = 0;
  const Y_TOP = +ROW_GAP;
  const Y_BOT = -ROW_GAP;

  // subtle depth layering per row (still straight)
  const Z_MID = 0;
  const Z_TOP = -95;
  const Z_BOT = -115;

  const COUNT = 36;
  const BELT_LEN = COUNT * STEP_X;

  // Visibility windows (strict)
  // mid: max 4 cards
  const MID_MIN_X = -1.70 * STEP_X;
  const MID_MAX_X = +2.70 * STEP_X;

  // top/bot: max 2 cards
  const SIDE_MIN_X = -0.70 * STEP_X;
  const SIDE_MAX_X = +1.70 * STEP_X;

  // row speed differences (subtle parallax)
  const SPEED_MID = 1.0;
  const SPEED_TOP = 1.04;
  const SPEED_BOT = 0.96;

  // row phase offsets so top/bot don't align perfectly with mid
  const PHASE_MID = 0.00;
  const PHASE_TOP = 0.55;
  const PHASE_BOT = 0.25;

  // -----------------------------
  // Textures (opaque)
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

    g.fillStyle = "rgb(10,12,22)";
    g.fillRect(0, 0, w, h);

    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(90,160,255,0.20)");
    grd.addColorStop(1, "rgba(70,240,190,0.10)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    g.save();
    roundedRect(g, 22, 22, w - 44, h - 44, 26);
    g.clip();

    const glass = g.createRadialGradient(w * 0.55, h * 0.45, 80, w * 0.55, h * 0.45, 520);
    glass.addColorStop(0, "rgba(255,255,255,0.10)");
    glass.addColorStop(1, "rgba(255,255,255,0.02)");
    g.fillStyle = glass;
    g.fillRect(0, 0, w, h);

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

    const vg = g.createRadialGradient(w * 0.55, h * 0.55, 120, w * 0.55, h * 0.55, 620);
    vg.addColorStop(0, "rgba(0,0,0,0.00)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    g.restore();

    g.strokeStyle = "rgba(232,238,252,0.28)";
    g.lineWidth = 4;
    roundedRect(g, 18, 18, w - 36, h - 36, 26);
    g.stroke();

    g.strokeStyle = "rgba(232,238,252,0.10)";
    g.lineWidth = 2;
    roundedRect(g, 40, 40, w - 80, h - 80, 20);
    g.stroke();

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

  function buildRow({ y, z, rowKind }) {
    const group = new THREE.Group();
    group.position.set(0, y, z);
    group.userData = { rowKind };
    scene.add(group);

    for (let i = 0; i < COUNT; i++) {
      const item =
        GALLERY_ITEMS && GALLERY_ITEMS.length
          ? GALLERY_ITEMS[i % GALLERY_ITEMS.length]
          : { title: `Картка ${i + 1}`, subtitle: "Модуль / Епізод" };

      const tex = makeCardTexture(
        item.title,
        item.subtitle,
        i * 991 + Math.floor((y + 1000) * 7)
      );

      // opaque material => stable
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: false,
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

  const rowMid = buildRow({ y: Y_MID, z: Z_MID, rowKind: "mid" });
  const rowTop = buildRow({ y: Y_TOP, z: Z_TOP, rowKind: "top" });
  const rowBot = buildRow({ y: Y_BOT, z: Z_BOT, rowKind: "bot" });

  // -----------------------------
  // Input: wheel + drag
  // -----------------------------
  let scrollX = 0; // px along belt
  let vel = 0;
  let impulse = 0;

  // tuned to feel calm
  const V_MAX = 2.6 * 60; // px/sec
  const DAMPING = 0.90;
  const IMPULSE_DECAY = 0.18;

  const SNAP_ENABLE = true;
  const SNAP_WHEN_VEL_LT = 22; // px/sec
  const SNAP_LERP = 0.22;
  const SNAP_KILL_VEL = 0.75;

  let down = false;
  let lastX = 0;

  function onWheel(e) {
    e.preventDefault();
    const d = clamp(e.deltaY, -120, 120);
    impulse += d * 2.2;
  }

  function onPointerDown(e) {
    down = true;
    lastX = e.clientX;
  }

  function onPointerMove(e) {
    if (!down) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    impulse += -dx * 2.0;
  }

  function onPointerUp() {
    down = false;
  }

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
  // Styling
  // -----------------------------
  function styleByX(mesh, x, rowKind) {
    const ax = Math.abs(x);

    if (rowKind === "mid") {
      const t = clamp(1 - ax / (2.2 * STEP_X), 0, 1);
      const s = lerp(0.96, 1.06, t); // ✅ hero but not overlap
      const c = lerp(0.70, 1.00, t);
      mesh.scale.setScalar(s);
      mesh.material.color.setScalar(c);
    } else {
      const t = clamp(1 - ax / (1.4 * STEP_X), 0, 1);
      const s = lerp(0.86, 0.92, t);
      const c = lerp(0.50, 0.62, t);
      mesh.scale.setScalar(s);
      mesh.material.color.setScalar(c);
    }
  }

  // -----------------------------
  // Update row (straight belt)
  // -----------------------------
  function updateRow(group, speedMul, phaseSteps) {
    const { rowKind } = group.userData;

    const sX = scrollX * speedMul + phaseSteps * STEP_X;

    const minX = rowKind === "mid" ? MID_MIN_X : SIDE_MIN_X;
    const maxX = rowKind === "mid" ? MID_MAX_X : SIDE_MAX_X;

    for (const mesh of group.children) {
      const i = mesh.userData.i;

      const base = i * STEP_X;
      const x = wrapCentered(base - sX, BELT_LEN);

      if (x < minX || x > maxX) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      mesh.position.set(x, 0, 0);

      // face camera, keep row straight
      mesh.lookAt(camera.position.x, camera.position.y, camera.position.z);
      mesh.rotation.y = 0;

      styleByX(mesh, x, rowKind);

      // stable ordering: mid always above
      mesh.renderOrder =
        1000 + (rowKind === "mid" ? 80 : 0) + (10 - Math.round(Math.abs(x) / STEP_X));
    }
  }

  // Snap target so mid center card lands exactly at x=0
  function nearestSnapX() {
    const steps = scrollX / STEP_X;
    const nearest = Math.round(steps);
    return nearest * STEP_X;
  }

  // -----------------------------
  // Loop
  // -----------------------------
  let lastT = performance.now();

  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.033);
    lastT = now;

    // inertia
    vel += impulse * (dt * 60);
    impulse *= Math.pow(IMPULSE_DECAY, dt * 60);

    vel = clamp(vel, -V_MAX, V_MAX);
    vel *= Math.pow(DAMPING, dt * 60);

    scrollX += vel * dt;

    // keep bounded (avoid float explosion)
    if (scrollX > 1e7 || scrollX < -1e7) scrollX = wrapCentered(scrollX, BELT_LEN);

    // mouse smoothing
    mx = lerp(mx, mxT, 1 - Math.pow(0.965, dt * 60));
    my = lerp(my, myT, 1 - Math.pow(0.965, dt * 60));

    // camera drift (subtle)
    const t = now * 0.001;
    const driftX = Math.sin(t * DRIFT_SPD) * DRIFT_X;
    const driftY = Math.cos(t * DRIFT_SPD * 0.9) * DRIFT_Y;

    camera.position.set(driftX + mx * MOUSE_X, CAM_Y + driftY + -my * MOUSE_Y, CAM_Z);
    camera.lookAt(0, 0, 0);

    // snap (mid master)
    if (SNAP_ENABLE && !down && Math.abs(vel) < SNAP_WHEN_VEL_LT) {
      const target = nearestSnapX();
      scrollX = lerp(scrollX, target, SNAP_LERP);
      vel *= SNAP_KILL_VEL;
    }

    updateRow(rowMid, SPEED_MID, PHASE_MID);
    updateRow(rowTop, SPEED_TOP, PHASE_TOP);
    updateRow(rowBot, SPEED_BOT, PHASE_BOT);

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
