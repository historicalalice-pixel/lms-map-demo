// libs/main-gallery.js
// 100lostspecies-like prototype:
// - INTRO -> ORBIT "dolly-in" feel
// - camera is the center; cards orbit around you
// - gentle AUTO DRIFT always on (like 100lostspecies)
// - wheel/drag overrides, then drift returns
// - 3 rows driven by one currentIndex
// Uses Three.js via importmap: "three"

import * as THREE from "three";

export function initMainGalleryMath({ mountEl }) {
  if (!mountEl) throw new Error("initMainGalleryMath: mountEl is required");

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth01 = (t) => t * t * (3 - 2 * t);
  const smoothstep = (a, b, x) => smooth01(clamp((x - a) / (b - a), 0, 1));

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x0b0f1a, 1);

  mountEl.innerHTML = "";
  mountEl.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = "none";

  // ---------- scene/camera ----------
  const scene = new THREE.Scene();

  // We look along -Z (classic "in front" direction)
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 8000);
  camera.position.set(0, 0, 1600);          // INTRO start (far)
  camera.lookAt(0, 0, camera.position.z - 1);

  // ---------- content ----------
  const COUNT = 10;

  // ---------- windowing ----------
  // 100lostspecies never shows too much at once.
  const WINDOW_MID = 3; // master row visible offsets: -3..+3
  const WINDOW_SUP = 2; // support rows visible offsets: -2..+2

  // ---------- arc / orbit ----------
  // Angle step between neighbor cards around you.
  // Smaller = tighter pack. Bigger = more spacing around orbit.
  const STEP_ANGLE = (20 * Math.PI) / 180; // ~20deg

  // Radii per row (support slightly larger -> feels more "around")
  const ROWS = [
    {
      kind: "top",
      y: +210,
      radius: 1180,
      window: WINDOW_SUP,
      depthPow: 1.35,
      scaleStep: 0.18,
      opacityStep: 0.48,
      centerBoost: 1.01,
      indexShift: +1,
    },
    {
      kind: "mid",
      y: 0,
      radius: 1080,
      window: WINDOW_MID,
      depthPow: 1.25,
      scaleStep: 0.14,
      opacityStep: 0.36,
      centerBoost: 1.07,
      indexShift: 0,
    },
    {
      kind: "bot",
      y: -210,
      radius: 1220,
      window: WINDOW_SUP,
      depthPow: 1.38,
      scaleStep: 0.19,
      opacityStep: 0.50,
      centerBoost: 1.01,
      indexShift: -2,
    },
  ];

  // ---------- drift like 100lostspecies ----------
  // This is key: drift is slow, constant, "alive".
  // ~0.11 index/sec => 1 card about every 9 seconds (gentle).
  const DRIFT_INDEX_PER_SEC = 0.11;

  // After user input, drift fades down then returns smoothly.
  const DRIFT_PAUSE_SEC = 1.1;
  const DRIFT_RETURN_SEC = 1.6;

  // Wheel/drag influence strength
  const WHEEL_STEP = 1;       // one wheel notch -> one card
  const DRAG_STEP_PX = 120;   // drag threshold -> one card

  // ---------- motion (spring settle like mass) ----------
  // currentIndex follows targetIndex with spring dynamics (heavy but controlled)
  const SPRING_K = 55;     // stiffness
  const SPRING_D = 15.5;   // damping

  let targetIndex = 0;
  let currentIndex = 0;
  let indexVel = 0;

  // We keep drift as a slowly increasing "targetIndex" over time.
  let driftAccum = 0;
  let lastInputAt = performance.now() / 1000;

  // INTRO -> ORBIT transition
  let mode = "INTRO";
  const INTRO_DUR = 1.35;               // seconds
  const INTRO_Z_FROM = 1600;
  const INTRO_Z_TO = 920;
  let introT = 0;

  // ---------- card texture ----------
  function makeLabelTexture(text, subtitle) {
    const w = 640, h = 420;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");

    g.fillStyle = "rgba(18,22,35,1)";
    g.fillRect(0, 0, w, h);

    g.strokeStyle = "rgba(240,240,255,0.20)";
    g.lineWidth = 6;
    g.strokeRect(18, 18, w - 36, h - 36);

    g.fillStyle = "rgba(240,240,255,0.92)";
    g.font = "700 46px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(text, 44, 98);

    g.fillStyle = "rgba(240,240,255,0.55)";
    g.font = "500 26px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    g.fillText(subtitle, 44, 140);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const cardGeo = new THREE.PlaneGeometry(340, 220);

  // Create 3 row groups
  const rowGroups = ROWS.map((row, rIdx) => {
    const group = new THREE.Group();
    group.position.y = row.y;
    scene.add(group);

    for (let i = 0; i < COUNT; i++) {
      const tex = makeLabelTexture(
        `Card ${i + 1}`,
        row.kind === "mid" ? "master row" : "support row"
      );

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(cardGeo, mat);
      mesh.userData = { index: i, row: rIdx };
      group.add(mesh);
    }

    return group;
  });

  // ---------- input ----------
  function markUserInput() {
    lastInputAt = performance.now() / 1000;
  }

  function stepTarget(dir) {
    targetIndex = clamp(targetIndex + dir, 0, COUNT - 1);
  }

  function onWheel(e) {
    const dy = e.deltaY;
    if (Math.abs(dy) < 2) return;
    markUserInput();
    stepTarget(dy > 0 ? +WHEEL_STEP : -WHEEL_STEP);
  }

  let down = false;
  let lastX = 0;
  let dragAcc = 0;

  function onPointerDown(e) {
    down = true;
    lastX = e.clientX;
    dragAcc = 0;
    markUserInput();
    renderer.domElement.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!down) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    dragAcc += dx;

    while (dragAcc > DRAG_STEP_PX) {
      markUserInput();
      stepTarget(-1); // drag right -> previous
      dragAcc -= DRAG_STEP_PX;
    }
    while (dragAcc < -DRAG_STEP_PX) {
      markUserInput();
      stepTarget(+1); // drag left -> next
      dragAcc += DRAG_STEP_PX;
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

  // ---------- layout (cards orbit around the camera) ----------
  function layoutMesh(mesh, rowCfg, offset, camPos) {
    const absO = Math.abs(offset);

    // windowing
    if (absO > rowCfg.window + 0.15) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    const isCenter = absO < 0.001;

    // Non-linear attention falloff
    const d = Math.pow(absO, rowCfg.depthPow);

    // Orbit angle: around YOU
    const ang = offset * STEP_ANGLE;

    // Center of orbit = camera position
    // ang=0 => in front of camera (negative Z direction)
    const R = rowCfg.radius;
    const x = camPos.x + Math.sin(ang) * R;
    const z = camPos.z - Math.cos(ang) * R;

    // additional depth push for edges (makes them disappear quicker)
    const z2 = z - d * 85;

    // vertical drop a bit towards edges
    const y = -d * 26;

    // scale / opacity (support rows harsher)
    let s = 1 - d * rowCfg.scaleStep;
    let op = 1 - d * rowCfg.opacityStep;

    // heavy center
    if (isCenter) {
      s = rowCfg.centerBoost;
      op = 1;
    }

    s = clamp(s, 0.42, rowCfg.centerBoost);
    op = clamp(op, 0.02, 1);

    mesh.position.set(x, y, z2);
    mesh.scale.setScalar(s);
    mesh.material.opacity = op;

    // Orientation: tangent-ish to orbit (critical for "I'm inside")
    // Facing direction depends on ang: rotate so it "wraps" around you.
    mesh.rotation.set(0, ang * 0.95, 0);

    // small extra yaw for drama
    mesh.rotation.y += clamp(-offset * 0.02, -0.10, 0.10);
  }

  function layoutAll() {
    const camPos = camera.position;

    for (let r = 0; r < ROWS.length; r++) {
      const rowCfg = ROWS[r];
      const group = rowGroups[r];
      group.position.y = rowCfg.y;

      for (const mesh of group.children) {
        const i = mesh.userData.index;

        // Phase shift for support rows (like parallax)
        const offset = (i + rowCfg.indexShift) - currentIndex;

        layoutMesh(mesh, rowCfg, offset, camPos);
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

  // ---------- loop ----------
  let last = performance.now();

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.033);
    last = now;

    // INTRO dolly-in to make "we dive inside"
    if (mode === "INTRO") {
      introT += dt;
      const u = clamp(introT / INTRO_DUR, 0, 1);
      const eased = smoothstep(0, 1, u);

      camera.position.z = lerp(INTRO_Z_FROM, INTRO_Z_TO, eased);
      camera.lookAt(0, 0, camera.position.z - 1);

      if (u >= 1) mode = "ORBIT";
    } else {
      // camera stays stable in ORBIT (centered experience)
      camera.lookAt(0, 0, camera.position.z - 1);
    }

    // Drift control: after input we pause then return
    const tSec = now / 1000;
    const sinceInput = tSec - lastInputAt;

    let driftMul = 1;
    if (sinceInput < DRIFT_PAUSE_SEC) {
      driftMul = 0;
    } else {
      const r = clamp((sinceInput - DRIFT_PAUSE_SEC) / DRIFT_RETURN_SEC, 0, 1);
      driftMul = smoothstep(0, 1, r);
    }

    // Apply drift into targetIndex (continuous)
    driftAccum += DRIFT_INDEX_PER_SEC * driftMul * dt;

    // We add drift to target, but keep inside bounds:
    // drift is subtle; user steps are discrete.
    const drifted = clamp(targetIndex + driftAccum, 0, COUNT - 1);

    // Spring towards drifted target
    const x = currentIndex;
    const v = indexVel;
    const target = drifted;

    const a = -SPRING_K * (x - target) - SPRING_D * v;
    indexVel = v + a * dt;
    currentIndex = x + indexVel * dt;
    currentIndex = clamp(currentIndex, 0, COUNT - 1);

    // When we hit bounds, bleed velocity (avoid jitter)
    if (currentIndex <= 0.0001 || currentIndex >= COUNT - 1 - 0.0001) {
      indexVel *= 0.6;
    }

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
