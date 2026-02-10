// libs/main-gallery.js
// CDN-версія Three.js (безкоштовно, без локального three.module.js)
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

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
    55,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    6000
  );

  // ближче, щоб плитки були “перед очима”
  camera.position.set(0, 0, 240);
  camera.lookAt(0, 0, 0);

  // ---------- state ----------
  const mouse = { x: 0, y: 0 };
  let scrollVel = 0;
  let scrollPos = 0;

  // drag up => reveal third belt
  let isDown = false;
  let lastY = 0;
  let reveal = 0;        // 0..1 (3-тя стрічка)
  let revealVel = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mouse.x = (nx - 0.5) * 2;
    mouse.y = (ny - 0.5) * 2;

    if (isDown) {
      const dy = e.clientY - lastY;
      lastY = e.clientY;

      // тягнеш ВГОРУ => dy від’ємний => reveal росте
      revealVel += (-dy) * 0.0022;
    }
  }

  function onPointerDown(e) {
    isDown = true;
    lastY = e.clientY;
  }

  function onPointerUp() {
    isDown = false;
  }

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mousedown", onPointerDown);
  window.addEventListener("mouseup", onPointerUp);

  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const d = clamp(e.deltaY, -140, 140);
      scrollVel += d * 0.0010; // керовано, не різко
    },
    { passive: false }
  );

  // ---------- world ----------
  const world = new THREE.Group();
  scene.add(world);

  // геометрія плиток (більші)
  const CARD_W = 130;
  const CARD_H = 86;
  const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);

  // без світла — завжди видно
  const palette = [
    0x86b7ff, 0x7ff0c7, 0xd3a6ff, 0xffc59a,
    0x9ad0ff, 0x95f0d0, 0xe5b8ff, 0xffd6aa,
  ];

  function makeMat(i) {
    return new THREE.MeshBasicMaterial({
      color: palette[i % palette.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
  }

  // belt params (кільце — нескінченне)
  const R1 = 215;
  const R2 = 240;
  const R3 = 265;

  const PER = 34; // більше плиток по колу (щільніше/довше)
  const STEP = (Math.PI * 2) / PER;

  function createBelt({ y, radius, seed }) {
    const belt = new THREE.Group();
    belt.position.y = y;
    world.add(belt);

    const cards = [];
    for (let i = 0; i < PER; i++) {
      const mesh = new THREE.Mesh(geo, makeMat(i + seed));
      // легкий нахил “як у стрічки”, але НЕ швидкий
      mesh.rotation.z = (Math.random() - 0.5) * 0.18;
      mesh.rotation.x = (Math.random() - 0.5) * 0.12;

      belt.add(mesh);

      cards.push({
        mesh,
        base: i * STEP,
        phase: Math.random() * 1000,
      });
    }

    return { belt, cards, radius };
  }

  const belt1 = createBelt({ y: -52, radius: R1, seed: 0 });
  const belt2 = createBelt({ y:  18, radius: R2, seed: 40 });

  // 3-тя стрічка стартує ВИСОКО і “невидима”
  const belt3 = createBelt({ y: 120, radius: R3, seed: 90 });

  function updateBelt(B, t, scroll, radius, extraOpacity = 1) {
    for (const c of B.cards) {
      const a = c.base + scroll;

      // коло навколо Y
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;

      // дуже легкий "живий" wobble, повільний
      const wob = Math.sin(t * 0.55 + c.phase) * 1.4;

      c.mesh.position.set(x, wob, z);

      // “всередині сфери”: плитка дивиться в центр
      c.mesh.lookAt(0, 0, 0);

      // глибина: ближче до камери (z ближче до +radius) => більша/яскравіша
      const front = (z / radius + 1) * 0.5; // 0..1
      const s = lerp(0.82, 1.28, front);
      c.mesh.scale.set(s, s, 1);

      c.mesh.material.opacity = lerp(0.20, 0.95, front) * extraOpacity;
    }
  }

  // ---------- animate ----------
  let last = performance.now();

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    const t = now / 1000;

    // дуже повільний автодрифт (щоб не “крутилось швидко”)
    scrollVel += 0.00022;

    // інерція
    scrollVel *= Math.pow(0.88, dt * 60);
    scrollPos += scrollVel;

    // reveal third belt (drag up)
    revealVel *= Math.pow(0.86, dt * 60);
    reveal += revealVel * dt * 60;
    reveal = clamp(reveal, 0, 1);

    // 3-тя стрічка плавно опускається з 120 до 70
    const targetY = lerp(120, 70, reveal);
    belt3.belt.position.y = lerp(belt3.belt.position.y, targetY, 1 - Math.pow(0.85, dt * 60));

    // паралакс камери (дуже делікатний)
    const camX = mouse.x * 14;
    const camY = -mouse.y * 9;
    camera.position.x = lerp(camera.position.x, camX, 1 - Math.pow(0.90, dt * 60));
    camera.position.y = lerp(camera.position.y, camY, 1 - Math.pow(0.90, dt * 60));
    camera.lookAt(0, 0, 0);

    // belts різні швидкості, але спокійно
    updateBelt(belt1, t, scrollPos * 1.00, belt1.radius, 1);
    updateBelt(belt2, t, scrollPos * 0.92 + 1.2, belt2.radius, 1);
    updateBelt(belt3, t, scrollPos * 0.96 + 2.4, belt3.radius, lerp(0.0, 1.0, reveal));

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
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("mouseup", onPointerUp);
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
