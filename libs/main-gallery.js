// libs/main-gallery.js
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js";

/**
 * 100lostspecies-like: you are INSIDE a cylindrical/spherical band.
 * - 2 bands visible
 * - 3rd band hidden on top, revealed by dragging mouse upward
 * - slow inertia (wheel/drag)
 * - strong parallax (mouse -> camera micro-shift)
 */
export function initMainGallery({ mountEl }) {
  mountEl.innerHTML = "";

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.setClearColor(0x000000, 0);
  mountEl.appendChild(renderer.domElement);

  // ---------- scene / camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    52,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    5000
  );

  // CAMERA IS INSIDE
  camera.position.set(0, 0, 0);

  // subtle fog for depth (nice cinematic)
  scene.fog = new THREE.FogExp2(0x05070d, 0.00075);

  // ---------- lighting (very soft) ----------
  // We’ll use MeshBasic-like look but still add gentle light for nicer shading later.
  const amb = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(amb);

  const dir = new THREE.DirectionalLight(0xffffff, 0.55);
  dir.position.set(200, 200, 120);
  scene.add(dir);

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- interaction state ----------
  const mouse = { x: 0, y: 0 };
  let isDown = false;
  let downX = 0;
  let downY = 0;

  // yaw = horizontal orbit, pitch = vertical orbit (small)
  let yaw = 0;
  let pitch = 0;

  let yawVel = 0;
  let pitchVel = 0;

  // reveal for top band [0..1]
  let topReveal = 0;
  let topRevealVel = 0;

  // “auto drift” extremely slow
  const AUTO_DRIFT = 0.00025;

  // ---------- world ----------
  const world = new THREE.Group();
  scene.add(world);

  // ---------- bands config ----------
  // radius is distance from camera to cards (inside cylinder)
  const R = 520;

  // cards count per band
  const COUNT = 28;

  // band spacing (vertical)
  const BAND_Y = 115;

  // card geometry size (BIG + readable)
  const CARD_W = 180;
  const CARD_H = 120;

  // how much the band curves vertically (gives "inside sphere" feel)
  const V_CURVE = 0.55;

  // palettes (temporary)
  const palette = [
    0x9fd3ff, 0xb4ffd8, 0xd8b9ff, 0xffd2b0,
    0xbbe3ff, 0xc6ffd8, 0xf0c8ff, 0xffe1b8,
    0xa7b9ff, 0x9fffd2, 0xf2b2ff, 0xffc59f,
  ];

  function makeCard(i) {
    const geo = new THREE.PlaneGeometry(CARD_W, CARD_H, 1, 1);

    // IMPORTANT: depthWrite false helps avoid “transparent mess”
    const mat = new THREE.MeshStandardMaterial({
      color: palette[i % palette.length],
      roughness: 0.65,
      metalness: 0.0,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const m = new THREE.Mesh(geo, mat);

    // tiny random tilt (like paper cards)
    m.rotation.z = (Math.random() - 0.5) * 0.18;

    // subtle border (wireframe-ish) using a second plane slightly in front
    const borderGeo = new THREE.PlaneGeometry(CARD_W + 6, CARD_H + 6, 1, 1);
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.z = 0.6;
    m.add(border);

    return m;
  }

  function createBand(index, yBase) {
    const g = new THREE.Group();
    g.position.y = yBase;
    world.add(g);

    const cards = [];
    for (let i = 0; i < COUNT; i++) {
      const mesh = makeCard(i + index * 100);
      g.add(mesh);

      cards.push({
        mesh,
        a0: (i / COUNT) * Math.PI * 2,
        phase: Math.random() * 1000,
      });
    }

    return { group: g, cards, yBase };
  }

  // 2 visible + top hidden
  const bandMid = createBand(0, 0);
  const bandLow = createBand(1, -BAND_Y);
  const bandTop = createBand(2, +BAND_Y * 1.35); // start higher; we’ll animate it down

  // Position cards on inner cylinder, facing center (camera at center)
  function layoutBand(band, t, yawOffset) {
    const y = band.group.position.y;

    for (const c of band.cards) {
      // angle around cylinder
      const a = c.a0 + yawOffset;

      // cylinder coordinates
      const x = Math.cos(a) * R;
      const z = Math.sin(a) * R;

      // vertical curvature (makes "inside sphere" illusion)
      // cards a bit higher/lower depending on where they are around you
      const vCurve = Math.cos(a) * V_CURVE; // [-V_CURVE..+V_CURVE]
      const yCurve = vCurve * (Math.abs(y) * 0.35 + 42);

      // micro-floating
      const wob = Math.sin(t * 0.8 + c.phase) * 2.5;

      c.mesh.position.set(x, y + yCurve + wob, z);

      // face the center (camera)
      c.mesh.lookAt(0, c.mesh.position.y * 0.02, 0);

      // scale/opacity depending on how "front" it is
      // when z is near 0 and x near -R? Actually front depends on camera view direction.
      // We'll treat "front" as nearest to camera direction (which is where a ≈ +PI/2 gives z≈+R).
      const front = (z / R + 1) * 0.5; // 0..1
      const s = lerp(0.78, 1.22, front);
      c.mesh.scale.set(s, s, 1);

      c.mesh.material.opacity = lerp(0.18, 0.92, front);
    }
  }

  // ---------- input ----------
  function onMouseMove(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    mouse.x = (nx - 0.5) * 2; // [-1..1]
    mouse.y = (ny - 0.5) * 2; // [-1..1]

    if (!isDown) return;

    const dx = (e.clientX - downX);
    const dy = (e.clientY - downY);

    downX = e.clientX;
    downY = e.clientY;

    // drag adds velocity (slow, “heavy”)
    yawVel += dx * 0.00006;
    pitchVel += dy * 0.00005;

    // dragging UP reveals top band
    // dy < 0 => reveal increase
    topRevealVel += (-dy) * 0.00022;
  }

  function onDown(e) {
    isDown = true;
    downX = e.clientX;
    downY = e.clientY;
  }

  function onUp() {
    isDown = false;
  }

  renderer.domElement.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointermove", onMouseMove);

  // wheel => yaw velocity (VERY slow)
  renderer.domElement.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const d = clamp(e.deltaY, -120, 120);
      yawVel += d * 0.00006; // slower
    },
    { passive: false }
  );

  // ---------- animate ----------
  let last = performance.now();

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;
    const t = now / 1000;

    // tiny auto drift
    yawVel += AUTO_DRIFT;

    // inertia (heavy)
    const damp = Math.pow(0.86, dt * 60);
    yawVel *= damp;
    pitchVel *= Math.pow(0.84, dt * 60);
    topRevealVel *= Math.pow(0.80, dt * 60);

    yaw += yawVel;
    pitch += pitchVel;

    // clamp pitch (don’t flip)
    pitch = clamp(pitch, -0.24, 0.24);

    // reveal top band
    topReveal += topRevealVel;
    topReveal *= Math.pow(0.92, dt * 60);
    topReveal = clamp(topReveal, 0, 1);

    // camera parallax (VERY IMPORTANT)
    // This is the “alive” effect: camera subtly shifts, but world stays coherent.
    const parX = mouse.x * 18;
    const parY = -mouse.y * 10;

    camera.position.x = lerp(camera.position.x, parX, 1 - Math.pow(0.88, dt * 60));
    camera.position.y = lerp(camera.position.y, parY, 1 - Math.pow(0.88, dt * 60));

    // camera looks slightly forward with pitch
    const lookX = Math.sin(yaw) * 2;
    const lookY = pitch * 120;
    const lookZ = Math.cos(yaw) * 2;

    camera.lookAt(lookX, lookY, lookZ);

    // world “orbit” is mostly yaw, small pitch
    world.rotation.y = yaw;
    world.rotation.x = pitch;

    // animate top band position + opacity
    // hidden: up and faint; revealed: comes down + strong
    const topYHidden = BAND_Y * 1.85;
    const topYShown = BAND_Y * 0.95;
    bandTop.group.position.y = lerp(topYHidden, topYShown, topReveal);

    for (const c of bandTop.cards) {
      c.mesh.material.opacity = lerp(0.02, 0.88, topReveal);
    }

    // layout (yawOffset small differences for 3 bands)
    layoutBand(bandMid, t, 0.00);
    layoutBand(bandLow, t, 0.22);
    layoutBand(bandTop, t, 0.44);

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
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMouseMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
