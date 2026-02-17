// libs/main-gallery.js
import * as THREE from "three";
import { GALLERY_ITEMS } from "./data.js";

/**
 * KAYA Main Gallery — Rail / Conveyor (product-grade)
 * - 3 rows: top / mid / bot
 * - Infinite loop
 * - Snap: focused (center) card is ALWAYS centered on mid row
 * - Mid: max 4 visible cards
 * - Top/Bottom: 2 visible cards
 * - Opaque materials (no transparency artifacts)
 * - Smooth wheel + drag
 * - Camera: subtle drift (doesn't break center composition)
 */
export function initMainGallery({ mountEl }) {
  if (!mountEl) throw new Error("initMainGallery: mountEl is required");

  // -----------------------------
  // Utils
  // -----------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const mod = (n, m) => ((n % m) + m) % m;

  // shortest delta on a ring: [-count/2 .. +count/2]
  const ringDelta = (i, focus, count) => {
    let d = i - focus;
    d = ((d % count) + count) % count; // 0..count-1
    if (d > count / 2) d -= count;
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

  // Slightly narrower FOV = “premium UI”
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 9000);

  // Camera is basically frontal. Drift is subtle and does NOT move the composition off-center.
  const CAM_Z = 2200;
  const CAM_Y = 180;
  const DRIFT_X = 35;   // tiny lateral drift
  const DRIFT_Y = 22;   // tiny vertical drift
  const DRIFT_SPD = 0.20;

  // Mouse influence (cinematic, small)
  const MOUSE_X = 55;
  const MOUSE_Y = 35;
  let mx = 0, my = 0, mxT = 0, myT = 0;

  // -----------------------------
  // Layout
  // -----------------------------
  const CARD_W = 360;
  const CARD_H = 240;

  // “середньо” spacing
  const GAP_X = 150;
  const STEP_X = CARD_W + GAP_X;

  // 3 rows
  const ROW_GAP = CARD_H * 1.05;
  const Y_MID = 0;
  const Y_TOP = +ROW_GAP;
  const Y_BOT = -ROW_GAP;

  // Depth separation (so rows don't look like a flat grid)
  const Z_MID = 0;
  const Z_TOP = -120;
  const Z_BOT = -150;

  // Slight row skew to feel “designed”
  const TILT_TOP = 0.06;
  const TILT_BOT = -0.06;

  // How many cards exist (loop)
  const COUNT = 36;

  // Visibility counts
  const MID_MAX_VISIBLE = 4;   // strict max 4 visible
  const SIDE_VISIBLE = 2;

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
  // Build cards
  // -----------------------------
  const planeGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);

  function buildRow({ y, zBase, tilt, rowKind }) {
    const group = new THREE.Group();
    group.position.set(0, y, zBase);
    group.userData = { y, zBase, tilt, rowKind };
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

  const rowMid = buildRow({ y: Y_MID, zBase: Z_MID, tilt: 0.0, rowKind: "mid" });
  const rowTop = buildRow({ y: Y_TOP, zBase: Z_TOP, tilt: TILT_TOP, rowKind: "top" });
  const rowBot = buildRow({ y: Y_BOT, zBase: Z_BOT, tilt: TILT_BOT, rowKind: "bot" });

  // -----------------------------
  // Motion: scrollX (in “card steps”) + snap
  // -----------------------------
  // scrollX is continuous and measured in “card widths”:
  // 0 => card 0 centered; 1 => card 1 centered, etc.
  let scrollX = 0;
  let vel = 0;
  let impulse = 0;

  const V_MAX = 0.060;        // max speed in steps/sec-ish (we scale with dt)
  const DAMPING = 0.90;
  const IMPULSE_DECAY = 0.18;

  const SNAP_ENABLE = true;
  const SNAP_WHEN_VEL_LT = 0.006;
  const SNAP_LERP = 0.16;
  const SNAP_KILL_VEL = 0.80;

  // Start: card 0 centered (no jump)
  scrollX = 0;

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
    // wheel -> impulse in “steps”
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
    // drag horizontally moves rail (pixel -> step)
    impulse += -dx / 1400; // tuned for “premium” drag
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
  // Focus & visibility policy
  // -----------------------------
  // Focus index is the card that should be centered on mid row.
  const focusIndex = () => mod(Math.round(scrollX), COUNT);

  // We want “max 4 visible” on mid.
  // To keep it feeling stable, we show offsets around focus:
  // always show: -1, 0, +1
  // plus one extra based on direction (so max=4 but still feels natural)
  function midVisibleOffsets(direction) {
    // direction: -1 (left), +1 (right), 0 (stable)
    if (direction < -0.2) return [-2, -1, 0, +1];
    return [-1, 0, +1, +2];
  }

  function sideVisibleOffsets(direction) {
    // 2 visible on top/bot: focus + one neighbor in direction of travel
    if (direction < -0.2) return [0, -1];
    return [0, +1];
  }

  // Product-like styling
  function styleByDelta(mesh, absD, rowKind) {
    if (rowKind === "mid") {
      // focus bigger, neighbors smaller, second-neighbor smallest
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

  // Update a row by deltas around focus (on a ring)
  function updateRow(group, speedMul, direction) {
    const { rowKind, tilt } = group.userData;
    const focus = focusIndex();
    const frac = scrollX - Math.round(scrollX); // -0.5..+0.5 typically

    const offsets =
      rowKind === "mid"
        ? midVisibleOffsets(direction)
        : sideVisibleOffsets(direction);

    const visible = new Set(offsets);

    for (const mesh of group.children) {
      const i = mesh.userData.i;
      const d = ringDelta(i, focus, COUNT);

      if (!visible.has(d)) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;

      // Rail position: center focus (d=0) at x=0 when snapped.
      // frac shifts during scrolling.
      const x = (d - frac) * STEP_X * speedMul;

      // Small Z curve (gives depth without circle physics)
      // Cards slightly curve backward away from center
      const absD = Math.abs(d);
      const zCurve = -absD * 26;

      mesh.position.set(x, 0, zCurve);

      // Face camera (keeps “interface” feel)
      mesh.lookAt(camera.position.x, camera.position.y, camera.position.z);

      // Gentle row tilt
      mesh.rotation.z += tilt;

      // Subtle yaw for motion richness (no chaos)
      mesh.rotation.y += clamp(x / 3800, -0.18, 0.18);

      styleByDelta(mesh, absD, rowKind);

      // Stable order: mid over top/bot, focus above neighbors
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

    // motion
    vel += impulse;
    impulse *= Math.pow(IMPULSE_DECAY, dt * 60);
    vel = clamp(vel, -V_MAX, V_MAX);
    vel *= Math.pow(DAMPING, dt * 60);

    scrollX += vel;

    // Keep scrollX bounded to avoid float explosion (still infinite visually)
    // preserve fractional movement smoothly
    if (scrollX > 1e6 || scrollX < -1e6) {
      scrollX = mod(scrollX, COUNT);
    }

    // mouse smoothing
    mx = lerp(mx, mxT, 1 - Math.pow(0.965, dt * 60));
    my = lerp(my, myT, 1 - Math.pow(0.965, dt * 60));

    // camera drift (does NOT break centered composition)
    const t = now * 0.001;
    const driftX = Math.sin(t * DRIFT_SPD) * DRIFT_X;
    const driftY = Math.cos(t * DRIFT_SPD * 0.9) * DRIFT_Y;

    camera.position.set(
      driftX + mx * MOUSE_X,
      CAM_Y + driftY + -my * MOUSE_Y,
      CAM_Z
    );
    camera.lookAt(0, 0, 0);

    // snap: center focus card (mid) to x=0
    if (SNAP_ENABLE && !down && Math.abs(vel) < SNAP_WHEN_VEL_LT) {
      const target = Math.round(scrollX);
      scrollX = lerp(scrollX, target, SNAP_LERP);
      vel *= SNAP_KILL_VEL;
    }

    const direction = vel; // sign indicates travel direction

    updateRow(rowMid, 1.0, direction);
    updateRow(rowTop, 1.02, direction);
    updateRow(rowBot, 0.98, direction);

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
