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

  // ---------- scene / camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    5000
  );

  camera.position.set(0, 0, 260);
  camera.lookAt(0, 0, 0);

  // ---------- utils ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- interaction state ----------
  const mouse = { x: 0, y: 0 };

  // scrollPos — кут (радіани) для прокрутки стрічок
  let scrollPos = 0;

  // scrollVel — швидкість (радіани/сек)
  let scrollVel = 0;

  // ТЮНІНГ ІНЕРЦІЇ (основне)
  const INERTIA = {
    // наскільки wheel/drag додає імпульс
    wheelImpulse: 0.0022,   // було швидко — тут повільніше
    dragImpulse:  0.0060,   // drag сильніший за wheel

    // затухання: більше => швидше зупиняється
    damping: 4.2,           // 3..6 норм

    // max швидкість (рад/сек)
    maxSpeed: 1.25,

    // дуже повільний авто-дрифт (рад/сек)
    autoSpeed: 0.10,
  };

  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mouse.x = (nx - 0.5) * 2;
    mouse.y = (ny - 0.5) * 2;
  }
  window.addEventListener("mousemove", onMouseMove);

  // wheel -> додаємо імпульс у швидкість
  function onWheel(e) {
    e.preventDefault();

    // нормалізуємо і обмежуємо піки (трекпад може давати дикі значення)
    const d = clamp(e.deltaY, -140, 140);

    // знак: wheel вниз = рух “вперед” (як було)
    scrollVel += d * INERTIA.wheelImpulse;
    scrollVel = clamp(scrollVel, -INERTIA.maxSpeed, INERTIA.maxSpeed);
  }
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

  // drag (перетягування мишкою) -> теж імпульс
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

    // dy вниз => рух вперед, тому +dy
    scrollVel += dy * INERTIA.dragImpulse * 0.001; // px -> рад/сек імпульс
    scrollVel = clamp(scrollVel, -INERTIA.maxSpeed, INERTIA.maxSpeed);
  }
  function onPointerUp(e) {
    dragging = false;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  // ---------- belts ----------
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
      depthWrite: false, // щоб “прозорість” не вбивала порядок
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

  // ---------- animate ----------
  let last = performance.now();

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    // 1) базовий дуже повільний рух (як “живий” фон)
    scrollVel += INERTIA.autoSpeed * dt;

    // 2) затухання (експоненційне) — головний “філ”
    // scrollVel *= exp(-damping * dt)
    scrollVel *= Math.exp(-INERTIA.damping * dt);

    // 3) clamp швидкості (без стрибків)
    scrollVel = clamp(scrollVel, -INERTIA.maxSpeed, INERTIA.maxSpeed);

    // 4) інтегруємо позицію (рад)
    scrollPos += scrollVel;

    // ---- паралакс камери (не чіпаємо інерцію) ----
    const camX = mouse.x * 18;
    const camY = -mouse.y * 10;
    const k = 1 - Math.exp(-10 * dt); // плавність
    camera.position.x = lerp(camera.position.x, camX, k);
    camera.position.y = lerp(camera.position.y, camY, k);
    camera.lookAt(0, 0, 0);

    // різні швидкості поясів
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
