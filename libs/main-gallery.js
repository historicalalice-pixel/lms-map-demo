// libs/main-gallery.js
// 100lostspecies-style prototype:
// - index-based (targetIndex/currentIndex)
// - spring settle (mass feel)
// - orbital arc motion around camera (not "rails")
// - 3 rows (middle master + top/bot support) driven by one currentIndex
// - windowing (no tunnel)
// Uses Three.js via importmap: "three"

import * as THREE from "three";

export function initMainGalleryMath({ mountEl }) {
  if (!mountEl) throw new Error("initMainGalleryMath: mountEl is required");

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x0b0f1a, 1);

  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // ---------- scene/camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 6000);
  camera.position.set(0, 0, 1100);
  camera.lookAt(0, 0, 0);

  // ---------- content ----------
  const COUNT = 10;

  // ---------- "100lostspecies feel" core params ----------
  const WINDOW = 3; // show offsets -3..+3 per row

  // Arc feel: cards "wrap" around viewer
  // We'll map offsets to an angle range [-ARC_ANGLE..+ARC_ANGLE]
  const ARC_ANGLE = (52 * Math.PI) / 180; // ~±52deg across window

  // Put center card slightly in front of origin (negative Z), not too deep
  const Z_CENTER = 130;

  // Spring settle for cinematic motion
  // (tuned to feel "heavy" but responsive)
  const SPRING_K = 52;    // stiffness
  const SPRING_D = 14.5;  // damping

  // ---------- rows (middle = master, top/bot = support) ----------
  const ROWS = [
    {
      kind: "top",
      y: +210,
      radius: 1150,
      scaleStep: 0.16,
      opacityStep: 0.40,
      depthPow: 1.30,
      centerBoost: 1.02,
      indexShift: +1, // phase
    },
    {
      kind: "mid",
      y: 0,
      radius: 1080,
      scaleStep: 0.14,
      opacityStep: 0.36,
      depthPow: 1.25,
      centerBoost: 1.06,
      indexShift: 0,
    },
    {
      kind: "bot",
      y: -210,
      radius: 1200,
      scaleStep: 0.17,
      opacityStep: 0.42,
      depthPow: 1.32,
      centerBoost: 1.01,
      indexShift: -2, // phase
    },
  ];

  // ---------- card factory (simple labels for now) ----------
  function makeLabelTexture(text, subtitle) {
    const w = 640, h = 420;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");

    // base
    g.fillStyle = "rgba(18,22,35,1)";
    g.fillRect(0, 0, w, h);

    // border
    g.strokeStyle = "rgba(240,240,255,0.20)";
    g.lineWidth = 6;
    g.strokeRect(18, 18, w - 36, h - 36);

    // title
    g.fillStyle = "rgba(240,240,255,0.92)";
    g.font = "700 46px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(text, 44, 98);

    // subtitle
    g.fillStyle = "rgba(240,240,255,0.55)";
    g.font = "500 26px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(subtitle, 44, 140);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const cardGeo = new THREE.PlaneGeometry(340, 220);

  // Build meshes: rowGroups[rowIndex].children[i] corresponds to card i
  const rowGroups = ROWS.map((row, rIdx) => {
    const group = new THREE.Group();
    group.position.y = row.y;
    scene.add(group);

    for (let i = 0; i < COUNT; i++) {
      const tex = makeLabelTexture(
        `Card ${i + 1}`,
        rIdx === 1 ? "master row" : "support row"
      );

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(cardGeo, mat);
      mesh.userData = { index: i };
      group.add(mesh);
    }

    return group;
  });

  // ---------- state (index-based) ----------
  let targetIndex = 0;     // integer steps
  let currentIndex = 0;    // continuous
  let indexVel = 0;        // spring velocity

  // ---------- input ----------
  function stepTarget(dir) {
    targetIndex = clamp(targetIndex + dir, 0, COUNT - 1);
  }

  function onWheel(e) {
    const dy = e.deltaY;
    if (Math.abs(dy) < 2) return;
    stepTarget(dy > 0 ? +1 : -1);
  }

  let down = false;
  let lastX = 0;
  let dragAcc = 0;

  function onPointerDown(e) {
    down = true;
    lastX = e.clientX;
    dragAcc = 0;
    renderer.domElement.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!down) return;

    const dx = e.clientX - lastX;
    lastX = e.clientX;
    dragAcc += dx;

    // Drag threshold -> discrete steps (like curated nav)
    const STEP_PX = 120;

    while (dragAcc > STEP_PX) {
      stepTarget(-1); // drag right -> previous
      dragAcc -= STEP_PX;
    }
    while (dragAcc < -STEP_PX) {
      stepTarget(+1); // drag left -> next
      dragAcc += STEP_PX;
    }
  }

  function onPointerUp(e) {
    down = false;
    renderer.domElement.releasePointerCapture?.(e.pointerId);
  }

  renderer.domElement.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });
  window.addEventListener("pointercancel", onPointerUp, { passive: true });

  // ---------- orbital layout core ----------
  function layoutMesh(mesh, rowCfg, offset) {
    const absO = Math.abs(offset);

    // windowing: no tunnel
    if (absO > WINDOW + 0.2) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    const isCenter = absO < 0.001;

    // Normalize offset to [-1..1] across window, then map to arc angle
    const t = clamp(offset / WINDOW, -1, 1);
    const ang = t * ARC_ANGLE; // orbital feel

    // Non-linear "attention" falloff (like cinematic)
    const depthFactor = Math.pow(absO, rowCfg.depthPow);

    // Orbital arc positioning:
    // Center at z = -Z_CENTER (slightly towards camera), sides go deeper as angle grows.
    const R = rowCfg.radius;

    const x = Math.sin(ang) * R;

    // Circle with a forward shift so center isn't deep:
    // z(0) = -Z_CENTER; z(edges) becomes much deeper -> orbital wrap feel.
    const z = (-Math.cos(ang) * R) + (R - Z_CENTER) - depthFactor * 60;

    // Slight vertical drop towards edges (adds sculpture feel)
    const y = -depthFactor * 26;

    // Scale/opacity falloff (rows differ)
    let s = 1 - depthFactor * rowCfg.scaleStep;
    let op = 1 - depthFactor * rowCfg.opacityStep;

    // Heavy center (never dim)
    if (isCenter) {
      s = rowCfg.centerBoost;
      op = 1;
    }

    s = clamp(s, 0.45, rowCfg.centerBoost);
    op = clamp(op, 0.03, 1);

    mesh.position.set(x, y, z);
    mesh.scale.setScalar(s);
    mesh.material.opacity = op;

    // Orientation: not fully billboard to camera.
    // Use yaw from arc angle (tangent-ish) to feel "wrapping around viewer".
    mesh.rotation.set(0, ang * 0.90, 0);

    // Tiny extra yaw for drama at edges (optional, subtle)
    mesh.rotation.y += clamp(-offset * 0.03, -0.12, 0.12);
  }

  function layoutAll() {
    for (let r = 0; r < ROWS.length; r++) {
      const rowCfg = ROWS[r];
      const group = rowGroups[r];

      for (const mesh of group.children) {
        const i = mesh.userData.index;

        // row phase / index shift (support rows feel offset)
        const offset = (i + rowCfg.indexShift) - currentIndex;

        layoutMesh(mesh, rowCfg, offset);
      }
    }
  }

  // ---------- resize ----------
  function onResize() {
    const w = mountEl.clientWidth || window.innerWidth;
    const h = mountEl.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);
  onResize();

  // ---------- animation loop (spring settle) ----------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;

    // Spring towards integer targetIndex
    // x'' + d*x' + k*(x-target)=0  (discrete integration)
    const x = currentIndex;
    const v = indexVel;
    const target = targetIndex;

    const a = -SPRING_K * (x - target) - SPRING_D * v;
    indexVel = v + a * dt;
    currentIndex = x + indexVel * dt;

    // Ensure no drifting beyond bounds
    currentIndex = clamp(currentIndex, 0, COUNT - 1);

    layoutAll();

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    destroy() {
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}
