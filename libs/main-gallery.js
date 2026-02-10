// libs/main-gallery.js
// Main 3-row curved gallery (100lostspecies-style vibe).
// - 3 belts on an "inside of a sphere" cylinder
// - endless loop
// - max ~4 cards visible in center row
// - smooth wheel + drag inertia (slow, cinematic)
// - top row: ~1/3 visible at rest, reveals more when dragging up

import * as THREE from "./three.module.js";
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl }) {
  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setClearColor(0x000000, 0); // transparent, we rely on page background
  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);

  // ---------- scene ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x060812, 140, 230);

  // lights: subtle, so cards stay readable
  const hemi = new THREE.HemisphereLight(0xbfd7ff, 0x0a0f1d, 0.85);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(80, 120, 90);
  scene.add(dir);

  // ---------- camera ----------
  // FOV + distance tuned so that the center belt shows about 4 cards at once.
  const camera = new THREE.PerspectiveCamera(
    52,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    700
  );

  // "we are inside the sphere": camera is a bit back, slightly down
  const CAM_Z = 95;
  camera.position.set(0, -4, CAM_Z);
  camera.lookAt(0, 0, 0);

  // ---------- gallery geometry ----------
  // Card size is in world units. Bigger => fewer fit on screen.
  const CARD_W = 28;
  const CARD_H = 18;

  // Arc radius of belts. Bigger radius => gentler curvature.
  const R = 92;

  // Gap along the belt (arc length). Bigger gap => fewer visible cards.
  // Tuned so the center row has ~4 visible.
  const GAP = 10;
  const STEP = CARD_W + GAP; // arc-length step per card

  // Rows Y positions:
  // - center row is on Y = 0
  // - bottom row is ~half visible
  // - top row is ~1/3 visible at rest, reveals more on drag-up
  const Y_CENTER = 0;
  const Y_BOTTOM = -26;
  const Y_TOP_REST = 24; // about 1/3 visible
  const Y_TOP_FULL = 14; // revealed position (more visible)

  // belt group
  const belts = new THREE.Group();
  scene.add(belts);

  // Materials: ensure visibility + no "transparent vanish"
  function makeCardMaterial(baseColor = 0xffffff) {
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.85,
      metalness: 0.08,
      transparent: true,
      opacity: 0.88,
    });
  }

  // A simple "poster card" using CanvasTexture (so you can later draw title/thumb).
  // For now it draws: title + subtitle + soft vignette.
  function makeCardTexture(title, subtitle, accent = "#bcd3ff") {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext("2d");

    // background
    g.fillStyle = "rgba(7,10,20,1)";
    g.fillRect(0, 0, c.width, c.height);

    // subtle gradient + vignette
    const rg = g.createRadialGradient(260, 220, 30, 260, 260, 360);
    rg.addColorStop(0, "rgba(90,170,255,0.30)");
    rg.addColorStop(1, "rgba(0,0,0,0.80)");
    g.fillStyle = rg;
    g.fillRect(0, 0, c.width, c.height);

    // frame
    g.strokeStyle = "rgba(232,238,252,0.18)";
    g.lineWidth = 6;
    g.strokeRect(22, 22, c.width - 44, c.height - 44);

    // title
    g.fillStyle = "rgba(232,238,252,0.92)";
    g.font = "600 42px Inter, system-ui, -apple-system, Segoe UI, Arial";
    g.fillText(title, 46, 92);

    // subtitle
    g.fillStyle = "rgba(232,238,252,0.62)";
    g.font = "400 26px Inter, system-ui, -apple-system, Segoe UI, Arial";
    g.fillText(subtitle, 46, 132);

    // accent blob
    g.globalAlpha = 0.9;
    g.fillStyle = accent;
    g.beginPath();
    g.ellipse(300, 320, 155, 115, -0.35, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    // (якщо у твоїй three.module.js нема SRGBColorSpace — можна просто прибрати цей рядок)
    if ("SRGBColorSpace" in THREE) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeCardMesh(card) {
    const geom = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

    // texture + material
    const tex = makeCardTexture(card.title, card.subtitle, card.accent || "#bcd3ff");
    const mat = makeCardMaterial();
    mat.map = tex;
    mat.emissive = new THREE.Color(0x0b1022);
    mat.emissiveIntensity = 0.22;

    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData.card = card;
    return mesh;
  }

  // Create one belt with N cards, positioned by arc length.
  function createBelt({ y, phase = 0, count = 28 }) {
    const group = new THREE.Group();
    group.userData = { y, phase, count };

    // pick cards cyclically from data
    for (let i = 0; i < count; i++) {
      const card = GALLERY_ITEMS[i % GALLERY_ITEMS.length] || {
        title: `Картка ${i + 1}`,
        subtitle: `Модуль / Епізод`,
      };
      const mesh = makeCardMesh(card);
      mesh.userData.i = i;
      group.add(mesh);

      // subtle border plane behind (depth cue)
      const border = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W + 1.2, CARD_H + 1.2),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.08,
        })
      );
      border.position.z = -0.05;
      mesh.add(border);
    }

    belts.add(group);
    return group;
  }

  const beltMid = createBelt({ y: Y_CENTER, phase: 0.0, count: 28 });
  const beltBot = createBelt({ y: Y_BOTTOM, phase: 0.6, count: 28 });
  const beltTop = createBelt({ y: Y_TOP_REST, phase: 1.2, count: 28 });

  // ---------- motion state ----------
  // We move along the belt by arc length (world units), then convert to angle.
  let scroll = 0; // arc-length position
  let vel = 0; // arc-length velocity
  let targetVel = 0; // input accumulator (smoothed into vel)

  // Parallax (camera offset)
  const mouse = { x: 0, y: 0 };
  let parallaxX = 0;
  let parallaxY = 0;

  // Drag
  let isDown = false;
  let lastX = 0;
  let lastY = 0;
  let revealBoost = 0; // 0..1 (from drag-up)
  let revealBoostTarget = 0;

  // ---------- input ----------
  function onWheel(e) {
    // smaller = slower (cinematic)
    const delta = e.deltaY || 0;

    // wheel is usually too aggressive on trackpads, so clamp
    const d = clamp(delta, -160, 160);

    // convert wheel delta to target velocity (arc-length units / frame)
    // IMPORTANT: very small coefficient for slow movement
    targetVel += d * 0.006;

    e.preventDefault?.();
  }

  function onPointerDown(e) {
    isDown = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onPointerMove(e) {
    const rect = mountEl.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;

    if (!isDown) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    // Horizontal drag: scroll (slow)
    targetVel += -dx * 0.10;

    // Vertical drag-up reveals top row
    revealBoostTarget = clamp((-dy) / 220, 0, 1);
  }

  function onPointerUp() {
    isDown = false;
    revealBoostTarget = 0;
  }

  // passive:false to allow preventDefault for wheel.
  mountEl.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  // ---------- layout update ----------
  function placeBelt(group, y, phase, localScroll, speedMul) {
    group.position.y = y;

    const count = group.children.length;
    const TWO_PI = Math.PI * 2;

    for (let k = 0; k < count; k++) {
      const mesh = group.children[k];
      if (!mesh.isMesh) continue;

      const i = mesh.userData.i || 0;

      // arc-length position (wrap to 0..2π by angle modulo)
      const s = i * STEP + phase * STEP * 6 + localScroll * speedMul;
      const ang = (s / R) % TWO_PI;

      // "inside cylinder": cards sit on the inner surface (negative z)
      const x = Math.sin(ang) * R;
      const z = -Math.cos(ang) * R;

      mesh.position.set(x, 0, z);

      // Billboard: face the camera, but keep a tiny tilt for depth
      mesh.lookAt(camera.position.x, camera.position.y, camera.position.z);
      mesh.rotation.z += Math.sin(ang * 2) * 0.03;

      // Opacity: keep visible even on sides/back (no disappearing)
      const front = clamp(((-z) / R + 1) / 2, 0, 1); // 0..1
      mesh.material.opacity = lerp(0.55, 0.95, front);

      // Slight scale emphasis near center
      const scale = lerp(0.92, 1.04, Math.pow(front, 1.4));
      mesh.scale.setScalar(scale);
    }
  }

  // ---------- animate ----------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;

    // Smooth input -> velocity
    // targetVel decays quickly so it behaves like impulses from wheel/drag
    targetVel *= Math.pow(0.20, dt * 60);
    vel = lerp(vel, vel + targetVel, 1 - Math.pow(0.70, dt * 60));

    // Inertia damping (stronger => slower stop)
    vel *= Math.pow(0.88, dt * 60);

    // Integrate
    scroll += vel * dt;

    // Parallax: gentle, not "camera flying away"
    parallaxX = lerp(parallaxX, mouse.x * 10, 1 - Math.pow(0.90, dt * 60));
    parallaxY = lerp(parallaxY, -mouse.y * 6, 1 - Math.pow(0.90, dt * 60));
    camera.position.x = parallaxX;
    camera.position.y = -4 + parallaxY;

    // Top row reveal smoothing (rest: partial)
    revealBoost = lerp(revealBoost, revealBoostTarget, 1 - Math.pow(0.85, dt * 60));
    const reveal = Math.max(0.33, revealBoost); // keep at least 1/3 visible
    const topY = lerp(Y_TOP_REST, Y_TOP_FULL, reveal);

    camera.lookAt(0, 0, 0);

    // Place belts (slightly different speed => depth)
    placeBelt(beltMid, Y_CENTER, 0.0, scroll, 1.0);
    placeBelt(beltBot, Y_BOTTOM, 0.8, scroll, 0.92);
    placeBelt(beltTop, topY, 1.6, scroll, 0.96);

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
      mountEl.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
