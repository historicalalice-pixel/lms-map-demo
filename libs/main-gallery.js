// libs/main-gallery.js
// Curved 3D gallery belts (inside-a-cylinder vibe)
// - Wheel: slow drift with inertia
// - Drag: steer (yaw)
// - Drag UP: reveals 3rd belt

import * as THREE from "./three.module.js";

const TAU = Math.PI * 2;

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function wrapSignedPi(angle) {
  // map any angle to [-pi, +pi]
  let a = (angle + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function makeCard({ w, h, color, opacity = 0.92 }) {
  const group = new THREE.Group();

  // subtle frame
  const frameGeo = new THREE.PlaneGeometry(w + 10, h + 10);
  const frameMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.z = -0.2;
  group.add(frame);

  // card plane
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  // expose materials for fading
  group.userData._cardMat = mat;
  group.userData._frameMat = frameMat;

  return group;
}

export function initMainGallery({ mountEl }) {
  if (!mountEl) throw new Error("initMainGallery: mountEl is required");

  // clean mount
  mountEl.innerHTML = "";

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true, // allow CSS background
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setClearColor(0x000000, 0); // transparent
  mountEl.appendChild(renderer.domElement);

  // ---------- scene / camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    3000
  );
  // camera INSIDE the cylinder
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, 1);

  // ---------- gallery params (tweak here) ----------
  const R = 520; // cylinder radius
  const CARD_W = 220;
  const CARD_H = 140;
  const GAP = 28; // distance between cards (arc length)
  const STEP = (CARD_W + GAP) / R; // radians between cards
  const COUNT = Math.ceil(TAU / STEP) + 2; // enough to wrap seamlessly

  const BELT_Y = [-80, 0, 80]; // top will animate in
  const BELT_PHASE = [0.0, 0.9, 1.6]; // offsets so belts don't align

  // visibility / fade: keep about ~5 cards clearly visible
  const FADE_START = 1.05; // rad (start fading)
  const FADE_END = 1.65; // rad (nearly invisible)

  // motion tuning (cinematic, not twitchy)
  const AUTO_DRIFT = 0.00055; // rad/frame at 60fps (very slow)
  const WHEEL_SENS = 0.00022; // rad per wheel delta unit
  const DRAG_SENS = 0.0024; // rad per pixel
  const DAMPING = 0.92; // inertia damping (0.88..0.95)
  const MAX_VEL = 0.05; // safety clamp

  // parallax (very important feel)
  const PARALLAX_POS = 12; // px-ish in world units
  const PARALLAX_ROT_Y = 0.12; // radians
  const PARALLAX_ROT_X = 0.06;

  // ---------- belts ----------
  const belts = [];
  const palette = [0x5c78ff, 0x47d18b, 0xffc24a, 0xb57bff, 0xff6f91, 0x66c2ff];

  for (let b = 0; b < 3; b++) {
    const belt = new THREE.Group();
    belt.userData.baseY = BELT_Y[b];
    belt.userData.phase = BELT_PHASE[b];

    for (let i = 0; i < COUNT; i++) {
      const color = palette[(i + b * 2) % palette.length];
      const card = makeCard({ w: CARD_W, h: CARD_H, color });

      // small random tilt to avoid "too perfect" feel
      card.userData.tilt = (Math.random() - 0.5) * 0.10;

      belt.add(card);
    }

    scene.add(belt);
    belts.push(belt);
  }

  // third belt starts hidden ABOVE, then revealed by drag-up
  let reveal = 0; // 0..1
  let revealTarget = 0; // 0..1

  // ---------- input state ----------
  let yaw = 0;
  let vel = 0;

  let mouseNX = 0;
  let mouseNY = 0;

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  function onWheel(e) {
    // stop page scroll
    e.preventDefault();
    // keep it gentle: accumulate into velocity (inertia)
    vel += e.deltaY * WHEEL_SENS;
    vel = clamp(vel, -MAX_VEL, MAX_VEL);
  }

  function onPointerDown(e) {
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouseNX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    if (!dragging) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    // horizontal steer
    vel += dx * DRAG_SENS * 0.00065; // pixels -> small angular velocity
    vel = clamp(vel, -MAX_VEL, MAX_VEL);

    // drag UP reveals 3rd belt
    if (dy < 0) {
      revealTarget = clamp((-dy) / 280, 0, 1);
    } else {
      revealTarget = 0;
    }
  }

  function onPointerUp(e) {
    dragging = false;
    revealTarget = 0;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
  }

  // attach listeners (use {passive:false} for wheel)
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  // resize
  function onResize() {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  // ---------- animation loop ----------
  let rafId = 0;
  function tick() {
    rafId = requestAnimationFrame(tick);

    // slow auto drift + inertia
    vel += AUTO_DRIFT;
    vel *= DAMPING;
    vel = clamp(vel, -MAX_VEL, MAX_VEL);
    yaw += vel;

    // smooth reveal (no snapping)
    reveal += (revealTarget - reveal) * 0.08;

    // parallax camera (subtle)
    camera.position.x = mouseNX * PARALLAX_POS;
    camera.position.y = mouseNY * (PARALLAX_POS * 0.65);
    camera.position.z = 0;

    camera.rotation.y = -mouseNX * PARALLAX_ROT_Y;
    camera.rotation.x = mouseNY * PARALLAX_ROT_X;

    // update belts + cards
    for (let b = 0; b < belts.length; b++) {
      const belt = belts[b];
      const isTop = b === 0;

      const targetY = belt.userData.baseY + (isTop ? (1 - reveal) * 170 : 0);
      belt.position.y += (targetY - belt.position.y) * 0.12;

      const phase = belt.userData.phase;
      const children = belt.children;

      for (let i = 0; i < children.length; i++) {
        const card = children[i];

        // angle around the cylinder
        const theta = i * STEP + yaw + phase;
        const x = Math.sin(theta) * R;
        const z = Math.cos(theta) * R;

        card.position.set(x, belt.position.y, z);

        // face inward (towards camera), keep a small tilt
        card.lookAt(camera.position.x, belt.position.y, camera.position.z);
        card.rotation.z += card.userData.tilt;

        // fade by how far from the front
        const a = Math.abs(wrapSignedPi(theta));
        const fade = smoothstep(FADE_START, FADE_END, a); // 0..1
        const alpha = 0.92 * (1 - fade);

        card.userData._cardMat.opacity = alpha;
        card.userData._frameMat.opacity = 0.22 * (1 - fade);

        // small scale pop for center cards (adds depth)
        const pop = 1 + (1 - fade) * 0.06;
        card.scale.set(pop, pop, 1);
      }
    }

    renderer.render(scene, camera);
  }

  tick();

  return {
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);

      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
