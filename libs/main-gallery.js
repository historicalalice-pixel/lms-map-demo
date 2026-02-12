// libs/main-gallery.js
// 100lostspecies-inspired curved gallery engine (3 belts, inertia, parallax, snap).
// This file ONLY handles 3D gallery logic (no DOM UI).

// ✅ If you use local three file in /libs:
import * as THREE from "./three.module.js";
// ✅ If you use importmap CDN, replace the line above with:
// import * as THREE from "three";

import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl }) {
  if (!mountEl) throw new Error("initMainGallery: mountEl is required");

  // ---------------- utils ----------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth01 = (t) => t * t * (3 - 2 * t); // smoothstep(0..1)
  const smoothstep = (a, b, x) => smooth01(clamp((x - a) / (b - a), 0, 1));

  // ---------------- renderer ----------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // ---------------- scene & camera ----------------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    46, // FOV tuned so center shows ~4 readable cards
    1,
    0.1,
    5000
  );

  // Fixed camera Z — no zoom / no fly-away
  const CAM_Z = 920;
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  // We use MeshBasicMaterial (no lighting dependency) for stable visibility
  // Add subtle fog for depth (optional but helps "museum space")
  scene.fog = new THREE.Fog(0x060812, 1400, 2200);

  // ---------------- layout (world model) ----------------
  // Card size & spacing: large cards + big step -> max ~4 readable in center
  const CARD_W = 340;
  const CARD_H = 220;

  // Cylinder radii per row (small differences for depth feel)
  const R_MID = 980;
  const R_BOT = 1020;
  const R_TOP = 1060;

  // Vertical positions: center 100%, bottom ~1/2 visible, top ~1/3 visible
  const Y_MID = 0;
  const Y_BOT = -(CARD_H * 0.70); // ~half visible
  const Y_TOP = +(CARD_H * 0.92); // ~third visible

  // How many cards per ring (enough to never see an end)
  const COUNT = 36;

  // Step along arc: (CARD + GAP) / radius => angle step
  // Increase GAP to reduce density (fewer visible).
  const GAP = 520; // more space between cards (closer to 100lostspecies feel)
  const STEP_ANGLE_MID = (CARD_W + GAP) / R_MID;
  const STEP_ANGLE_BOT = STEP_ANGLE_MID; // keep rows angularly synced
  const STEP_ANGLE_TOP = STEP_ANGLE_MID; // keep rows angularly synced

  // Visible sector and focus behavior:
  // We fade based on ANGLE from camera forward axis (NOT z).
  // Readable zone around center is about ±35..40 degrees => ~4 cards max.
  const READABLE_DEG = 38; // target readable half-angle
  const READABLE_RAD = (READABLE_DEG * Math.PI) / 180;

  // Outside readable zone we fade aggressively but never fully disappear (unless behind)
  const FADE_START = READABLE_RAD * 0.95;
  const FADE_END = READABLE_RAD * 1.65;

  // We can cull far behind (optional), but keep some ambience.
  const HARD_CULL = Math.PI * 0.92; // almost behind

  // ---------------- texture factory (stable, visible) ----------------
  function makeCardTexture(title, subtitle, seed) {
    const w = 768, h = 512;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");

    // base
    g.fillStyle = "rgba(9,12,22,1)";
    g.fillRect(0, 0, w, h);

    // soft gradient
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(70,140,255,0.18)");
    grd.addColorStop(1, "rgba(70,220,170,0.10)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // vignette
    const vg = g.createRadialGradient(w*0.55, h*0.50, 60, w*0.55, h*0.55, 420);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.70)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    // frame
    g.strokeStyle = "rgba(232,238,252,0.24)";
    g.lineWidth = 4;
    g.strokeRect(18, 18, w - 36, h - 36);

    // pseudo blob
    const rng = mulberry32(seed);
    g.globalAlpha = 0.9;
    g.fillStyle = `rgba(${Math.floor(120+rng()*90)},${Math.floor(140+rng()*70)},${Math.floor(170+rng()*60)},0.34)`;
    g.beginPath();
    g.ellipse(w*0.62, h*0.63, w*(0.18+rng()*0.07), h*(0.16+rng()*0.07), rng()*0.9, 0, Math.PI*2);
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
    // keep safe across three versions:
    if ("SRGBColorSpace" in THREE) tex.colorSpace = THREE.SRGBColorSpace;
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

  // ---------------- build rows ----------------
  const planeGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

  function createRow({ y, radius, stepAngle, phase, rowKind }) {
    const group = new THREE.Group();
    group.position.y = y;
    scene.add(group);

    for (let i = 0; i < COUNT; i++) {
      const item = (GALLERY_ITEMS && GALLERY_ITEMS.length)
        ? GALLERY_ITEMS[i % GALLERY_ITEMS.length]
        : { title: `Картка ${i+1}`, subtitle: "Модуль" };

      const tex = makeCardTexture(item.title, item.subtitle, i * 991 + Math.floor((y + 999) * 10));
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false, // avoid alpha z artifacts
      });

      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.userData = {
        i,
        radius,
        stepAngle,
        phase,
        rowKind, // "mid" | "top" | "bot"
      };

      group.add(mesh);

      // subtle border glow plane
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
      frame.position.z = 0.2;
      mesh.add(frame);
    }

    return group;
  }

  const rowMid = createRow({ y: Y_MID, radius: R_MID, stepAngle: STEP_ANGLE_MID, phase: 0.0, rowKind: "mid" });
  const rowBot = createRow({ y: Y_BOT, radius: R_BOT, stepAngle: STEP_ANGLE_MID, phase: 0.0, rowKind: "bot" });
  const rowTop = createRow({ y: Y_TOP, radius: R_TOP, stepAngle: STEP_ANGLE_MID, phase: 0.0, rowKind: "top" });

  // ---------------- motion state (inertia) ----------------
  // scrollPos is an angle offset around the cylinder
  let scrollPos = 0;
  let vel = 0;
  let impulse = 0;

  // Inertia numbers (from your TЗ):
  // slow, heavy drift; stop ~1.5–2s
  const V_MAX = 0.028;
  const IMPULSE_DECAY = 0.20; // impulse decays quickly
  const DAMPING = 0.92;       // heavy damping per 60fps
  const AUTO_DRIFT = 0.0; // variant 1: no autonomous drift

  // Drag state
  let down = false;
  let lastX = 0;

  // Mouse parallax state (camera x/y only)
  let mx = 0, my = 0;
  let mxT = 0, myT = 0; // target mouse (smoothed)
  let camX = 0, camY = 0;

  // Snap (magnetic) state
  const SNAP_THRESHOLD = 0.18 * V_MAX; // 18% of max speed
  const SNAP_STRENGTH = 0.030;         // 0.02..0.05 (your TЗ)
  const SNAP_DAMP = 0.90;              // 0.85..0.92 (your TЗ)

  // Parallax row speed multipliers (your TЗ #3)
  const SPEED_MID = 1.0;
  const SPEED_BOT = 0.85;
  const SPEED_TOP = 1.15;

  // Micro vertical parallax from motion (very small)
  let microY = 0;

  // ---------------- input ----------------
  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mx = (nx - 0.5) * 2;
    my = (0.5 - ny) * 2; // up = +
  }

  function onWheel(e) {
    e.preventDefault();
    const d = clamp(e.deltaY, -120, 120);
    // Wheel = impulse, very slow
    impulse += d * 0.00022; // tune for "slow"
  }

  function onPointerDown(e) {
    down = true;
    lastX = e.clientX;
  }

  function onPointerMove(e) {
    if (!down) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    // Drag = impulse (slow)
    impulse += (-dx) * 0.00006;
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

  // ---------------- focus & visibility (ANGLE-BASED, not z-based) ----------------
  // Define "center axis": the ray from origin to camera (inside cylinder).
  // A card at angle 'a' is centered when its angular position aligns to camera forward axis.
  //
  // We'll place cards on cylinder:
  // position = (sin(theta)*R, 0, cos(theta)*R)
  // and we want the "front" to be around theta ~= 0 (z positive, x ~0).
  //
  // IMPORTANT: visibility depends on |wrappedAngle(theta)|, not on z.
  function wrapPi(a) {
    // wrap angle into [-PI, PI]
    a = (a + Math.PI) % (2 * Math.PI);
    if (a < 0) a += 2 * Math.PI;
    return a - Math.PI;
  }

  function applyStyle(mesh, absAngle, rowKind, isFocused) {
    // absAngle: 0 at center, grows to sides

    // Fade by angle:
    // - 0..FADE_START => strong visibility
    // - FADE_START..FADE_END => fade
    // - > FADE_END => low
    const tFade = 1 - smoothstep(FADE_START, FADE_END, absAngle); // 1 near center, 0 at far

    // Row hierarchy (your TЗ)
    let baseOpacity = 1.0;
    let baseScale = 1.0;

    if (rowKind === "mid") {
      baseOpacity = 1.0;
      baseScale = 1.0;
    } else if (rowKind === "bot") {
      baseOpacity = 0.82;
      baseScale = 0.92;
    } else if (rowKind === "top") {
      baseOpacity = 0.65;
      baseScale = 0.88;
    }

    // Focus model (snap target):
    // - focused slightly bigger & more opaque
    const focusBoost = isFocused ? 1.10 : 1.00;
    const focusOpacityBoost = isFocused ? 1.00 : 0.96;

    // Final opacity never becomes 0 (avoid "looks broken")
    const minO = (rowKind === "mid") ? 0.10 : 0.06;
    const maxO = baseOpacity * focusOpacityBoost;

    const opacity = lerp(minO, maxO, tFade);
    mesh.material.opacity = opacity;

    // Scale: bigger near center; focused gets extra
    const minS = baseScale * 0.78;
    const maxS = baseScale * 1.06 * focusBoost;
    const s = lerp(minS, maxS, tFade);
    mesh.scale.setScalar(s);

    // Optional hard cull far behind (performance + no weird back)
    mesh.visible = absAngle < HARD_CULL;
  }

  // Compute nearest snap target for mid row:
  // We snap scrollPos so that some card lands exactly at center (absAngle=0).
  function nearestSnapTarget() {
    // For mid row: theta_i = i*step + scrollPos*speed + phase
    // Center happens when theta_i is closest to 0 (mod 2pi).
    // We solve for scrollPos that makes theta_i == 0:
    // scrollPos = -(i*step + phase)/speed
    //
    // Choose i giving minimal absAngle at current scrollPos.
    const step = STEP_ANGLE_MID;
    const phase = 0.35;

    let bestI = 0;
    let bestAbs = Infinity;

    for (let i = 0; i < COUNT; i++) {
      const theta = i * step + scrollPos * SPEED_MID + phase;
      const a = wrapPi(theta);
      const aa = Math.abs(a);
      if (aa < bestAbs) {
        bestAbs = aa;
        bestI = i;
      }
    }

    const target = -(bestI * step + phase) / SPEED_MID;
    return { target, index: bestI };
  }

  let focusedIndex = 0;

  // ---------------- place cards ----------------
  function updateRow(group, speedMul, rowKind, phaseOverride = null) {
    for (const mesh of group.children) {
      if (!mesh.isMesh) continue;

      const i = mesh.userData.i;
      const R = mesh.userData.radius;
      const step = mesh.userData.stepAngle;
      const phase = phaseOverride ?? mesh.userData.phase;

      const theta = i * step + scrollPos * speedMul + phase;
      const a = wrapPi(theta);
      const absA = Math.abs(a);

      // Position on inner cylinder
      const x = Math.sin(theta) * R;
      const z = Math.cos(theta) * R;
      mesh.position.set(x, 0, z);

      // Face camera (billboard-ish)
      mesh.lookAt(camera.position.x, camera.position.y - group.position.y, camera.position.z);

      // Slight edge rotation for perspective feel (your TЗ #3)
      // (tiny, to avoid "technical")
      mesh.rotation.y += (-a) * 0.10;

      const isFocused = (rowKind === "mid" && i === focusedIndex);
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

    // --- input -> velocity ---
    vel += impulse;
    impulse *= Math.pow(IMPULSE_DECAY, dt * 60);

    // clamp speed
    vel = clamp(vel, -V_MAX, V_MAX);

    // inertia damping
    vel *= Math.pow(DAMPING, dt * 60);

    // subtle drift
    vel += AUTO_DRIFT;

    // --- snap logic ---
    const snap = nearestSnapTarget();
    focusedIndex = snap.index;

    const canSnap = (!down && Math.abs(vel) < SNAP_THRESHOLD);
    if (canSnap) {
      const dist = (snap.target - scrollPos);
      // spring to target (no bounce)
      vel += dist * SNAP_STRENGTH;
      vel *= Math.pow(SNAP_DAMP, dt * 60);
    }

    // integrate
    scrollPos += vel;

    // --- camera parallax (very gentle) ---
    // smooth input itself (prevents "snappy" feel)
    mx = lerp(mx, mxT, 1 - Math.pow(0.965, dt * 60));
    my = lerp(my, myT, 1 - Math.pow(0.965, dt * 60));

    camX = lerp(camX, mx * 10, 1 - Math.pow(0.94, dt * 60)); // slower, cinematic
    camY = lerp(camY, my * 6, 1 - Math.pow(0.94, dt * 60)); // slower, cinematic

    // micro Y parallax based on speed (very subtle, museum feel)
    microY = lerp(microY, clamp(vel * 420, -8, 8), 1 - Math.pow(0.88, dt * 60));

    camera.position.set(camX, camY, CAM_Z);
    camera.lookAt(0, 0, 0);

    // row micro Y separation (tiny)
    rowTop.position.y = Y_TOP + (-microY * 0.6);   // top drifts slightly down
    rowBot.position.y = Y_BOT + ( microY * 0.6);   // bottom drifts slightly up
    rowMid.position.y = Y_MID;

    // update rows with parallax multipliers
    updateRow(rowMid, SPEED_MID, "mid");
    updateRow(rowBot, SPEED_BOT, "bot");
    updateRow(rowTop, SPEED_TOP, "top");

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------------- cleanup ----------------
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
