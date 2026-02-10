// libs/main-gallery.js
import * as THREE from "./three.module.js";
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl, overlayEl }) {
  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mountEl.appendChild(renderer.domElement);

  // ---------- scene / camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    2000
  );
  // Камера “всередині сфери”
  camera.position.set(0, 0, 0);

  // ---------- subtle fog (глибина) ----------
  scene.fog = new THREE.FogExp2(0x05070d, 0.0022);

  // ---------- lights ----------
  const amb = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(amb);

  const dir = new THREE.DirectionalLight(0xffffff, 0.65);
  dir.position.set(200, 300, 200);
  scene.add(dir);

  // ---------- helpers ----------
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- interaction state ----------
  const mouse = { x: 0, y: 0 };
  const pointer = { down: false, sx: 0, sy: 0, dx: 0, dy: 0 };

  // scroll/inertia
  let scrollTarget = 0;  // куди хочемо
  let scrollPos = 0;     // де реально
  let scrollVel = 0;     // інерція

  // верхня третя стрічка (reveal)
  let revealTarget = 0;
  let reveal = 0;

  // ---------- belts config ----------
  // Внутрішній “циліндр” навколо камери (ми всередині)
  const R = 240;                  // радіус (менший = ближче)
  const TWO_PI = Math.PI * 2;

  // Картки більші
  const CARD_W = 64;
  const CARD_H = 40;

  // Скільки карток на стрічку
  const PER_BELT = 22;

  // Відстань між картками (по дузі) — менше = щільніше
  const ARC_STEP = TWO_PI / PER_BELT;

  // Позиції стрічок по Y
  const BELT_Y_1 = -36;
  const BELT_Y_2 = 20;
  const BELT_Y_3_HIDDEN = 82;  // схована зверху
  const BELT_Y_3_VISIBLE = 52; // коли відкрили

  // Невелика “вигнутість сфери” — різний R по Y
  const beltRadiusByY = (y) => R + (y * y) * 0.012;

  // ---------- materials ----------
  // Спокійні “карткові” кольори (поки без текстур)
  const palette = [
    0x96c7ff, 0xa9f3d1, 0xd7b7ff, 0xffc8a8,
    0xb8ffd2, 0xbad0ff, 0xf1d7ff, 0xffe3b5
  ];

  function makeCardMaterial(i) {
    const color = palette[i % palette.length];
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.08,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide, // важливо: бачити “зсередини”
    });
  }

  // ---------- group ----------
  const world = new THREE.Group();
  scene.add(world);

  // ---------- create belt ----------
  function createBelt(y, seed = 0) {
    const belt = new THREE.Group();
    belt.position.y = y;

    const cards = [];
    for (let i = 0; i < PER_BELT; i++) {
      const mat = makeCardMaterial(i + seed);
      const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);
      const mesh = new THREE.Mesh(geo, mat);

      // легкий нахил як “плитки на стрічці”
      mesh.rotation.z = (Math.random() - 0.5) * 0.32;

      belt.add(mesh);
      cards.push({
        mesh,
        baseAngle: i * ARC_STEP,
        wobble: (Math.random() * 2 - 1) * 0.6, // дрібна жива варіація
        phase: Math.random() * 1000,
      });
    }

    world.add(belt);
    return { belt, cards };
  }

  const belt1 = createBelt(BELT_Y_1, 0);
  const belt2 = createBelt(BELT_Y_2, 50);
  const belt3 = createBelt(BELT_Y_3_HIDDEN, 120);

  // ---------- update belt positions (wrap / infinite) ----------
  function updateBelt({ belt, cards }, t, scroll) {
    const y = belt.position.y;
    const rr = beltRadiusByY(y);

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];

      // головний “рух стрічки” по колу:
      // scrollPos — це зсув у радіанах
      let ang = c.baseAngle + scroll;

      // wrap (безкінечність)
      ang = ((ang % TWO_PI) + TWO_PI) % TWO_PI;

      // позиція по колу
      const x = Math.cos(ang) * rr;
      const z = Math.sin(ang) * rr;

      // Легка “жива” мікровібрація, але не хаос
      const wob = Math.sin(t * 0.7 + c.phase) * 1.6 + c.wobble * 1.2;

      c.mesh.position.set(x, wob, z);

      // Ми всередині: картка має дивитися в центр (до камери)
      // (тобто “всередину” циліндра)
      c.mesh.lookAt(0, 0, 0);

      // Трохи “перспективної ваги”: ближче до фронту — яскравіше/більше
      // Фронт — коли z ~ -rr (бо камера дивиться вздовж -Z умовно)
      const front = 1 - Math.abs((ang - Math.PI) / Math.PI); // 1 біля PI
      const s = lerp(0.82, 1.28, front);
      c.mesh.scale.set(s, s, 1);

      const op = lerp(0.22, 0.92, front);
      c.mesh.material.opacity = op;
    }
  }

  // ---------- input ----------
  function onMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    mouse.x = (nx - 0.5) * 2;
    mouse.y = (ny - 0.5) * 2;

    if (pointer.down) {
      pointer.dx = e.clientX - pointer.sx;
      pointer.dy = e.clientY - pointer.sy;

      // Drag up => reveal третю стрічку
      // якщо тягнемо вгору достатньо — відкриваємо
      if (pointer.dy < -80) revealTarget = 1;
      if (pointer.dy > -30) revealTarget = 0;

      // також можна трохи “крутити” стрічку драгом
      // (але дуже м’яко)
      scrollTarget += pointer.dx * 0.0009;
    }
  }

  renderer.domElement.addEventListener("mousemove", onMove);

  renderer.domElement.addEventListener("pointerdown", (e) => {
    pointer.down = true;
    pointer.sx = e.clientX;
    pointer.sy = e.clientY;
    pointer.dx = 0;
    pointer.dy = 0;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  });

  renderer.domElement.addEventListener("pointerup", (e) => {
    pointer.down = false;
    pointer.dx = 0;
    pointer.dy = 0;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
  });

  // wheel scroll (повільніше, без “шаленства”)
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120);
      scrollVel += delta * 0.00035; // чутливість колеса
    },
    { passive: false }
  );

  // ---------- animate ----------
  let last = performance.now();

  function animate(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;

    const t = now / 1000;

    // auto drift (повільно, як у 100lostspecies)
    scrollVel += 0.00055;

    // інерція + демпф
    scrollVel *= Math.pow(0.88, dt * 60);
    scrollTarget += scrollVel;

    // плавно ведемо позицію
    scrollPos = lerp(scrollPos, scrollTarget, 1 - Math.pow(0.90, dt * 60));

    // камера: легкий parallax від мишки
    // (але не “літає”)
    const camX = mouse.x * 10;
    const camY = -mouse.y * 6;
    camera.position.x = lerp(camera.position.x, camX, 1 - Math.pow(0.92, dt * 60));
    camera.position.y = lerp(camera.position.y, camY, 1 - Math.pow(0.92, dt * 60));
    camera.lookAt(0, 0, -200);

    // reveal 3-ї стрічки
    reveal = lerp(reveal, revealTarget, 1 - Math.pow(0.86, dt * 60));
    belt3.belt.position.y = lerp(BELT_Y_3_HIDDEN, BELT_Y_3_VISIBLE, reveal);

    // рух стрічок (дві різні швидкості, щоб “жило”)
    updateBelt(belt1, t, scrollPos * 1.00);
    updateBelt(belt2, t, scrollPos * 0.86 + 1.2);
    updateBelt(belt3, t, scrollPos * 0.92 + 2.6);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

  // ---------- resize ----------
  function onResize() {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  // ---------- API (якщо треба буде) ----------
  return {
    destroy() {
      window.removeEventListener("resize", onResize);
      mountEl.removeChild(renderer.domElement);
      renderer.dispose();
    },
  };
}
