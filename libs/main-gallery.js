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

  // Ми "всередині" (камера в центрі, дивимось вперед у -Z)
  const camera = new THREE.PerspectiveCamera(
    55,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    5000
  );
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, -1);

  // ---------- state ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (current, target, lambda, dt) =>
    lerp(current, target, 1 - Math.exp(-lambda * dt));

  const mouse = { x: 0, y: 0 };
  let scrollVel = 0;
  let scrollPos = 0;

  // третя стрічка: показ при drag вверх
  let isDragging = false;
  let dragStartY = 0;
  let dragDeltaY = 0;
  let revealTarget = 0; // 0..1
  let reveal = 0;       // 0..1 (плавне)

  // ---------- interaction ----------
  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mouse.x = (nx - 0.5) * 2;
    mouse.y = (ny - 0.5) * 2;
  }
  window.addEventListener("mousemove", onMouseMove);

  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const d = clamp(e.deltaY, -160, 160);
      // повільніше + контрольованіше
      scrollVel += d * 0.00055;
    },
    { passive: false }
  );

  function onPointerDown(e) {
    isDragging = true;
    dragStartY = e.clientY;
    dragDeltaY = 0;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!isDragging) return;
    dragDeltaY = e.clientY - dragStartY; // вверх = від’ємне
    // тягнеш вверх => reveal росте
    revealTarget = clamp((-dragDeltaY) / 220, 0, 1);
  }
  function onPointerUp(e) {
    isDragging = false;
    dragStartY = 0;
    dragDeltaY = 0;
    revealTarget = 0; // відпустив => ховаємо назад
    renderer.domElement.releasePointerCapture?.(e.pointerId);
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerUp);
  renderer.domElement.addEventListener("mouseleave", () => {
    // щоб не зависало у стані drag
    isDragging = false;
    revealTarget = 0;
  });

  // ---------- world ----------
  const world = new THREE.Group();
  scene.add(world);

  // Параметри "сфери/циліндра"
  // Менший радіус => ближче, більше відчуття "всередині"
  const R = 185;

  // Кількість плиток на кільце (більше = щільніше)
  const COUNT = 44;
  const STEP = (Math.PI * 2) / COUNT;

  // Розміри плиток (більші)
  const CARD_W = 150;
  const CARD_H = 92;

  // Яскравість/видимість (без світла)
  const palette = [
    0x9fd3ff, 0xb4ffd8, 0xd8b9ff, 0xffd2b0,
    0xbbe3ff, 0xc6ffd8, 0xf0c8ff, 0xffe1b8,
  ];

  function makeCard(i) {
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: palette[i % palette.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // легкий нахил як “живий” дизайн (але не шалений)
    mesh.rotation.z = (Math.random() - 0.5) * 0.18;
    return mesh;
  }

  function createBelt(baseY, seed) {
    const belt = new THREE.Group();
    belt.position.y = baseY;

    const cards = [];
    for (let i = 0; i < COUNT; i++) {
      const mesh = makeCard(i + seed);
      belt.add(mesh);

      cards.push({
        mesh,
        base: i * STEP,
        wobPhase: Math.random() * 1000,
      });
    }

    world.add(belt);
    return { belt, cards, baseY };
  }

  // 2 видимі стрічки
  const beltA = createBelt(-34, 0);
  const beltB = createBelt(22, 60);

  // 3-тя: спочатку схована зверху
  const beltC = createBelt(120, 140);

  function updateBelt(B, t, scroll, radius, extraOpacity = 1) {
    for (const c of B.cards) {
      const a = c.base + scroll;

      // кільце навколо осі Y, фронт по -Z
      const x = Math.sin(a) * radius;
      const z = -Math.cos(a) * radius;

      // дуже легкий “дихаючий” wobble (не летить в сторону)
      const wob = Math.sin(t * 0.7 + c.wobPhase) * 1.4;

      c.mesh.position.set(x, wob, z);

      // Всередині: картка дивиться в центр (де камера)
      c.mesh.lookAt(0, c.mesh.position.y, 0);

      // front factor: ближче до фронту (z≈-radius) => більше/яскравіше
      const frontRaw = (-z) / radius;         // -1..1
      const front = clamp((frontRaw + 1) * 0.5, 0, 1); // 0..1

      const scale = lerp(0.78, 1.28, front);
      c.mesh.scale.set(scale, scale, 1);

      // видимість: тепер дати/плитки НЕ "ледве видно"
      const op = lerp(0.35, 0.95, front) * extraOpacity;
      c.mesh.material.opacity = op;
    }
  }

  // ---------- animation loop ----------
  let last = performance.now();

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    const t = now / 1000;

    // повільний автодрифт (дуже спокійно)
    scrollPos += 0.22 * dt;

    // інерція від колеса
    scrollVel *= Math.pow(0.80, dt * 60);
    scrollPos += scrollVel;

    // reveal третій стрічці (пружно/плавно)
    reveal = damp(reveal, revealTarget, 10, dt);

    // камера: легкий паралакс (щоб “живе”, але не їде в космос)
    const camX = mouse.x * 10;
    const camY = -mouse.y * 6;
    camera.position.x = damp(camera.position.x, camX, 8, dt);
    camera.position.y = damp(camera.position.y, camY, 8, dt);
    camera.position.z = 0;
    camera.lookAt(0, camera.position.y * 0.15, -1);

    // стрічки з різними швидкостями
    updateBelt(beltA, t, scrollPos * 1.0, R);
    updateBelt(beltB, t, scrollPos * 0.92 + 1.3, R + 14);

    // третя: з’являється зверху при drag (опускається + стає видимою)
    const yHidden = 120;
    const yShown = 76;
    beltC.belt.position.y = lerp(yHidden, yShown, reveal);
    updateBelt(beltC, t, scrollPos * 0.96 + 2.4, R + 26, lerp(0.0, 1.0, reveal));

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

      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);

      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
