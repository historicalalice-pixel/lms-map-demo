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

  // ---------- camera (стабільна, без zoom-out) ----------
  const camera = new THREE.PerspectiveCamera(
    42, // трохи вужче поле зору -> менше карток видно
    mountEl.clientWidth / mountEl.clientHeight,
    0.05,
    80
  );
  camera.position.set(0, 0, 0.15);
  camera.lookAt(0, 0, -1);

  // light (м’яке)
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const dir = new THREE.DirectionalLight(0xffffff, 0.55);
  dir.position.set(2, 4, 3);
  scene.add(dir);

  // =====================================================
  // ✅ ГЕОМЕТРІЯ ПІД ТВОЇ ВИМОГИ (4 картки видимо)
  // =====================================================
  const CARD_W = 3.9;       // ширше -> менше штук в кадрі
  const CARD_H = 2.25;

  const GAP = 1.35;         // БІЛЬШИЙ gap -> ще менше карток одночасно
  const R = 10.4;           // менший радіус -> сильніше "всередині сфери" і боки швидше зникають

  const ARC = CARD_W + GAP;

  // кільце
  const COUNT = Math.max(24, Math.ceil((2 * Math.PI * R) / ARC));

  // =====================================================
  // ✅ РЯДИ (центр / нижній 1/2 / верхній 1/3)
  // =====================================================
  // Пояснення:
  // - центральний ряд y = 0 (строго центр)
  // - нижній ряд: піднімаємо так, щоб було видно ~половину => y близько -CARD_H*0.70
  // - верхній ряд: опускаємо так, щоб було видно ~третину => y близько +CARD_H*0.92
  const Y_CENTER = 0.0;
  const Y_BOTTOM = -CARD_H * 0.70; // ~пів-картки видно
  const Y_TOP    =  CARD_H * 0.92; // ~третина видно

  // ---------- card texture ----------
  function makeCardTexture(labelTop, labelBottom, seed) {
    const w = 768, h = 512;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");

    // фон
    g.fillStyle = "rgba(255,255,255,0.06)";
    g.fillRect(0, 0, w, h);

    // градієнт
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, "rgba(30,90,200,0.12)");
    grd.addColorStop(1, "rgba(80,200,160,0.08)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // рамка
    g.strokeStyle = "rgba(232,238,252,0.26)";
    g.lineWidth = 3;
    g.strokeRect(10, 10, w - 20, h - 20);

    // “пляма”
    const rng = mulberry32(seed);
    g.globalAlpha = 0.9;
    g.fillStyle = `rgba(${Math.floor(120 + rng()*80)}, ${Math.floor(120 + rng()*80)}, ${Math.floor(120 + rng()*80)}, 0.35)`;
    g.beginPath();
    g.ellipse(w*0.56, h*0.52, w*(0.22 + rng()*0.08), h*(0.20 + rng()*0.08), rng()*0.5, 0, Math.PI*2);
    g.fill();
    g.globalAlpha = 1;

    // текст
    g.fillStyle = "rgba(243,238,215,0.92)";
    g.font = "600 34px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(labelTop, 40, 78);

    g.fillStyle = "rgba(232,238,252,0.68)";
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
  function createBand(y, speedFactor) {
    const group = new THREE.Group();
    group.position.y = y;
    scene.add(group);

    const geom = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

    for (let i = 0; i < COUNT; i++) {
      const item = GALLERY_ITEMS[i % GALLERY_ITEMS.length];
      const theta = (i / COUNT) * Math.PI * 2;

      // всередині циліндра
      const x = Math.sin(theta) * R;
      const z = -Math.cos(theta) * R;

      const tex = makeCardTexture(item.title, item.subtitle, i * 999 + Math.floor((y + 10) * 100));

      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        opacity: 0.95,  // ✅ тепер чітко видно
        roughness: 0.85,
        metalness: 0.0,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(x, 0, z);
      mesh.lookAt(0, 0, 0);
      group.add(mesh);
    }

    bands.push({ group, speed: speedFactor });
  }

  // ✅ 3 ряди (всі існують одразу)
  createBand(Y_TOP,    1.06);
  createBand(Y_CENTER, 1.00);
  createBand(Y_BOTTOM, 0.94);

  // ---------- interaction: smooth spring ----------
  const state = {
    target: 0,
    pos: 0,
    vel: 0,

    mouseX: 0,
    mouseY: 0,
    parX: 0,
    parY: 0,

    dragging: false,
    lastX: 0,
  };

  // ✅ повільний комфортний рух
  const WHEEL_SENS = 0.00045;
  const DRAG_SENS  = 0.0016;

  function onWheel(e) {
    e.preventDefault();
    const d = Math.sign(e.deltaY) * Math.min(120, Math.abs(e.deltaY));
    state.target += d * WHEEL_SENS;
  }

  function onPointerDown(e) {
    state.dragging = true;
    state.lastX = e.clientX;
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
    state.lastX = e.clientX;

    // drag = обертання кільця
    state.target += -dx * DRAG_SENS * 0.0017;
  }

  function onPointerUp() {
    state.dragging = false;
  }

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

    // ✅ м’якший spring (менше різкості)
    const spring = 14.0;
    const damp   = 0.88;

    const diff = state.target - state.pos;
    state.vel += diff * spring * dt;
    state.vel *= Math.pow(damp, dt * 60);
    state.pos += state.vel * dt;

    // паралакс (камера НЕ відлітає)
    const parLerp = 1 - Math.pow(0.08, dt * 60);
    state.parX += (state.mouseX - state.parX) * parLerp;
    state.parY += (state.mouseY - state.parY) * parLerp;

    camera.rotation.y = state.parX * 0.075;
    camera.rotation.x = -state.parY * 0.055;

    // рух стрічок
    for (const b of bands) {
      b.group.rotation.y = state.pos * b.speed;
    }

    renderer.render(scene, camera);
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
