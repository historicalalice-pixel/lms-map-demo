// libs/main-gallery.js
import * as THREE from "./three.module.js";

export function initMainGallery({ mountEl }) {
  mountEl.innerHTML = "";

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setClearColor(0x000000, 0);
  mountEl.appendChild(renderer.domElement);

  // ---------- scene ----------
  const scene = new THREE.Scene();

  // ---------- camera + rig (ВАЖЛИВО для паралаксу) ----------
  const camera = new THREE.PerspectiveCamera(
    60,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    5000
  );

  const cameraRig = new THREE.Group(); // yaw/pitch/roll живе тут
  scene.add(cameraRig);
  cameraRig.add(camera);

  // базова позиція камери (всередині "сфери")
  camera.position.set(0, 0, 260);
  camera.lookAt(0, 0, 0);

  // ---------- utils ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // dt-сумісне згладжування: t = 1 - exp(-k*dt)
  const smooth = (current, target, k, dt) => lerp(current, target, 1 - Math.exp(-k * dt));

  // ---------- mouse ----------
  const mouse = { x: 0, y: 0 }; // -1..1
  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mouse.x = (nx - 0.5) * 2;
    mouse.y = (ny - 0.5) * 2;
  }
  window.addEventListener("mousemove", onMouseMove);

  // ---------- inertia (крок 2) ----------
  let scrollPos = 0; // rad
  let scrollVel = 0; // rad/sec

  const INERTIA = {
    wheelImpulse: 0.0022,
    dragImpulse: 0.0060,
    damping: 4.2,
    maxSpeed: 1.25,
    autoSpeed: 0.10,
  };

  function onWheel(e) {
    e.preventDefault();
    const d = clamp(e.deltaY, -140, 140);
    scrollVel += d * INERTIA.wheelImpulse;
    scrollVel = clamp(scrollVel, -INERTIA.maxSpeed, INERTIA.maxSpeed);
  }
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

  let dragging = false;
  let lastDragY = 0;

  function onPointerDown(e) {
    dragging = true;
    lastDragY = e.clientY;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const dy = e.clientY - lastDragY;
    lastDragY = e.clientY;

    scrollVel += dy * INERTIA.dragImpulse * 0.001;
    scrollVel = clamp(scrollVel, -INERTIA.maxSpeed, INERTIA.maxSpeed);
  }
  function onPointerUp(e) {
    dragging = false;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
  }
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  // ---------- belts/world ----------
  const world = new THREE.Group();
  scene.add(world);

  const R = 210;
  const PER = 26;
  const STEP = (Math.PI * 2) / PER;

  const CARD_W = 92;
  const CARD_H = 58;

  const palette = [
    0x9fd3ff, 0xb4ffd8, 0xd8b9ff, 0xffd2b0,
    0xbbe3ff, 0xc6ffd8, 0xf0c8ff, 0xffe1b8,
  ];

  function makeCard(i) {
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const mat = new THREE.MeshBasicMaterial({
      color: palette[i % palette.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  function createBelt(y, seed = 0) {
    const belt = new THREE.Group();
    belt.position.y = y;

    const cards = [];
    for (let i = 0; i < PER; i++) {
      const mesh = makeCard(i + seed);
      mesh.rotation.z = (Math.random() - 0.5) * 0.25;
      belt.add(mesh);

      cards.push({
        mesh,
        base: i * STEP,
        phase: Math.random() * 1000,
      });
    }

    world.add(belt);
    return { belt, cards };
  }

  const belt1 = createBelt(-46, 0);
  const belt2 = createBelt(10, 40);
  const belt3 = createBelt(66, 90);

  function updateBelt(B, t, scroll, radius) {
    for (const c of B.cards) {
      const a = c.base + scroll;

      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;

      const wob = Math.sin(t * 0.9 + c.phase) * 2.0;

      c.mesh.position.set(x, wob, z);
      c.mesh.lookAt(0, 0, 0);

      const front = (z / radius + 1) * 0.5; // 0..1
      const s = lerp(0.86, 1.34, front);
      c.mesh.scale.set(s, s, 1);

      c.mesh.material.opacity = lerp(0.22, 0.98, front);
    }
  }

  // ---------- PARALLAX (крок 3) ----------
  // Це тюнінг “як всередині сфери”
  const PARALLAX = {
    // кути (в радіанах): чим менше — тим стриманіше
    maxYaw: 0.18,     // ~10°
    maxPitch: 0.12,   // ~7°
    maxRoll: 0.06,    // ~3.4°

    // dolly: наскільки “плаває” Z від миші/швидкості
    dollyMouse: 16,   // px-ish у world units
    dollySpeed: 10,   // залежність від scrollVel

    // згладжування
    follow: 7.5,      // 6..10
  };

  // поточні стани рига
  let rigYaw = 0;
  let rigPitch = 0;
  let rigRoll = 0;
  let camZ = 260; // базова Z

  // ---------- animate ----------
  let last = performance.now();

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    // ---- інерція ----
    scrollVel += INERTIA.autoSpeed * dt;
    scrollVel *= Math.exp(-INERTIA.damping * dt);
    scrollVel = clamp(scrollVel, -INERTIA.maxSpeed, INERTIA.maxSpeed);
    scrollPos += scrollVel;

    // ---- ПАРАЛАКС / КАМЕРА (головне) ----
    // yaw: миша вправо => дивимось трохи вправо (поворот рига)
    const targetYaw = mouse.x * PARALLAX.maxYaw;

    // pitch: миша вверх => дивимось трохи вверх (інвертуємо y)
    const targetPitch = -mouse.y * PARALLAX.maxPitch;

    // roll: легкий нахил — як від “інерції погляду”
    // додаємо трохи від scrollVel, щоб відчувалась “масса”
    const targetRoll =
      (-mouse.x * PARALLAX.maxRoll * 0.65) +
      clamp(scrollVel, -1, 1) * PARALLAX.maxRoll * 0.35;

    // dolly: миша вверх/вниз + швидкість дають легке “занурення”
    const targetCamZ =
      260 +
      (mouse.y * PARALLAX.dollyMouse) +
      (-Math.abs(scrollVel) * PARALLAX.dollySpeed);

    // згладжуємо все dt-сумісно
    rigYaw = smooth(rigYaw, targetYaw, PARALLAX.follow, dt);
    rigPitch = smooth(rigPitch, targetPitch, PARALLAX.follow, dt);
    rigRoll = smooth(rigRoll, targetRoll, PARALLAX.follow, dt);
    camZ = smooth(camZ, targetCamZ, PARALLAX.follow, dt);

    cameraRig.rotation.set(rigPitch, rigYaw, rigRoll);
    camera.position.z = camZ;

    // дивимось в центр (можна потім змістити target для ще “живішого” ефекту)
    camera.lookAt(0, 0, 0);

    // ---- оновлюємо пояси ----
    updateBelt(belt1, t, scrollPos * 1.0, R);
    updateBelt(belt2, t, scrollPos * 0.86 + 1.4, R + 18);
    updateBelt(belt3, t, scrollPos * 0.92 + 2.7, R + 32);

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
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
