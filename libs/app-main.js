import * as THREE from "three";

/**
 * Step 1 (architecture scaffold):
 * - AppShell (render loop, resize)
 * - CameraRig (physical camera motion placeholder)
 * - InputController (collects intent)
 * - WorldSphere (places cards on inner sphere surface) -> visible!
 *
 * Next steps:
 * - ParallaxSystem
 * - VisibilityFocus
 */
export function startMain(mountEl) {
  // ---------- AppShell ----------
  mountEl.innerHTML = "";

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  mountEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    5000
  );

  // lights so objects are definitely visible
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(2, 4, 3);
  scene.add(key);

  // ---------- InputController ----------
  const input = createInputController(renderer.domElement);

  // ---------- CameraRig ----------
  const rig = createCameraRig(camera);

  // ---------- WorldSphere ----------
  const world = createWorldSphere();
  scene.add(world.root);

  // ---------- resize ----------
  function onResize() {
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  // ---------- loop ----------
  const clock = new THREE.Clock();

  function tick() {
    const dt = Math.min(0.033, clock.getDelta());

    // 1) input -> intent
    input.update();

    // 2) camera physics
    rig.step(dt, input.intent);

    // 3) (Step 1) world does NOT move with input (by design)
    // later: ParallaxSystem will add render-offset to cards

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  return {
    destroy() {
      window.removeEventListener("resize", onResize);
      input.destroy();
      renderer.dispose();
      mountEl.innerHTML = "";
    },
  };
}

// ==========================
// InputController (intent)
// ==========================
function createInputController(domEl) {
  const state = {
    mx: 0, my: 0,
    down: false,
    lastX: 0, lastY: 0,
    wheel: 0,
    intent: { yawImpulse: 0, pitchImpulse: 0 },
  };

  function onMove(e) {
    const r = domEl.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    state.mx = (nx - 0.5) * 2;
    state.my = (ny - 0.5) * 2;

    if (!state.down) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;

    // drag -> impulses (gentle)
    state.intent.yawImpulse += (-dx) * 0.00006;
    state.intent.pitchImpulse += (-dy) * 0.00005;
  }

  function onDown(e) {
    state.down = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  }

  function onUp() {
    state.down = false;
  }

  function onWheel(e) {
    e.preventDefault();
    // slower wheel by design
    const d = Math.max(-140, Math.min(140, e.deltaY));
    state.wheel += d;
  }

  domEl.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  domEl.addEventListener("wheel", onWheel, { passive: false });

  return {
    intent: state.intent,
    update() {
      // wheel -> yaw impulse (very slow)
      if (state.wheel !== 0) {
        state.intent.yawImpulse += state.wheel * 0.0000022;
        state.wheel *= 0.75; // decay
        if (Math.abs(state.wheel) < 0.1) state.wheel = 0;
      }
    },
    destroy() {
      domEl.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      domEl.removeEventListener("wheel", onWheel);
    }
  };
}

// ==========================
// CameraRig (physics)
// ==========================
function createCameraRig(camera) {
  // spherical “inside” viewpoint
  const rig = {
    yaw: 0,
    pitch: 0.10,
    yawVel: 0,
    pitchVel: 0,

    // tuning (feel)
    damping: 0.88,          // inertia
    maxYawVel: 0.020,
    maxPitchVel: 0.014,

    // parallax-ish micro drift
    driftT: 0,

    step(dt, intent) {
      // impulses -> velocities
      this.yawVel += intent.yawImpulse;
      this.pitchVel += intent.pitchImpulse;

      // clamp
      this.yawVel = clamp(this.yawVel, -this.maxYawVel, this.maxYawVel);
      this.pitchVel = clamp(this.pitchVel, -this.maxPitchVel, this.maxPitchVel);

      // integrate
      this.yaw += this.yawVel;
      this.pitch += this.pitchVel;

      // pitch bounds (no flip)
      this.pitch = clamp(this.pitch, -0.35, 0.55);

      // damping
      const d = Math.pow(this.damping, dt * 60);
      this.yawVel *= d;
      this.pitchVel *= d;

      // reset consumed impulses (important!)
      intent.yawImpulse = 0;
      intent.pitchImpulse = 0;

      // apply pose to camera
      // camera stays near origin, but direction changes (like “head”)
      const lookDist = 1200;
      const cx = 0;
      const cy = 0;
      const cz = 120;

      camera.position.set(cx, cy, cz);

      // micro drift
      this.driftT += dt;
      const driftX = Math.sin(this.driftT * 0.6) * 2.2;
      const driftY = Math.cos(this.driftT * 0.5) * 1.6;

      const dir = sphericalDir(this.yaw, this.pitch);
      camera.lookAt(
        cx + dir.x * lookDist + driftX,
        cy + dir.y * lookDist + driftY,
        cz + dir.z * lookDist
      );
    }
  };

  return rig;
}

// ==========================
// WorldSphere (visible content)
// ==========================
function createWorldSphere() {
  const root = new THREE.Group();

  // Inner sphere layout:
  // cards placed on sphere surface, facing inward (toward center)
  const R = 1100;
  const CARD_W = 190;
  const CARD_H = 120;

  const geo = new THREE.PlaneGeometry(CARD_W, CARD_H);

  // Create a pool of visible “cards”
  const N = 120;

  for (let i = 0; i < N; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: randomNiceColor(i),
      roughness: 0.65,
      metalness: 0.05,
      emissiveIntensity: 0.8,
      emissive: new THREE.Color(0xffffff).multiplyScalar(0.08),
      transparent: false
    });

    const m = new THREE.Mesh(geo, mat);

    // latitude bands with noise (not perfect rows)
    // lat in [-0.55..0.55] but biased toward center
    const lat = biasedRandom(-0.55, 0.55, 0.60) + (Math.random() - 0.5) * 0.06;
    const lon = Math.random() * Math.PI * 2;

    // sphere coords
    const pos = sphericalPos(R, lon, lat);

    // small jitter (organic, avoids “mechanism”)
    pos.x += (Math.random() - 0.5) * 40;
    pos.y += (Math.random() - 0.5) * 34;
    pos.z += (Math.random() - 0.5) * 40;

    m.position.copy(pos);

    // face inward (toward center)
    m.lookAt(0, 0, 0);

    // slight tilt noise but keep readable
    m.rotation.z += (Math.random() - 0.5) * 0.10;

    // slight scale variance
    const s = 0.90 + Math.random() * 0.22;
    m.scale.setScalar(s);

    root.add(m);
  }

  return { root };
}

// ---------- math helpers ----------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function sphericalDir(yaw, pitch) {
  // forward direction from yaw/pitch
  const cp = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cp,
  };
}

function sphericalPos(R, lon, lat) {
  // lon: 0..2pi, lat: -pi/2..pi/2 scaled
  const cl = Math.cos(lat);
  return new THREE.Vector3(
    Math.cos(lon) * cl * R,
    Math.sin(lat) * R,
    Math.sin(lon) * cl * R
  );
}

function biasedRandom(min, max, biasToCenter = 0.6) {
  // biasToCenter: 0..1 (closer to 1 => more mass around 0)
  const u = Math.random();
  const v = (Math.random() + Math.random()) * 0.5; // bell-ish
  const t = lerp(u, v, biasToCenter);
  return min + (max - min) * t;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function randomNiceColor(i) {
  const palette = [
    0x60a5fa, 0x34d399, 0xa78bfa, 0xfbbf24,
    0xfb7185, 0x22c55e, 0x38bdf8, 0xc084fc
  ];
  return palette[i % palette.length];
}
