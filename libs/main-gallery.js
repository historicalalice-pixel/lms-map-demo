// libs/main-gallery.js
// Three.js з CDN (безкоштовно, без збірки, працює на GitHub Pages/Vercel/Netlify)
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js";

/**
 * Main Gallery (100lostspecies-like feel):
 * - 2 видимі "стрічки" + 3-тя зверху (вилазить при drag вверх)
 * - вигнута геометрія "зовні" (ти ніби всередині сфери)
 * - нескінченність: елементи розкладені по колу
 * - керування: wheel -> рух по стрічках, mouse move -> паралакс, drag up -> показ 3-ї стрічки
 */
export function initMainGallery({ mountEl, overlayEl }) {
  mountEl.innerHTML = "";

  // --------- renderer ---------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setClearColor(0x000000, 0);
  mountEl.appendChild(renderer.domElement);

  // --------- scene / camera ---------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    5000
  );

  // ближче, щоб плитки були більші в кадрі
  camera.position.set(0, 0, 190);
  camera.lookAt(0, 0, 0);

  // --------- state ---------
  const mouse = { x: 0, y: 0 };
  let scrollVel = 0;
  let scrollPos = 0;

  // drag-to-reveal third row
  let dragging = false;
  let dragStartY = 0;
  let dragOffset = 0; // 0..1
  let dragVel = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Debug toggle: add ?debug=1
  const debugOn = new URLSearchParams(location.search).get("debug") === "1";
  let debugEl = null;
  if (debugOn) {
    debugEl = document.createElement("div");
    debugEl.style.cssText = `
      position:fixed; left:14px; bottom:14px; z-index:50;
      font:12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color:rgba(255,255,255,.75);
      background:rgba(0,0,0,.35);
      border:1px solid rgba(255,255,255,.12);
      padding:10px 12px; border-radius:12px;
      backdrop-filter: blur(10px);
      pointer-events:none;
      white-space:pre;
    `;
    document.body.appendChild(debugEl);
  }

  // --------- input ---------
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
      // wheel -> рух по колу (нескінченно)
      const d = clamp(e.deltaY, -180, 180);
      scrollVel += d * 0.00135;
    },
    { passive: false }
  );

  // drag вверх -> показати третю стрічку
  renderer.domElement.addEventListener("pointerdown", (e) => {
    dragging = true;
    dragStartY = e.clientY;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  });
  renderer.domElement.addEventListener("pointerup", () => {
    dragging = false;
  });
  renderer.domElement.addEventListener("pointercancel", () => {
    dragging = false;
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dy = e.clientY - dragStartY; // вниз +
    // нас цікавить drag ВГОРУ => dy негативний
    const up = clamp((-dy) / 260, 0, 1);
    // інерційно підтягнемо
    dragVel += (up - dragOffset) * 0.12;
  });

  // --------- world ---------
  const world = new THREE.Group();
  scene.add(world);

  // Параметри "сфери"
  const R = 135;          // радіус стрічок (менше => ближче)
  const PER = 40;         // кількість плиток на коло (більше => щільніше)
  const STEP = (Math.PI * 2) / PER;

  const CARD_W = 150;     // розмір плитки
  const CARD_H = 96;

  // Матеріали без світла (щоб завжди було видно)
  const palette = [
    0x8fb8ff, 0x9ff1cf, 0xd2b6ff, 0xffc7a1,
    0xaad7ff, 0xbfffe1, 0xf0c8ff, 0xffe0b8,
  ];

  function makeCard(i) {
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);
    const mat = new THREE.MeshBasicMaterial({
      color: palette[i % palette.length],
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.seed = Math.random() * 1000;
    return mesh;
  }

  function createBelt(y, seed = 0) {
    const belt = new THREE.Group();
    belt.position.y = y;

    const cards = [];
    for (let i = 0; i < PER; i++) {
      const mesh = makeCard(i + seed);
      // легкий “ручний” нахил як у рефі
      mesh.rotation.z = (Math.random() - 0.5) * 0.22;
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

  // 2 видимі + третя зверху
  const belt1 = createBelt(-44, 0);
  const belt2 = createBelt(14, 50);
  const belt3 = createBelt(92, 100); // стартує вище (при drag “вилазить” вниз)

  function updateBelt(B, t, scroll, radius, yFloat = 1.0) {
    for (const c of B.cards) {
      const a = c.base + scroll;

      // позиція по колу
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;

      // легкий “живий” рух
      const wobY = Math.sin(t * 0.6 + c.phase) * (2.0 * yFloat);

      c.mesh.position.set(x, wobY, z);

      // Ефект “всередині сфери”: плитка дивиться на камеру, але злегка підкручена назовні
      // (щоб було як вигнута стрічка)
      c.mesh.lookAt(camera.position);
      c.mesh.rotateY(Math.sin(a) * 0.18); // легка “випуклість” назовні

      // ближче до камери => більша і яскравіша
      const front = (z / radius + 1) * 0.5; // 0..1
      const s = lerp(0.82, 1.38, front);
      c.mesh.scale.set(s, s, 1);

      c.mesh.material.opacity = lerp(0.18, 0.95, front);
    }
  }

  // --------- loop ---------
  let last = performance.now();

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    const t = now / 1000;

    // м’який автодрифт (як “повільно рухаються”)
    scrollVel += 0.00045;

    // wheel інерція
    scrollVel *= Math.pow(0.88, dt * 60);
    scrollPos += scrollVel;

    // drag reveal інерція
    dragVel *= Math.pow(0.86, dt * 60);
    dragOffset = clamp(dragOffset + dragVel, 0, 1);

    // паралакс камери (тонкий)
    const camX = mouse.x * 16;
    const camY = -mouse.y * 10;

    camera.position.x = lerp(camera.position.x, camX, 1 - Math.pow(0.90, dt * 60));
    camera.position.y = lerp(camera.position.y, camY, 1 - Math.pow(0.90, dt * 60));
    camera.lookAt(0, 0, 0);

    // belt positions: третя стрічка “вилазить”
    // 92 -> 54 (коли dragOffset 1)
    belt3.belt.position.y = lerp(92, 54, dragOffset);

    // opacity третьої стрічки
    belt3.belt.children.forEach((m) => {
      if (m?.material) m.material.opacity *= lerp(0.0, 1.0, dragOffset);
    });

    // різні швидкості для “живості”
    updateBelt(belt1, t, scrollPos * 1.00, R, 1.0);
    updateBelt(belt2, t, scrollPos * 0.92 + 1.4, R + 18, 1.0);
    updateBelt(belt3, t, scrollPos * 0.96 + 2.2, R + 30, 0.8);

    renderer.render(scene, camera);

    if (debugEl) {
      debugEl.textContent =
        `DEBUG\n` +
        `cam: x ${camera.position.x.toFixed(2)}  y ${camera.position.y.toFixed(2)}  z ${camera.position.z.toFixed(2)}\n` +
        `mouse: ${mouse.x.toFixed(2)}  ${mouse.y.toFixed(2)}\n` +
        `scrollVel: ${scrollVel.toFixed(4)}\n` +
        `dragOffset: ${dragOffset.toFixed(2)}\n` +
        `tiles/row: ${PER}`;
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  // --------- resize ---------
  function onResize() {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  // --------- public api ---------
  return {
    destroy() {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      renderer.dispose();
      mountEl.innerHTML = "";
      if (debugEl) debugEl.remove();
    },
  };
}
