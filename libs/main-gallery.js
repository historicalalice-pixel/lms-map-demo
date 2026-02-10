// libs/main-gallery.js
import * as THREE from "./three.module.js";
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl }) {
  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true, // transparent over your CSS background
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight, false);
  renderer.setClearAlpha(0);
  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);

  // ---------- Scene / Camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    200
  );
  camera.position.set(0, 0.2, 0); // inside the "sphere/cylinder" feeling
  scene.add(camera);

  // Lights (subtle)
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(3, 6, 4);
  scene.add(dir);

  // ---------- Parameters ----------
  const R = 16.5;              // radius of the belts (bigger -> further)
  const CARD_W = 3.6;          // card width
  const CARD_H = 2.2;          // card height
  const COUNT_PER_BELT = 42;   // more cards = denser + feels infinite
  const GAP = 0.55;            // angle gap "feel" (handled by count + radius)

  // 2 visible belts + 1 hidden top belt
  const BELTS = [
    { y: -3.2, baseSpeed: 0.0024, visible: true,  hidden: false }, // lower
    { y:  0.0, baseSpeed: 0.0018, visible: true,  hidden: false }, // middle
    { y:  6.4, baseSpeed: 0.0016, visible: false, hidden: true  }, // top hidden
  ];

  // ---------- Texture helper ----------
  function makeCardTexture({ title, subtitle }, accent = "#94a3b8") {
    const W = 512;
    const H = 320;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");

    // background
    ctx.fillStyle = "rgba(10,12,20,0.75)";
    ctx.fillRect(0, 0, W, H);

    // subtle border
    ctx.strokeStyle = "rgba(232,238,252,0.14)";
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    // accent bar
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(10, 10, 8, H - 20);
    ctx.globalAlpha = 1;

    // text
    ctx.fillStyle = "rgba(232,238,252,0.92)";
    ctx.font = "600 34px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(title || "Картка", 38, 110);

    ctx.fillStyle = "rgba(232,238,252,0.62)";
    ctx.font = "400 22px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(subtitle || "Модуль / Епізод", 38, 150);

    // tiny footer
    ctx.fillStyle = "rgba(232,238,252,0.35)";
    ctx.font = "400 16px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("LMS • Gallery", 38, H - 48);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy?.() || 1, 8);
    tex.needsUpdate = true;
    return tex;
  }

  // ---------- Build belts ----------
  const belts = [];
  const materialCache = new Map();

  function getMat(item, i) {
    const key = `${item.id}-${i}`;
    if (materialCache.has(key)) return materialCache.get(key);

    const palette = ["#60a5fa", "#34d399", "#a78bfa", "#fbbf24", "#fb7185"];
    const tex = makeCardTexture(item, palette[i % palette.length]);

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
      opacity: 0.9,
    });

    materialCache.set(key, mat);
    return mat;
  }

  function buildBelt(beltIndex, cfg) {
    const group = new THREE.Group();
    group.position.y = cfg.y;

    const cards = [];
    for (let i = 0; i < COUNT_PER_BELT; i++) {
      const item = GALLERY_ITEMS[i % GALLERY_ITEMS.length];
      const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);
      const mesh = new THREE.Mesh(geo, getMat(item, i));
      mesh.userData = { item, i };
      group.add(mesh);
      cards.push(mesh);
    }

    scene.add(group);

    return {
      group,
      cards,
      offset: 0,        // angular offset
      vel: 0,           // angular velocity
      targetVel: 0,
      baseSpeed: cfg.baseSpeed,
      hidden: cfg.hidden,
      reveal: cfg.hidden ? 0 : 1, // 0..1 for top belt
    };
  }

  BELTS.forEach((cfg, idx) => {
    belts.push(buildBelt(idx, cfg));
  });

  // ---------- Interaction ----------
  let isDown = false;
  let lastX = 0;
  let lastY = 0;

  // overall “lift” controls hidden belt reveal
  let lift = 0;        // current
  let liftTarget = 0;  // target
  // scroll/drag adds speed impulse
  let impulse = 0;

  function onPointerDown(e) {
    isDown = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onPointerMove(e) {
    if (!isDown) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // horizontal drag => rotate belts
    impulse += dx * 0.0006;

    // drag up => reveal hidden belt
    liftTarget = THREE.MathUtils.clamp(liftTarget + (-dy) * 0.003, 0, 1);
  }
  function onPointerUp() {
    isDown = false;
  }

  // wheel => rotate belts (gentle)
  function onWheel(e) {
    // normalize wheel feel
    const d = THREE.MathUtils.clamp(e.deltaY, -120, 120);
    impulse += d * 0.00035;

    // also allow “up” wheel to slightly reveal
    if (d < 0) liftTarget = THREE.MathUtils.clamp(liftTarget + 0.06, 0, 1);
    if (d > 0) liftTarget = THREE.MathUtils.clamp(liftTarget - 0.04, 0, 1);
  }

  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("wheel", onWheel, { passive: true });

  // ---------- Layout update ----------
  function layoutBelt(belt, y, revealAlpha = 1) {
    const N = belt.cards.length;
    // more “infinite” feel: slight spacing variation via radius + count
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + belt.offset;

      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;

      const m = belt.cards[i];
      m.position.set(x, 0, z);

      // face inward (camera at center)
      m.lookAt(0, 0, 0);

      // subtle tilt so it feels like a ribbon
      m.rotation.y += Math.sin(a) * 0.12;

      // opacity for hidden belt reveal
      m.material.opacity = 0.88 * revealAlpha;
    }

    belt.group.position.y = y;
  }

  // ---------- Animation loop ----------
  let lastT = performance.now();

  function tick(t) {
    const dt = Math.min((t - lastT) / 16.6667, 2.0);
    lastT = t;

    // smooth lift (reveal)
    lift += (liftTarget - lift) * (0.08 * dt);

    // decay impulse smoothly
    impulse *= Math.pow(0.92, dt);

    // camera micro motion (very subtle, like inside a sphere)
    const camX = Math.sin(t * 0.00025) * 0.25;
    const camY = Math.cos(t * 0.00020) * 0.18;
    camera.position.x = camX;
    camera.position.y = 0.2 + camY;

    // belts update
    belts.forEach((belt, idx) => {
      // target velocity = base + impulse (different multiplier per belt)
      belt.targetVel = belt.baseSpeed + impulse * (idx === 1 ? 1.0 : 0.8);

      // smooth velocity
      belt.vel += (belt.targetVel - belt.vel) * (0.10 * dt);
      belt.offset += belt.vel * dt;

      // reveal top belt: move it down into view + fade in
      if (belt.hidden) {
        const yHidden = 6.4;
        const yShown = 3.0;
        const y = THREE.MathUtils.lerp(yHidden, yShown, lift);
        belt.reveal = lift;

        layoutBelt(belt, y, THREE.MathUtils.smoothstep(lift, 0, 1));
      } else {
        layoutBelt(belt, BELTS[idx].y, 1);
      }
    });

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  // ---------- Resize ----------
  function onResize() {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  // expose cleanup (optional)
  return () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("wheel", onWheel);
    renderer.dispose();
  };
}
