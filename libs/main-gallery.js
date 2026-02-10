// libs/main-gallery.js
import * as THREE from "./three.module.js";
// Припускаємо, що data.js експортує масив об'єктів, наприклад:
// export const galleryData = [ { title: "...", module: "...", episode: "...", color: 0x..., imageUrl? }, ... ];

export function initMainGallery({ mountEl, overlayEl }) {
  if (!mountEl) return { destroy: () => {} };

  mountEl.innerHTML = "";

  // ─── Renderer ───────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  mountEl.appendChild(renderer.domElement);

  // ─── Scene & Camera (Z фіксований!) ─────────────────────────
  const scene = new THREE.Scene();
  // scene.fog = new THREE.FogExp2(0x0a0e14, 0.00028); // опціонально — легкий туман

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 6000); // FOV поменше → менше карток видно
  const CAM_Z = 1480;
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  const world = new THREE.Group();
  scene.add(world);

  // ─── Tuning (головне — ≤4 картки в центрі) ──────────────────
  const CARD_W = 340;
  const CARD_H = 210;

  const RADIUS = 1180;               // чим більший → ширше дуга, менше карток в кадрі
  const ROW_GAP = 280;

  const rowsConfig = [
    { y: 0,       depthSpeed: 1.00, visibleFrac: 1.00, radiusMul: 1.00 }, // center
    { y: -ROW_GAP * 0.9, depthSpeed: 0.94, visibleFrac: 0.55, radiusMul: 1.04 }, // bottom
    { y: +ROW_GAP * 0.7, depthSpeed: 1.06, visibleFrac: 0.38, radiusMul: 0.96 }, // top
  ];

  const COUNT_VISIBLE ≈ 4.2;               // скільки хочемо бачити в центрі
  const STEP_ANGLE = (Math.PI * 2) / 26;   // ~26–28 позицій, але видно тільки ~4

  // ─── Input state ────────────────────────────────────────────
  const pointer = { x: 0, y: 0, down: false, lastX: 0, lastY: 0 };

  let scrollX = 0;           // основна позиція (горизонталь)
  let velocityX = 0;

  let liftY = 0;             // вертикальний зсув (reveal top row)
  let liftTarget = 0;
  let liftVelocity = 0;

  // ─── Cards (будемо використовувати пул + modulo для безкінечності) ──
  const rowGroups = [];
  const cardPool = [];

  // Функція створення однієї картки (повторно використовуємо)
  function createCard() {
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);

    // Простий матеріал (можна заміна на CanvasTexture або MeshStandardMaterial з текстурою)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x2a2f38,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Легка "рамка/glass"
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W + 24, CARD_H + 24),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.09,
        side: THREE.DoubleSide,
      })
    );
    frame.position.z = 0.3;
    mesh.add(frame);

    // Тут можна додати текст через CanvasTexture, але поки пропускаємо для прикладу

    return mesh;
  }

  // Створюємо достатньо карток у пул (≈ 3 × 30 = 90)
  for (let i = 0; i < 100; i++) {
    cardPool.push(createCard());
  }

  // ─── Створюємо 3 ряди ───────────────────────────────────────
  rowGroups.length = 0;
  rowsConfig.forEach((cfg, rowIdx) => {
    const group = new THREE.Group();
    group.position.y = cfg.y;
    world.add(group);

    const cardsInRow = [];
    for (let i = 0; i < 32; i++) {   // більше ніж видно, для безшовного циклу
      const mesh = cardPool.pop() || createCard();
      group.add(mesh);
      cardsInRow.push({
        mesh,
        baseAngle: i * STEP_ANGLE,
        dataIndex: (rowIdx * 1000 + i) % 128, // умовно — буде замінено реальними даними
      });
    }
    rowGroups.push({ group, cards: cardsInRow, config: cfg });
  });

  // ─── Input handlers ─────────────────────────────────────────
  function onPointerMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (pointer.down) {
      const dx = e.clientX - pointer.lastX;
      const dy = e.clientY - pointer.lastY;

      velocityX += dx * 0.00032;
      liftVelocity += dy * 0.0009;   // вертикальний вплив слабший

      pointer.lastX = e.clientX;
      pointer.lastY = e.clientY;
    }
  }

  function onDown(e) {
    pointer.down = true;
    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;
  }

  function onUp() {
    pointer.down = false;
  }

  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointercancel", onUp);

  // Wheel
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 140);
      velocityX += delta * 0.00022;
    },
    { passive: false }
  );

  // ─── Resize ─────────────────────────────────────────────────
  function resize() {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // ─── Animation loop ─────────────────────────────────────────
  let prevTime = performance.now();

  function animate(now) {
    const dt = Math.min((now - prevTime) / 1000, 0.04);
    prevTime = now;

    // ─── Фізика ───────────────────────────────────────────────
    const damping = Math.pow(0.84, dt * 60); // повільне затухання
    velocityX *= damping;
    velocityX += 0.00004; // легкий автодрейф (можна прибрати)

    scrollX += velocityX;

    // Вертикальний ліфт (пружинка)
    liftVelocity *= Math.pow(0.88, dt * 60);
    liftTarget = pointer.down ? liftTarget : 0; // повертаємо назад, коли відпустили
    liftY += (liftTarget - liftY) * (1 - Math.pow(0.92, dt * 60));
    liftY += liftVelocity;

    // Обмежуємо, щоб верхній ряд не виліз надто сильно
    liftY = THREE.MathUtils.clamp(liftY, -80, 140);

    // ─── Паралакс від миші (дуже легкий) ─────────────────────
    const parallaxX = pointer.x * 28;
    const parallaxY = pointer.y * -14 + liftY * 0.4;

    camera.position.x += (parallaxX - camera.position.x) * (1 - Math.pow(0.86, dt * 60));
    camera.position.y += (parallaxY - camera.position.y) * (1 - Math.pow(0.86, dt * 60));
    camera.position.z = CAM_Z;
    camera.lookAt(0, 0, 0);

    // ─── Оновлення рядів ──────────────────────────────────────
    rowGroups.forEach(({ cards, config }) => {
      const { depthSpeed, visibleFrac, radiusMul } = config;
      const rowScroll = scrollX * depthSpeed;

      cards.forEach((card) => {
        const angle = card.baseAngle + rowScroll;
        const normAngle = angle % (Math.PI * 2);
        if (normAngle < 0) normAngle += Math.PI * 2;

        const x = Math.sin(normAngle) * RADIUS * radiusMul;
        const z = Math.cos(normAngle) * RADIUS * radiusMul;

        card.mesh.position.set(x, 0, z);
        card.mesh.lookAt(0, 0, 0);

        // Visibility & scale (головний контроль — скільки видно)
        const frontness = (Math.cos(normAngle) + 1) * 0.5; // 0..1
        const vis = THREE.MathUtils.smoothstep(0.62, 0.94, frontness * visibleFrac);

        card.mesh.visible = vis > 0.03;
        card.mesh.material.opacity = THREE.MathUtils.lerp(0.08, 1.0, vis);
        const s = THREE.MathUtils.lerp(0.82, 1.08, vis);
        card.mesh.scale.set(s, s, 1);
      });
    });

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  // ─── Destroy ────────────────────────────────────────────────
  return {
    destroy() {
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      // wheel не знімаємо, бо passive:false — але можна додати remove

      renderer.dispose();
      scene.clear();
      mountEl.innerHTML = "";
    },
  };
}