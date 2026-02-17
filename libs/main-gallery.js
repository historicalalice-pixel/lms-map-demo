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
  const mod = (n, m) => ((n % m) + m) % m;

  const ringDelta = (i, focus, count) => {
    let d = i - focus;
    d = ((d % count) + count) % count; // 0..count-1
    if (d > count / 2) d -= count;     // -count/2..count/2
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
  // Scene / Camera
  // -----------------------------
  const scene = new THREE.Scene();

  // Premium-ish FOV
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 9000);

  // Camera baseline
  const CAM_Z = 1450;
  const CAM_Y = 120;

  // Subtle drift (won't break center because lookAt is always (0,0,0))
  const DRIFT_SPD = 0.18;
  const DRIFT_X = 22;
  const DRIFT_Y = 16;

  // Mouse influence (tiny)
  const MOUSE_X = 36;
  const MOUSE_Y = 24;
  let mx = 0, my = 0, mxT = 0, myT = 0;

  // -----------------------------
  // Layout: 3 straight rows
  // -----------------------------
  const CARD_W = 360;
  const CARD_H = 240;

  // “середньо” spacing (tweakable)
  const GAP_X = 110;
  const STEP_X = CARD_W + GAP_X;

  const ROW_GAP = CARD_H * 1.05;
  const Y_MID = 0;
  const Y_TOP = +ROW_GAP;
  const Y_BOT = -ROW_GAP;

  // Straight rows: only a tiny depth layering by row (not curved per-card)
  const Z_MID = 0;
  const Z_TOP = -90;
  const Z_BOT = -110;

  // How many cards exist (loop)
  const COUNT = 36;

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

  function buildRow({ y, zBase, rowKind }) {
    const group = new THREE.Group();
    group.position.set(0, y, zBase);
    group.userData = { rowKind };
    scene.add(group);

    for (let i = 0; i < COUNT; i++) {
      const item =
        GALLERY_ITEMS && GALLERY_ITEMS.length
          ? GALLERY_ITEMS[i % GALLERY_ITEMS.length]
          : { title: `Картка ${i + 1}`, subtitle: "Модуль / Епізод" };

      const tex = makeCardTexture(item.title, item.subtitle, i * 991 + Math.floor((y + 1000) * 7));

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

  const rowMid = buildRow({ y: Y_MID, zBase: Z_MID, rowKind: "mid" });
  const rowTop = buildRow({ y: Y_TOP, zBase: Z_TOP, rowKind: "top" });
  const rowBot = buildRow({ y: Y_BOT, zBase: Z_BOT, rowKind: "bot" });

  // -----------------------------
  // Motion: scroll in STEPS + snap
  // -----------------------------
  let scrollSteps = 0; // 0 => card 0 centered
  let vel = 0;
  let impulse = 0;

  const V_MAX = 0.060;
  const DAMPING = 0.90;
  const IMPULSE_DECAY = 0.18;

  const SNAP_ENABLE = true;
  const SNAP_WHEN_VEL_LT = 0.006;
  const SNAP_LERP = 0.18;
  const SNAP_KILL_VEL = 0.80;

  // Input
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
    impulse += d * 0.0012;
  }

  function onPointerDown(e) {
    down = true;
    lastX = e.clientX;
  }

  function onPointerMove(e) {
    if (!down) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    impulse += -dx / 1400;
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
  // Visibility policy (strict)
  // -----------------------------
  function focusIndex() {
    return mod(Math.round(scrollSteps), COUNT);
  }

  function midOffsets(dir) {
    // exactly 4 visible in mid, always centered by snap
    if (dir < -0.2) return [-2, -1, 0, +1];
    return [-1, 0, +1, +2];
  }

  function sideOffsets(dir) {
    // exactly 2 visible on top/bot
    if (dir < -0.2) return [0, -1];
    return [0, +1];
  }

  function styleByAbsDelta(mesh, absD, rowKind) {
    if (rowKind === "mid") {
      const s = absD === 0 ? 1.14 : absD === 1 ? 1.04 : 0.94;
      const c = absD === 0 ? 1.0 : absD === 1 ? 0.82 : 0.68;
      mesh.scale.setScalar(s);
      mesh.material.color.setScalar(c);
    } else {
      const s = absD === 0 ? 0.92 : 0.86;
      const c = absD === 0 ? 0.58 : 0.50;
      mesh.scale.setScalar(s);
      mesh.material.color.setScalar(c);
    }
  }

  function updateRow(group, speedMul, dir) {
    const { rowKind } = group.userData;

    const focus = focusIndex();
    const frac = scrollSteps - Math.round(scrollSteps);

    const offsets = rowKind === "mid" ? midOffsets(dir) : sideOffsets(dir);
    const visible = new Set(offsets);

    for (const mesh of group.children) {
      const i = mesh.userData.i;
      const d = ringDelta(i, focus, COUNT);

      if (!visible.has(d)) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      // ✅ STRAIGHT ROWS: no curve, pure X movement
      const x = (d - frac) * STEP_X * speedMul;

      mesh.position.set(x, 0, 0);

      // Face camera + tiny yaw for “depth”, but keep row straight
      mesh.lookAt(camera.position.x, camera.position.y, camera.position.z);
      mesh.rotation.y += clamp(x / 4200, -0.14, 0.14);

      const absD = Math.abs(d);
      styleByAbsDelta(mesh, absD, rowKind);

      mesh.renderOrder = 1000 + (rowKind === "mid" ? 60 : 0) + (10 - absD);
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
    scrollSteps += vel;

    // keep bounded
    if (scrollSteps > 1e6 || scrollSteps < -1e6) {
      scrollSteps = mod(scrollSteps, COUNT);
    }

    // mouse smoothing
    mx = lerp(mx, mxT, 1 - Math.pow(0.965, dt * 60));
    my = lerp(my, myT, 1 - Math.pow(0.965, dt * 60));

    // camera drift (subtle)
    const t = now * 0.001;
    const driftX = Math.sin(t * DRIFT_SPD) * DRIFT_X;
    const driftY = Math.cos(t * DRIFT_SPD * 0.9) * DRIFT_Y;

    camera.position.set(driftX + mx * MOUSE_X, CAM_Y + driftY + -my * MOUSE_Y, CAM_Z);
    camera.lookAt(0, 0, 0);

    // snap to center
    if (SNAP_ENABLE && !down && Math.abs(vel) < SNAP_WHEN_VEL_LT) {
      const target = Math.round(scrollSteps);
      scrollSteps = lerp(scrollSteps, target, SNAP_LERP);
      vel *= SNAP_KILL_VEL;
    }

    const dir = vel;

    updateRow(rowMid, 1.0, dir);
    updateRow(rowTop, 1.02, dir);
    updateRow(rowBot, 0.98, dir);

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
