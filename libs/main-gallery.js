// libs/main-gallery.js
import * as THREE from "./three.module.js";
import { GALLERY_ITEMS } from "./data.js";

/**
 * Main gallery scene (Three.js, vanilla).
 * Goal: "inside a sphere" feel: 2 visible belts + 3rd hidden on top,
 * smooth/inertial scroll (slow), wider gaps, ~5 cards visible in the main belt.
 */
export function initMainGallery({ mountEl, overlayEl } = {}) {
  if (!mountEl) throw new Error("initMainGallery: mountEl is required");

  // ---- Hide overlay title/text (requested) ----
  if (overlayEl) overlayEl.style.display = "none";

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);

  // ---------- scene / camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    40, // narrower FOV => fewer cards visible
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    2000
  );
  const CAMERA_BASE = new THREE.Vector3(0, 0, 430);
  camera.position.copy(CAMERA_BASE);

  // Soft ambient (subtle) so cards never "disappear"
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  // ---------- tuning (the important part) ----------
  // Card sizing
  const CARD_W = 140;
  const CARD_H = 92;
  const CARD_THICK = 0.2;

  // Arc / spacing: larger GAP => more distance between cards
  const GAP = 34;

  // Cylinder/sphere-ish radius (bigger radius + smaller FOV => "inside sphere")
  const R = 360;

  // STEP in radians derived from desired arc length (width + gap)
  const STEP = (CARD_W + GAP) / R;

  // Number of cards around 360°. +1 for overlap (avoids micro-gaps)
  const PER = Math.ceil((Math.PI * 2) / STEP) + 1;

  // Belts positions (Y) and their local radius offsets (small variation helps depth)
  const BELTS = [
    { y: 105, r: R * 0.98, phase: 0.0 }, // top (will be hidden/revealed)
    { y: 0, r: R, phase: 0.35 },         // middle (main belt)
    { y: -110, r: R * 1.02, phase: 0.70 } // bottom
  ];

  // Speed / inertia (SLOW, cinematic)
  const AUTO_DRIFT = 0.00015;     // constant slow movement
  const WHEEL_TO_VEL = 0.00022;   // smaller = slower wheel response
  const DRAG_TO_VEL = 0.00065;    // pointer drag response
  const FRICTION = 0.92;          // closer to 1 = longer glide, softer
  const MAX_VEL = 0.035;          // cap sharp spikes
  const PARALLAX_X = 12;          // camera parallax in 3D units
  const PARALLAX_Y = 8;

  // ---------- belt builder ----------
  const cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

  function makeCardMaterial(hex) {
    // IMPORTANT: keep opaque (cards were "invisible" when transparent)
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex),
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
  }

  function buildBelt(seed = 0) {
    const g = new THREE.Group();

    for (let i = 0; i < PER; i++) {
      // If your data.js has images later — we can swap material to textures.
      // For now: color cards (visible always).
      const item =
        GALLERY_ITEMS?.[(i + seed) % (GALLERY_ITEMS?.length || 1)];

      const color =
        item?.color ||
        ["#5bb7a5", "#8b74d9", "#e2b55b", "#6fa2d9", "#d88b7b"][(i + seed) % 5];

      const mesh = new THREE.Mesh(cardGeo, makeCardMaterial(color));
      mesh.renderOrder = 1;

      // tiny thickness illusion: an extra back plane slightly behind
      const back = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W, CARD_H),
        new THREE.MeshBasicMaterial({
          color: 0x0b1020,
          transparent: true,
          opacity: 0.15,
          side: THREE.DoubleSide,
        })
      );
      back.position.z = -CARD_THICK;
      mesh.add(back);

      g.add(mesh);
    }

    scene.add(g);
    return g;
  }

  const beltGroups = BELTS.map((b, idx) => ({
    cfg: { ...b },
    group: buildBelt(idx * 7),
  }));

  // Start with top belt hidden above, like 100lostspecies
  const TOP_HIDDEN_Y = 240;
  beltGroups[0].cfg._yShown = BELTS[0].y;
  beltGroups[0].cfg._yHidden = TOP_HIDDEN_Y;
  beltGroups[0].cfg._reveal = 0; // 0..1
  beltGroups[0].cfg.y = TOP_HIDDEN_Y;

  // ---------- input state ----------
  let mouseN = new THREE.Vector2(0, 0);

  let scrollPos = 0; // "phase" space (radians)
  let scrollVel = 0;

  let isDown = false;
  let lastX = 0;
  let lastY = 0;

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function onMouseMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    mouseN.set((x - 0.5) * 2, (0.5 - y) * 2);
  }
  window.addEventListener("mousemove", onMouseMove, { passive: true });

  // Wheel — slow inertial add
  window.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault?.();

      // Normalize delta
      const d = clamp(e.deltaY, -120, 120);
      scrollVel += d * WHEEL_TO_VEL;
      scrollVel = clamp(scrollVel, -MAX_VEL, MAX_VEL);
    },
    { passive: false }
  );

  // Pointer drag — also slow, plus reveal top belt on drag-up
  window.addEventListener(
    "pointerdown",
    (e) => {
      isDown = true;
      lastX = e.clientX;
      lastY = e.clientY;
    },
    { passive: true }
  );

  window.addEventListener(
    "pointermove",
    (e) => {
      if (!isDown) return;

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      // Horizontal drag -> scroll (soft)
      scrollVel += -dx * DRAG_TO_VEL * 0.001;
      scrollVel = clamp(scrollVel, -MAX_VEL, MAX_VEL);

      // Drag up reveals top belt (0..1)
      const top = beltGroups[0].cfg;
      top._reveal = clamp(top._reveal + -dy * 0.002, 0, 1);
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerup",
    () => {
      isDown = false;
    },
    { passive: true }
  );

  // ---------- layout update ----------
  function updateBelt(group, cfg, phase) {
    // phase is in radians: makes it feel infinite (rotating cylinder)
    for (let i = 0; i < group.children.length; i++) {
      const m = group.children[i];

      const a = i * STEP + phase + cfg.phase;
      const x = Math.sin(a) * cfg.r;
      const z = Math.cos(a) * cfg.r;

      m.position.set(x, cfg.y, z);

      // face inward toward camera origin (inside-sphere vibe)
      m.lookAt(0, cfg.y, 0);

      // subtle depth cue: cards fade a bit when behind (never invisible)
      const behind = z < 0 ? 1 : 0;
      const alpha = behind ? 0.55 : 0.95;

      if (m.material && m.material.opacity !== alpha) {
        m.material.transparent = true;
        m.material.opacity = alpha;
      }
    }
  }

  // ---------- main loop ----------
  function tick() {
    // Auto drift
    scrollVel += AUTO_DRIFT;

    // Inertia / friction
    scrollVel *= FRICTION;
    scrollVel = clamp(scrollVel, -MAX_VEL, MAX_VEL);
    scrollPos += scrollVel;

    // Top belt returns softly when not dragging
    const top = beltGroups[0].cfg;
    if (!isDown) top._reveal *= 0.94;
    top.y = THREE.MathUtils.lerp(top._yHidden, top._yShown, top._reveal);

    // Camera parallax (very important)
    const tx = CAMERA_BASE.x + mouseN.x * PARALLAX_X;
    const ty = CAMERA_BASE.y + mouseN.y * PARALLAX_Y;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, tx, 0.08);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, ty, 0.08);
    camera.lookAt(0, 0, 0);

    // Update belts: different speed factors mimic layered motion
    updateBelt(beltGroups[1].group, beltGroups[1].cfg, scrollPos * 1.0);  // main
    updateBelt(beltGroups[2].group, beltGroups[2].cfg, scrollPos * 0.92); // slightly slower
    updateBelt(beltGroups[0].group, beltGroups[0].cfg, scrollPos * 1.08); // slightly faster

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------- resize ----------
  function onResize() {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  return {
    destroy() {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
