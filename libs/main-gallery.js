// libs/main-gallery.js
// 100lostspecies-like prototype (fixed):
// - INTRO -> ORBIT "dolly-in" feel
// - YOU are inside: camera settles at z=0, orbit center slightly ahead
// - 3 rows driven by ONE currentIndex (no indexShift => no ragged rows)
// - support rows differ by PHASE (angle offset), radius, opacity/scale
// - gentle auto-drift + user override (returns like 100lostspecies)

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

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 9000);
  camera.position.set(0, 0, 1600); // INTRO start (far)
  camera.lookAt(0, 0, -1);

  // ---------- content ----------
  const COUNT = 10;

  // ---------- orbit / inside-scene framing ----------
  // We place the ORBIT CENTER slightly ahead of the camera in -Z.
  // After INTRO, camera.z ~ 0, orbit center ~ -ORBIT_CENTER_AHEAD.
  const ORBIT_CENTER_AHEAD = 520;

  // Neighbor spacing around orbit (angle step per index)
  const STEP_ANGLE = (22 * Math.PI) / 180; // adjust later if needed

  // Visible windows
  const WINDOW_MID = 3;
  const WINDOW_SUP = 2;

  // ---------- rows (NO index shift; only angle phase) ----------
  const ROWS = [
    {
      kind: "top",
      y: +210,
      radius: 1320,
      window: WINDOW_SUP,
      phase: +0.35, // ✅ phase shift (not index shift)
      depthPow: 1.35,
      scaleStep: 0.20,
      opacityStep: 0.52,
      centerBoost: 1.01,
    },
    {
      kind: "mid",
      y: 0,
      radius: 1200,
      window: WINDOW_MID,
      phase: 0.0,
      depthPow: 1.25,
      scaleStep: 0.14,
      opacityStep: 0.36,
      centerBoost: 1.08,
    },
    {
      kind: "bot",
      y: -210,
      radius: 1380,
      window: WINDOW_SUP,
      phase: -0.55, // ✅ phase shift (not index shift)
      depthPow: 1.38,
      scaleStep: 0.21,
      opacityStep: 0.54,
      centerBoost: 1.01,
    },
  ];

  // ---------- drift like 100lostspecies ----------
  const DRIFT_INDEX_PER_SEC = 0.11; // ~1 card / 9 sec
  const DRIFT_PAUSE_SEC = 1.1;
  const DRIFT_RETURN_SEC = 1.6;

  // ---------- spring motion ----------
  const SPRING_K = 55;
  const SPRING_D = 15.5;

  let targetIndex = 0;    // discrete from user
  let currentIndex = 0;   // continuous
  let indexVel = 0;

  let driftAccum = 0;
  let lastInputAt = performance.now() / 1000;

  // ---------- INTRO -> ORBIT ----------
  let mode = "INTRO";
  const INTRO_DUR = 1.35;
  const INTRO_Z_FROM = 1600;
  const INTRO_Z_TO = 0; // ✅ camera ends at center
  let introT = 0;

  // ---------- card visuals (temporary labels) ----------
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

  // 3 row groups
  const rowGroups = ROWS.map((row) => {
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
      mesh.userData = { index: i };
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
    stepTarget(dy > 0 ? +1 : -1);
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

    const STEP_PX = 120;

    while (dragAcc > STEP_PX) {
      markUserInput();
      stepTarget(-1);
      dragAcc -= STEP_PX;
    }
    while (dragAcc < -STEP_PX) {
      markUserInput();
      stepTarget(+1);
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

  // ---------- layout (inside-scene orbit) ----------
  function layoutMesh(mesh, rowCfg, offset, orbitCenter) {
    const absO = Math.abs(offset);

    if (absO > rowCfg.window + 0.15) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    const isCenter = absO < 0.001;

    const d = Math.pow(absO, rowCfg.depthPow);

    // ✅ PHASE on angle (not on index)
    const ang = (offset + rowCfg.phase) * STEP_ANGLE;

    // Orbit around orbitCenter (you are near the center)
    const R = rowCfg.radius;
    const x = orbitCenter.x + Math.sin(ang) * R;
    const z = orbitCenter.z - Math.cos(ang) * R;

    // Push edges deeper so they disappear faster
    const z2 = z - d * 110;

    // Vertical drop towards edges
    const yLocal = -d * 28;

    let s = 1 - d * rowCfg.scaleStep;
    let op = 1 - d * rowCfg.opacityStep;

    if (isCenter) {
      s = rowCfg.centerBoost;
      op = 1;
    }

    s = clamp(s, 0.40, rowCfg.centerBoost);
    op = clamp(op, 0.02, 1);

    mesh.position.set(x, yLocal, z2);
    mesh.scale.setScalar(s);
    mesh.material.opacity = op;

    // Tangent-ish orientation (wrap around you)
    mesh.rotation.set(0, ang * 0.95, 0);
    mesh.rotation.y += clamp(-offset * 0.02, -0.10, 0.10);
  }

  function layoutAll() {
    // ✅ Orbit center is slightly ahead of the camera
    const orbitCenter = new THREE.Vector3(
      camera.position.x,
      0,
      camera.position.z - ORBIT_CENTER_AHEAD
    );

    for (let r = 0; r < ROWS.length; r++) {
      const rowCfg = ROWS[r];
      const group = rowGroups[r];
      group.position.y = rowCfg.y;

      for (const mesh of group.children) {
        const i = mesh.userData.index;
        const offset = i - currentIndex; // ✅ same for all rows (no ragged rows)
        layoutMesh(mesh, rowCfg, offset, orbitCenter);
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

    // INTRO dolly-in
    if (mode === "INTRO") {
      introT += dt;
      const u = clamp(introT / INTRO_DUR, 0, 1);
      const eased = smoothstep(0, 1, u);

      camera.position.z = lerp(INTRO_Z_FROM, INTRO_Z_TO, eased);
      camera.lookAt(0, 0, -1);

      if (u >= 1) mode = "ORBIT";
    } else {
      camera.lookAt(0, 0, -1);
    }

    // Drift multiplier: pause after input, then return smoothly
    const tSec = now / 1000;
    const sinceInput = tSec - lastInputAt;

    let driftMul = 1;
    if (sinceInput < DRIFT_PAUSE_SEC) {
      driftMul = 0;
    } else {
      const r = clamp((sinceInput - DRIFT_PAUSE_SEC) / DRIFT_RETURN_SEC, 0, 1);
      driftMul = smoothstep(0, 1, r);
    }

    // Apply drift to target (continuous), but keep bounds
    driftAccum += DRIFT_INDEX_PER_SEC * driftMul * dt;
    const driftedTarget = clamp(targetIndex + driftAccum, 0, COUNT - 1);

    // Spring towards driftedTarget
    const x = currentIndex;
    const v = indexVel;
    const target = driftedTarget;

    const a = -SPRING_K * (x - target) - SPRING_D * v;
    indexVel = v + a * dt;
    currentIndex = x + indexVel * dt;
    currentIndex = clamp(currentIndex, 0, COUNT - 1);

    // Bleed velocity at bounds
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
