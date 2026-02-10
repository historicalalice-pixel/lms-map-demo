import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { GALLERY_ITEMS } from "./data.js";

/**
 * 100lostspecies-style main gallery:
 * - camera inside "sphere"
 * - 2 visible curved strips (rings)
 * - 3rd hidden ring above, revealed when looking up (pitch)
 * - yaw from wheel/trackpad
 * - pitch from mouse Y
 */
export function initMainGallery(opts){
  const { mountEl } = opts;

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  mountEl.appendChild(renderer.domElement);

  // ---------- scene/camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    3000
  );

  // camera is inside the sphere (near center)
  camera.position.set(0, 0, 0);

  // ---------- helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge0, edge1, x) => {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // ---------- ring layout (sphere-like) ----------
  // Think of a big sphere of radius R. Rings are "latitude" bands on it.
  const R = 55;                // sphere radius
  const COUNT_PER_RING = 18;   // cards per ring (placeholder)
  const ARC = Math.PI * 1.25;  // visible arc (not full circle, feels like a strip)

  // Ring latitudes (in radians)
  // Two visible: slightly below and above center.
  // Hidden third: higher (reveals when pitching up).
  const rings = [
    { id: "lower", lat: -0.20, speed:  0.0020, baseOpacity: 0.92 },
    { id: "upper", lat:  0.14, speed: -0.0016, baseOpacity: 0.86 },
    { id: "hiddenTop", lat: 0.52, speed: 0.0012, baseOpacity: 0.00 }, // will be controlled by pitch
  ];

  // Build planes (placeholder cards)
  const geom = new THREE.PlaneGeometry(6.4, 4.0, 1, 1);

  // We’ll reuse items; if not enough items, loop them.
  const items = GALLERY_ITEMS && GALLERY_ITEMS.length ? GALLERY_ITEMS : [];
  const totalNeeded = rings.length * COUNT_PER_RING;

  function makeColor(i){
    // nice muted palette for placeholders
    const c = new THREE.Color();
    c.setHSL((i * 0.07) % 1, 0.42, 0.34);
    return c;
  }

  const ringGroups = rings.map((r, ringIndex) => {
    const g = new THREE.Group();
    g.userData = { ...r, ringIndex };
    scene.add(g);

    for (let i = 0; i < COUNT_PER_RING; i++){
      const idx = (ringIndex * COUNT_PER_RING + i) % Math.max(1, items.length);
      const mat = new THREE.MeshBasicMaterial({
        color: makeColor(ringIndex * 100 + i),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData = {
        ringId: r.id,
        i,
        // store base
        baseOpacity: r.baseOpacity,
      };
      g.add(mesh);
    }

    return g;
  });

  // ---------- positioning on sphere ----------
  function layoutRing(group){
    const { lat } = group.userData;

    // For a given latitude, ring radius in XZ plane:
    const ringRadius = Math.cos(lat) * R;
    const y = Math.sin(lat) * R;

    // We’ll place planes along an arc centered in front of camera.
    // angle 0 is straight ahead (-Z direction).
    const start = -ARC * 0.5;
    const step = ARC / (COUNT_PER_RING - 1);

    group.children.forEach((m, i) => {
      const a = start + i * step;

      // sphere coordinates (camera at center):
      const x = Math.sin(a) * ringRadius;
      const z = -Math.cos(a) * ringRadius; // negative z = "forward"

      m.position.set(x, y, z);

      // Make each plane face the camera (center), but with slight outward curvature feel.
      // For inside-sphere effect: plane normal points towards center -> lookAt(0,0,0)
      m.lookAt(0, 0, 0);

      // Slight tilt for “gallery poster” vibe
      m.rotation.z += (i - (COUNT_PER_RING - 1) / 2) * 0.006;
    });
  }

  ringGroups.forEach(layoutRing);

  // ---------- controls: yaw/pitch ----------
  // yaw: rotate world around Y (scroll)
  // pitch: look up/down (mouse Y)
  let yawTarget = 0;
  let yaw = 0;

  let pitchTarget = 0;
  let pitch = 0;

  // Scroll → yaw
  function onWheel(e){
    // trackpad/wheel friendly
    yawTarget += e.deltaY * 0.0013;
    // keep it bounded a bit (feels like curated gallery)
    yawTarget = clamp(yawTarget, -2.4, 2.4);
  }
  window.addEventListener("wheel", onWheel, { passive: true });

  // Mouse Y → pitch (look up reveals hidden ring)
  let mx = 0, my = 0;
  function onMouseMove(e){
    mx = (e.clientX / window.innerWidth) - 0.5;
    my = (e.clientY / window.innerHeight) - 0.5;

    // negative my (mouse up) => look up (positive pitch)
    pitchTarget = clamp(-my * 0.85, -0.22, 0.55);
  }
  window.addEventListener("mousemove", onMouseMove, { passive: true });

  // ---------- auto drift ----------
  // two visible rings slowly drift even without input
  // We'll do it by slowly moving yawTarget baseline
  let autoT = 0;

  // ---------- render loop ----------
  let raf = 0;

  function tick(){
    autoT += 0.001;

    // Smooth yaw/pitch
    yaw = lerp(yaw, yawTarget, 0.08);
    pitch = lerp(pitch, pitchTarget, 0.08);

    // Apply yaw/pitch by rotating camera "look direction"
    // Camera stays at center; we rotate it (like inside a sphere).
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;

    // Ring local drift (each ring rotates a touch at its own speed)
    ringGroups.forEach((g) => {
      const spd = g.userData.speed;
      g.rotation.y += spd;

      // extra micro parallax from mouse X (very subtle)
      g.rotation.y += mx * 0.00035;
    });

    // Hidden ring reveal: based on pitch (looking up)
    // When pitch ~0.10..0.45 -> fade in.
    const reveal = smoothstep(0.08, 0.42, pitch);
    ringGroups.forEach((g) => {
      const isHidden = g.userData.id === "hiddenTop";

      g.children.forEach((m) => {
        // distance/angle fading: center items more visible, edges dimmer
        // Use angle-to-forward: project position to camera forward-ish
        const pos = m.position.clone();
        // note: group rotation affects world pos; easiest: use world pos
        m.getWorldPosition(pos);

        // forward is camera looking direction; in camera space, z is negative forward
        const v = pos.clone().applyMatrix4(camera.matrixWorldInverse);
        const depth = clamp((-v.z) / R, 0, 2); // ~1 around ring

        // center emphasis: items near center line are stronger
        const edge = clamp(Math.abs(v.x) / (R * 0.9), 0, 1);
        const centerBoost = 1 - Math.pow(edge, 1.25);

        let op = (0.20 + 0.80 * centerBoost) * (0.55 + 0.45 * clamp(depth, 0, 1));

        // Apply ring base + hidden reveal
        if (isHidden){
          op *= reveal; // fully hidden when not looking up
          // also soften it so it feels "behind"
          op *= 0.95;
        } else {
          op *= g.userData.baseOpacity;
        }

        // small dim when looking far down/up (keeps focus)
        const focus = 1 - Math.abs(pitch) * 0.25;
        op *= focus;

        m.material.opacity = clamp(op, 0, 1);

        // subtle "curve" feel: rotate slightly as it passes edges
        // (cheap DOF vibe: edge items slightly turned)
        const rotY = clamp(v.x / (R * 0.9), -1, 1) * 0.35;
        // We want rotation relative to facing center; since we already lookAt(0,0,0),
        // adjust around local Y a bit:
        m.rotation.y = m.rotation.y * 0.98 + rotY * 0.02;
      });
    });

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  tick();

  // ---------- resize ----------
  function onResize(){
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  // ---------- cleanup ----------
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("resize", onResize);

    ringGroups.forEach((g) => {
      g.children.forEach((m) => {
        m.geometry?.dispose?.();
        m.material?.dispose?.();
      });
      scene.remove(g);
    });

    geom.dispose();
    renderer.dispose();
    mountEl.innerHTML = "";
  };
}
