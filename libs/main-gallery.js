// libs/main-gallery.js
import * as THREE from "./three.module.js";

export function initMainGallery({ mountEl }) {
  // прибираємо старий canvas якщо був
  mountEl.innerHTML = "";

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setClearColor(0x000000, 0); // прозорий, фон з CSS
  mountEl.appendChild(renderer.domElement);

  // ---------- scene / camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    5000
  );

  // важливо: не 0,0,0 — щоб точно бачити
  camera.position.set(0, 0, 260);
  camera.lookAt(0, 0, 0);

  // ---------- helpers (щоб 100% видно що рендер живий) ----------
  scene.add(new THREE.AxesHelper(120));

  // ---------- interaction state ----------
  const mouse = { x: 0, y: 0 };
  let scrollVel = 0;
  let scrollPos = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

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
      const d = clamp(e.deltaY, -120, 120);
      scrollVel += d * 0.0012; // керованіше
    },
    { passive: false }
  );

  // ---------- belts ----------
  const world = new THREE.Group();
  scene.add(world);

  const R = 210;          // ближче
  const PER = 26;         // щільніше
  const STEP = (Math.PI * 2) / PER;

  const CARD_W = 92;      // БІЛЬШІ
  const CARD_H = 58;

  // ЯСКРАВІ матеріали без світла (MeshBasicMaterial) => 100% видно
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
      opacity: 0.9,
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
  const belt2 = createBelt(10,  40);
  const belt3 = createBelt(66,  90); // третя “зверху” (поки видима для тесту)

  function updateBelt(B, t, scroll, radius) {
    for (const c of B.cards) {
      const a = c.base + scroll;

      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;

      const wob = Math.sin(t * 0.9 + c.phase) * 2.0;

      c.mesh.position.set(x, wob, z);

      // Картка дивиться в центр — ефект “всередині”
      c.mesh.lookAt(0, 0, 0);

      // Легка вага ближче до камери (коли z ближче до +radius бо камера на +Z)
      const front = (z / radius + 1) * 0.5; // 0..1
      const s = lerp(0.85, 1.35, front);
      c.mesh.scale.set(s, s, 1);

      c.mesh.material.opacity = lerp(0.22, 0.95, front);
    }
  }

  // ---------- animate ----------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    const t = now / 1000;

    // автодрифт (повільний)
    scrollVel += 0.0009;

    // інерція
    scrollVel *= Math.pow(0.86, dt * 60);
    scrollPos += scrollVel;

    // легкий паралакс камери
    const camX = mouse.x * 18;
    const camY = -mouse.y * 10;
    camera.position.x = lerp(camera.position.x, camX, 1 - Math.pow(0.90, dt * 60));
    camera.position.y = lerp(camera.position.y, camY, 1 - Math.pow(0.90, dt * 60));
    camera.lookAt(0, 0, 0);

    // різні швидкості => “живі” стрічки
    updateBelt(belt1, t, scrollPos * 1.0,  R);
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
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
