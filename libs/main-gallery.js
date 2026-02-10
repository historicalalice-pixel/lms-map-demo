// libs/main-gallery.js
import * as THREE from "three";
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl }) {
  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setClearColor(0x000000, 0); // прозоро — фон дає CSS
  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);

  // ---------- scene ----------
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05070d, 10, 28);

  // ---------- camera (ВАЖЛИВО: без zoom-out) ----------
  const camera = new THREE.PerspectiveCamera(
    45,
    mountEl.clientWidth / mountEl.clientHeight,
    0.05,
    80
  );
  camera.position.set(0, 0, 0.15);
  camera.lookAt(0, 0, -1);

  // light (дуже м’яке)
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 0.55);
  dir.position.set(2, 4, 3);
  scene.add(dir);

  // ---------- parameters (під 5 карток видимих) ----------
  const CARD_W = 3.25;     // ширина картки у світі
  const CARD_H = 2.15;     // висота
  const GAP = 0.45;        // відстань між картками (те, що ти просив)
  const R = 12.2;          // радіус “сфери/циліндра” (впливає на кривизну і видимість)
  const ARC = CARD_W + GAP;

  // Скільки карток по колу (чим більше — тим “плавніше” кільце)
  const COUNT = Math.max(28, Math.ceil((2 * Math.PI * R) / ARC));

  // ---------- helpers: texture per card ----------
  function makeCardTexture(labelTop, labelBottom, seed) {
    const w = 768, h = 512;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");

    // фон
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(0, 0, w, h);

    // легкий градієнт/зерно
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(30,90,200,0.12)");
    grd.addColorStop(1, "rgba(80,200,160,0.08)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // рамка
    g.strokeStyle = "rgba(232,238,252,0.22)";
    g.lineWidth = 3;
    g.strokeRect(10, 10, w - 20, h - 20);

    // “арт-пляма” (псевдо)
    const rng = mulberry32(seed);
    g.globalAlpha = 0.9;
    g.fillStyle = `rgba(${Math.floor(120 + rng()*80)}, ${Math.floor(120 + rng()*80)}, ${Math.floor(120 + rng()*80)}, 0.35)`;
    g.beginPath();
    g.ellipse(w*0.55, h*0.50, w*(0.22 + rng()*0.08), h*(0.20 + rng()*0.08), rng()*0.5, 0, Math.PI*2);
    g.fill();
    g.globalAlpha = 1;

    // текст
    g.fillStyle = "rgba(243,238,215,0.92)";
    g.font = "600 34px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(labelTop, 40, 78);

    g.fillStyle = "rgba(232,238,252,0.70)";
    g.font = "500 22px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(labelBottom, 40, 112);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  function mulberry32(a) {
    return function() {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- bands ----------
  const bands = [];

  function createBand(y, speedFactor, initialHidden = false) {
    const group = new THREE.Group();
    group.position.y = y;
    scene.add(group);

    const geom = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

    for (let i = 0; i < COUNT; i++) {
      const item = GALLERY_ITEMS[i % GALLERY_ITEMS.length];
      const theta = (i / COUNT) * Math.PI * 2;

      // Розкладка по циліндру (всередині)
      const x = Math.sin(theta) * R;
      const z = -Math.cos(theta) * R;

      const tex = makeCardTexture(item.title, item.subtitle, i * 999 + Math.floor((y+10)*100));

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        opacity: initialHidden ? 0.0 : 0.92, // щоб не були “прозорі”
        roughness: 0.85,
        metalness: 0.0,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, 0, z);
      mesh.lookAt(0, 0, 0); // лицем до центру/камери
      group.add(mesh);
    }

    bands.push({
      group,
      yBase: y,
      speed: speedFactor,
      hidden: initialHidden,
      opacityTarget: initialHidden ? 0.0 : 0.92,
      yTarget: y,
    });
  }

  // 2 видимі + 1 прихована зверху
  createBand(-2.15, 0.92, false);  // нижня
  createBand( 0.00, 1.00, false);  // середня
  createBand( 2.25, 1.08, true);   // верхня (з’являється)

  // ---------- interaction: smooth spring ----------
  const state = {
    target: 0,
    pos: 0,
    vel: 0,

    // “паралакс” (дуже м’який, але відчутний)
    mouseX: 0,
    mouseY: 0,
    parX: 0,
    parY: 0,

    // третя стрічка
    topReveal: 0,        // 0..1
    topRevealTarget: 0,  // 0..1

    dragging: false,
    lastX: 0,
    lastY: 0,
  };

  const WHEEL_SENS = 0.00055; // ✅ дуже повільно (те що ти просив)
  const DRAG_SENS = 0.0020;

  function onWheel(e) {
    e.preventDefault();
    const d = Math.sign(e.deltaY) * Math.min(120, Math.abs(e.deltaY));
    state.target += d * WHEEL_SENS;
  }

  function onPointerDown(e) {
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    state.mouseX = nx;
    state.mouseY = ny;

    if (!state.dragging) return;

    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;

    // горизонтальний рух
    state.target += -dx * DRAG_SENS * 0.0018;

    // drag up -> третя стрічка з’являється
    // (тільки якщо тягнемо вгору)
    if (dy < 0) {
      state.topRevealTarget = clamp(state.topRevealTarget + (-dy) * 0.0025, 0, 1);
    } else {
      state.topRevealTarget = clamp(state.topRevealTarget - (dy) * 0.0022, 0, 1);
    }
  }

  function onPointerUp() {
    state.dragging = false;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // важливо: wheel працює тільки якщо ми не скролимо сторінку
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  // ---------- animation loop ----------
  let raf = 0;
  const clock = new THREE.Clock();

  function tick() {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.033, clock.getDelta());

    // spring to target (дуже гладко)
    const spring = 18.0;
    const damp = 0.86;

    const diff = state.target - state.pos;
    state.vel += diff * spring * dt;
    state.vel *= Math.pow(damp, dt * 60);
    state.pos += state.vel * dt;

    // паралакс — м’який (НЕ “камера летить”)
    const parLerp = 1 - Math.pow(0.08, dt * 60);
    state.parX += (state.mouseX - state.parX) * parLerp;
    state.parY += (state.mouseY - state.parY) * parLerp;

    camera.rotation.y = state.parX * 0.08;
    camera.rotation.x = -state.parY * 0.06;

    // top reveal smooth
    const rLerp = 1 - Math.pow(0.06, dt * 60);
    state.topReveal += (state.topRevealTarget - state.topReveal) * rLerp;

    // Apply movement to bands
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];

      // базове обертання (нескінченне)
      b.group.rotation.y = state.pos * b.speed;

      // 3-тя стрічка: зміна Y + opacity
      if (b.hidden) {
        const yHidden = 3.4;      // схована вище
        const yShown  = 2.15;     // видима позиція
        b.group.position.y = lerp(yHidden, yShown, smoothstep(state.topReveal));

        const o = lerp(0.0, 0.90, smoothstep(state.topReveal));
        for (const m of b.group.children) m.material.opacity = o;
      }
    }

    renderer.render(scene, camera);
  }

  function lerp(a,b,t){ return a + (b-a)*t; }
  function smoothstep(t){
    t = clamp(t,0,1);
    return t*t*(3-2*t);
  }

  tick();

  // ---------- resize ----------
  function onResize() {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  // cleanup (якщо захочеш)
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("wheel", onWheel);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    renderer.dispose();
  };
}
