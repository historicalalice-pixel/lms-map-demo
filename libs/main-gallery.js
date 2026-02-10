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
  camera.position.set(0, 0, 230);
  camera.lookAt(0, 0, 0);

  // ---------- utils ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- interaction ----------
  const mouse = { x: 0, y: 0 };

  let scrollTarget = 0; // те, що задає wheel
  let scrollPos = 0;    // реальна позиція (плавно наздоганяє)
  let scrollVel = 0;    // для легкого “дихання”/автодрифту

  // reveal 3rd belt
  let revealTarget = 0;
  let reveal = 0;

  // drag state
  let isDown = false;
  let dragStartY = 0;
  let dragAccumY = 0;

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

      // менше число = повільніше
      scrollTarget += d * 0.0022;
    },
    { passive: false }
  );

  renderer.domElement.addEventListener("pointerdown", (e) => {
    isDown = true;
    dragStartY = e.clientY;
    dragAccumY = 0;
    renderer.domElement.setPointerCapture(e.pointerId);
  });

  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!isDown) return;
    const dy = e.clientY - dragStartY;
    dragAccumY = dy;

    // drag up => dy negative => reveal increases
    revealTarget = clamp((-dragAccumY) / 220, 0, 1);
  });

  renderer.domElement.addEventListener("pointerup", (e) => {
    isDown = false;
    dragAccumY = 0;
    revealTarget = 0; // відпустив — сховали назад
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
  });

  // ---------- world ----------
  const world = new THREE.Group();
  scene.add(world);

  // Геометрія “сфери/циліндра” (всередині)
  const R = 165;          // ближче (було ~210)
  const PER = 64;         // більше карток => щільніше => “не закінчується”
  const STEP = (Math.PI * 2) / PER;

  const CARD_W = 140;     // більші
  const CARD_H = 92;

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
      opacity: 0.92,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  function createBelt({ y, seed = 0 }) {
    const belt = new THREE.Group();
    belt.position.y = y;

    const cards = [];
    for (let i = 0; i < PER; i++) {
      const mesh = makeCard(i + seed);

      // дуже легкий “живий” нахил (але не “вертольот”)
      mesh.rotation.z = (Math.random() - 0.5) * 0.12;

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

  // Дві видимі + третя схована зверху
  const belt1 = createBelt({ y: -55, seed: 0 });
  const belt2 = createBelt({ y:  10, seed: 80 });
  const belt3 = createBelt({ y:  140, seed: 160 }); // старт схований високо

  function updateBelt(B, t, scroll, radius, opacityMul = 1) {
    for (const c of B.cards) {
      const a = c.base + scroll;

      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;

      // дуже м’який “wobble”, щоб не трясло
      const wob = Math.sin(t * 0.55 + c.phase) * 1.3;

      c.mesh.position.set(x, wob, z);

      // всередині “сфери”: дивимось в центр
      c.mesh.lookAt(0, 0, 0);

      // видимість/вага: ближче до камери (камера на +Z)
      const front = (z / radius + 1) * 0.5; // 0..1
      const s = lerp(0.86, 1.18, front);
      c.mesh.scale.set(s, s, 1);

      // щоб не були “прозорі”
      const baseOp = lerp(0.35, 0.98, front);
      c.mesh.material.opacity = baseOp * opacityMul;
    }
  }

  // ---------- animate ----------
  let last = performance.now();

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    const t = now / 1000;

    // дуже повільний авто-дрифт (ледь)
    scrollVel += 0.00025;
    scrollVel *= Math.pow(0.88, dt * 60);
    scrollTarget += scrollVel;

    // smooth-follow (пружина)
    const spring = 1 - Math.pow(0.86, dt * 60); // менше = плавніше
    scrollPos = lerp(scrollPos, scrollTarget, spring);

    // reveal третьої стрічки (пружина)
    reveal = lerp(reveal, revealTarget, 1 - Math.pow(0.80, dt * 60));

    // камера: м’який паралакс (не “літає”)
    const camX = mouse.x * 14;
    const camY = -mouse.y * 8;
    camera.position.x = lerp(camera.position.x, camX, 1 - Math.pow(0.88, dt * 60));
    camera.position.y = lerp(camera.position.y, camY, 1 - Math.pow(0.88, dt * 60));
    camera.lookAt(0, 0, 0);

    // позиція 3-ї стрічки: схована -> видима
    const hiddenY = 140;
    const visibleY = -115; // “приходить” зверху в кадр
    belt3.belt.position.y = lerp(hiddenY, visibleY, reveal);

    // оновлення стрічок (трохи різні швидкості)
    updateBelt(belt1, t, scrollPos * 1.00, R);
    updateBelt(belt2, t, scrollPos * 0.92 + 1.3, R + 16);

    // 3-тя: ще трошки “далі”, плюс opacityMul від reveal
    updateBelt(belt3, t, scrollPos * 0.96 + 2.6, R + 26, lerp(0.0, 1.0, reveal));

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
