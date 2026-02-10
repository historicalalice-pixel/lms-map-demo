// libs/main-gallery.js
import * as THREE from "./three.module.js";

export function initMainGallery({ mountEl }) {
  mountEl.innerHTML = "";

  // ---------------- Renderer ----------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  mountEl.appendChild(renderer.domElement);

  // ---------------- Scene / Camera ----------------
  const scene = new THREE.Scene();

  // Важливо: камера НЕ рухається по Z (щоб не було “віддаляємось”)
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 8000);

  // ---------------- World ----------------
  const world = new THREE.Group();
  scene.add(world);

  // ---------------- Layout tuning (те, що ти просив) ----------------
  // Хочемо максимум ~4 картки “читабельних” в центральному ряді.
  // Для цього робимо:
  // - великий радіус дуги (ширше)
  // - більші картки
  // - агресивний fade по краях (залишається 3-4 в центрі)
  const CARD_W = 320;
  const CARD_H = 200;

  const R_MAIN = 1050;            // радіус центральної “стрічки”
  const ROW_GAP = 230;            // відстань між рядами
  const ROWS_Y = [0, -ROW_GAP, +ROW_GAP]; // центр, низ, верх

  // Скільки карток “по колу”. Це впливає на “щільність”.
  // Більше => щільніше, менше => рідше. Тут підібрано під 4 в центрі.
  const COUNT_PER_ROW = 28;

  // Кутовий крок. Робимо крок більшим за “ідеальний”,
  // щоб між картками була відстань (ти просив більше дистанції).
  const baseStep = (Math.PI * 2) / COUNT_PER_ROW;
  const STEP = baseStep * 1.12;

  // Камера: стоїмо “всередині сфери”
  const CAM_Z = 1550; // фіксовано
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  // ---------------- Materials (завжди видно) ----------------
  const palette = [
    0x2b3a48, 0x355c7d, 0x3f7f6a, 0x7d5a6b, 0x8b7a3b,
    0x2a5d6f, 0x4d6b4f, 0x6c4d7a, 0x3a4a66, 0x4a6a73,
  ];

  function makeCardMaterial(i) {
    // Без світла, 100% видимість
    return new THREE.MeshBasicMaterial({
      color: palette[i % palette.length],
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false, // щоб не “з’їдало” альфою
    });
  }

  function makeCardMesh(i) {
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);
    const mat = makeCardMaterial(i);
    const mesh = new THREE.Mesh(geo, mat);

    // легкий “скляний” контур: ще одна площина трохи попереду
    const frameGeo = new THREE.PlaneGeometry(CARD_W + 20, CARD_H + 20);
    const frameMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.10,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = 0.2;
    mesh.add(frame);

    return mesh;
  }

  // ---------------- Rows ----------------
  function createRow(rowIndex, y) {
    const group = new THREE.Group();
    group.position.y = y;
    world.add(group);

    const cards = [];
    for (let i = 0; i < COUNT_PER_ROW; i++) {
      const mesh = makeCardMesh(i + rowIndex * 1000);
      group.add(mesh);

      cards.push({
        mesh,
        base: i * STEP,
        wobSeed: Math.random() * 1000,
      });
    }
    return { group, cards };
  }

  const rowCenter = createRow(0, ROWS_Y[0]);
  const rowBottom = createRow(1, ROWS_Y[1]);
  const rowTop = createRow(2, ROWS_Y[2]);

  // ---------------- Input (повільно + інерція) ----------------
  const mouse = { x: 0, y: 0 };
  let isDown = false;
  let lastX = 0;
  let lastY = 0;

  // “позиція” в куті та інерція
  let scrollPos = 0;     // поточний
  let scrollVel = 0;     // швидкість (інерція)

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mouse.x = (nx - 0.5) * 2;
    mouse.y = (ny - 0.5) * 2;

    if (isDown) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      // drag повільний (щоб не “рве”)
      scrollVel += dx * 0.00045;

      // маленький вплив вертикального драг (для “відчуття сфери”)
      // НЕ рухаємо камеру по Z, лише трохи Y-таргет
      camParallaxTargetY += -dy * 0.015;
      camParallaxTargetY = clamp(camParallaxTargetY, -18, 18);
    }
  }

  function onDown(e) {
    isDown = true;
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onUp() {
    isDown = false;
  }

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onDown);
  window.addEventListener("mouseup", onUp);

  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      // дуже повільно (ти просив)
      const d = clamp(e.deltaY, -120, 120);
      scrollVel += d * 0.00028;
    },
    { passive: false }
  );

  // ---------------- Camera parallax (дуже легкий) ----------------
  let camParallaxY = 0;
  let camParallaxTargetY = 0;

  // ---------------- Row update ----------------
  function updateRow(row, t, scroll, radius, yIndex) {
    for (const c of row.cards) {
      const a = c.base + scroll;

      // Позиція на циліндрі/сфері
      const x = Math.sin(a) * radius;
      const z = Math.cos(a) * radius;

      // Дуже легкий “живий” wobble, але без хаосу
      const wob = Math.sin(t * 0.6 + c.wobSeed) * 2.0;
      c.mesh.position.set(x, wob, z);

      // Повертаємо картку до центру (ефект “всередині сфери”)
      c.mesh.lookAt(0, 0, 0);

      // ---------------- Visibility control (ключ під “4 картки”) ----------------
      // front = 1 коли прямо перед камерою (z позитивний, cos(a) близько 1)
      const front = (z / radius + 1) * 0.5; // 0..1

      // Агресивно фейдимо боки, щоб в центрі було ~3-4
      const vis = smoothstep(0.55, 0.92, front);

      // Трохи масштабуємо ближчі
      const s = lerp(0.78, 1.06, vis);
      c.mesh.scale.set(s, s, 1);

      // Прозорість
      c.mesh.material.opacity = lerp(0.05, 0.92, vis);

      // Додатково: дальні картки майже зникають
      c.mesh.visible = vis > 0.02;
    }
  }

  // ---------------- Resize ----------------
  function resize() {
    const w = mountEl.clientWidth || window.innerWidth;
    const h = mountEl.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------- Animate ----------------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    const t = now / 1000;

    // інерція повільна/плавна
    // менше = довше котиться, більше = швидше зупиняється
    const damping = Math.pow(0.80, dt * 60);
    scrollVel *= damping;

    // автодрифт ледь-ледь (як на сайті, майже не помітно)
    scrollVel += 0.00008;

    scrollPos += scrollVel;

    // паралакс (лише X/Y), Z не змінюємо
    const targetX = mouse.x * 22;
    const targetY = -mouse.y * 10 + camParallaxTargetY;

    camera.position.x = lerp(camera.position.x, targetX, 1 - Math.pow(0.88, dt * 60));
    camParallaxY = lerp(camParallaxY, targetY, 1 - Math.pow(0.88, dt * 60));
    camera.position.y = camParallaxY;

    camera.position.z = CAM_Z;
    camera.lookAt(0, 0, 0);

    // Ряди: центр, низ (половина видно), верх (третина видно)
    updateRow(rowCenter, t, scrollPos * 1.00, R_MAIN, 0);
    updateRow(rowBottom, t, scrollPos * 0.98 + 0.9, R_MAIN + 40, 1);
    updateRow(rowTop,    t, scrollPos * 1.02 + 1.7, R_MAIN + 80, 2);

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    destroy() {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
