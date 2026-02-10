// libs/main-gallery.js
import * as THREE from "./three.module.js";
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery({ mountEl }) {
  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35; // ВАЖЛИВО: підняли експозицію, щоб картки були видимі
  mountEl.appendChild(renderer.domElement);

  // ---------- scene/camera ----------
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    mountEl.clientWidth / mountEl.clientHeight,
    0.1,
    4000
  );
  camera.position.set(0, 0, 120);       // трохи вперед
  camera.lookAt(0, 0, -600);

  // ---------- light (робимо “видимо”, не темно) ----------
  const amb = new THREE.AmbientLight(0xffffff, 1.15);
  scene.add(amb);

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2, 3, 2);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xbcd7ff, 0.65);
  fill.position.set(-2, -1, 1);
  scene.add(fill);

  // ---------- subtle background “mist” planes ----------
  // (щоб не було відчуття порожнечі, але без туману який вбиває картки)
  const bgGeom = new THREE.PlaneGeometry(4000, 2400);
  const bgMat = new THREE.MeshBasicMaterial({
    color: 0x05070d,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
  });
  const bg = new THREE.Mesh(bgGeom, bgMat);
  bg.position.set(0, 0, -1400);
  scene.add(bg);

  // ---------- groups (3 bands) ----------
  const root = new THREE.Group();
  scene.add(root);

  const bands = [
    makeBand({ y: 120,  phase: 0.00, visible: 1.0 }),  // верхня (видима)
    makeBand({ y: -120, phase: 0.33, visible: 1.0 }),  // нижня (видима)
    makeBand({ y: 340,  phase: 0.66, visible: 0.0 }),  // третя зверху (спочатку прихована)
  ];
  bands.forEach(b => root.add(b.group));

  // ---------- controls / motion ----------
  let yaw = 0;              // “прокрутка” вздовж кільця
  let yawVel = 0;           // інерція
  let drag = false;
  let lastX = 0;
  let lastY = 0;

  // повільніший wheel (це саме те, що просив)
  const WHEEL_SENS = 0.00045;    // менше => повільніше
  const DRAG_SENS  = 0.0040;     // “перетяг”
  const DAMP       = 0.90;       // інерція / затухання

  // третя смуга: “витягування” вгору (0..1)
  let reveal = 0;
  let revealTarget = 0;

  // mouse parallax (трохи “всередині сфери” відчуття)
  let mx = 0, my = 0;
  let mxT = 0, myT = 0;

  const onWheel = (e) => {
    e.preventDefault();
    // Chrome дає deltaY ~ 100..120 за “тик”
    yawVel += e.deltaY * WHEEL_SENS;

    // якщо тягнемо скролом/жестом вгору — трошки відкриваємо 3-тю смугу
    if (e.deltaY < 0) revealTarget = Math.min(1, revealTarget + 0.10);
    if (e.deltaY > 0) revealTarget = Math.max(0, revealTarget - 0.06);
  };

  const onPointerDown = (e) => {
    drag = true;
    lastX = e.clientX;
    lastY = e.clientY;
    mountEl.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const w = Math.max(1, mountEl.clientWidth);
    const h = Math.max(1, mountEl.clientHeight);

    // parallax target
    mxT = (e.clientX / w) * 2 - 1;
    myT = (e.clientY / h) * 2 - 1;

    if (!drag) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    yawVel += -dx * DRAG_SENS * 0.35;

    // потягнув вгору => відкриваємо 3-тю смугу
    if (dy < -3) revealTarget = Math.min(1, revealTarget + 0.03);
    if (dy >  3) revealTarget = Math.max(0, revealTarget - 0.02);
  };

  const onPointerUp = (e) => {
    drag = false;
    mountEl.releasePointerCapture?.(e.pointerId);
  };

  mountEl.addEventListener("wheel", onWheel, { passive: false });
  mountEl.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  // ---------- animate ----------
  const clock = new THREE.Clock();

  function tick() {
    const dt = Math.min(0.033, clock.getDelta());

    // smooth mouse parallax
    mx += (mxT - mx) * (1 - Math.pow(0.001, dt));
    my += (myT - my) * (1 - Math.pow(0.001, dt));

    // apply inertia
    yaw += yawVel;
    yawVel *= Math.pow(DAMP, dt * 60);

    // smooth reveal
    reveal += (revealTarget - reveal) * (1 - Math.pow(0.001, dt));

    // subtle camera “inside sphere” feel
    camera.position.x = mx * 14;
    camera.position.y = -my * 10;
    camera.lookAt(0, 0, -650);

    // update bands
    // невеликий автодрейф як у 100lostspecies (ледь-ледь)
    const auto = dt * 0.08;
    bands[0].setProgress(yaw * 0.85 + auto);
    bands[1].setProgress(yaw * 0.85 + 1.5 * auto);
    bands[2].setProgress(yaw * 0.85 + 2.0 * auto);

    // третя смуга “вилазить зверху”
    const topBaseY = 340;
    bands[2].group.position.y = topBaseY - reveal * 260;      // опускаємо в зону видимості
    bands[2].setVisibility(reveal);

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

  // ---------- helpers ----------
  function makeBand({ y, phase, visible }) {
    const group = new THREE.Group();
    group.position.y = y;

    // МЕНШИЙ радіус => ближче/більше картки (було “далеко і малі”)
    const R = 520;

    const items = (Array.isArray(GALLERY_ITEMS) && GALLERY_ITEMS.length)
      ? GALLERY_ITEMS
      : Array.from({ length: 30 }, (_, i) => ({ title: `Картка ${i+1}` }));

    const perBand = Math.max(18, Math.min(40, items.length));
    const slice = [];
    for (let i = 0; i < perBand; i++) {
      slice.push(items[(i + Math.floor(phase * items.length)) % items.length]);
    }

    const cards = [];
    const cardW = 210;   // більші
    const cardH = 140;

    // матеріал: НЕ прозорий + трохи емісії => видно завжди
    function cardMaterial(hex) {
      return new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.55,
        metalness: 0.05,
        emissive: new THREE.Color(hex).multiplyScalar(0.12),
        emissiveIntensity: 1.0,
        transparent: false,
      });
    }

    const palette = [
      0x6b84ff, 0x56d6a8, 0xffb86b, 0xc084fc,
      0x94a3b8, 0x60a5fa, 0x34d399, 0xfca5a5,
    ];

    for (let i = 0; i < slice.length; i++) {
      const geom = new THREE.PlaneGeometry(cardW, cardH, 1, 1);
      const mat = cardMaterial(palette[i % palette.length]);
      const mesh = new THREE.Mesh(geom, mat);

      // slight rounded illusion via scale + softness (без текстур)
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      // ставимо на “внутрішню” сторону циліндра (ми ніби всередині)
      // Тобто plane дивиться в центр.
      const a = (i / slice.length) * Math.PI * 2;
      const x = Math.sin(a) * R;
      const z = -Math.cos(a) * R - 760;   // відсуваємо всю стрічку назад, щоб камера “дивилась” в неї
      mesh.position.set(x, 0, z);

      // повертаємо до центру/камери
      mesh.lookAt(0, 0, -760);

      // трошки “вигин” ефект: додатковий нахил назовні/всередину
      mesh.rotation.y += 0.25 * Math.sin(a);

      // зробимо стрічку більш “щільною” по вертикалі
      mesh.position.y = (Math.sin(a * 2.0) * 10);

      group.add(mesh);
      cards.push({ mesh, a0: a });
    }

    // легкий “glass” рефлекс поверх (щоб не було пласких прямокутників)
    const gloss = new THREE.Mesh(
      new THREE.PlaneGeometry(cardW, cardH),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
      })
    );
    // (клонуємо gloss під кожну картку)
    for (let i = 0; i < cards.length; i++) {
      const g = gloss.clone();
      g.position.copy(cards[i].mesh.position);
      g.rotation.copy(cards[i].mesh.rotation);
      g.scale.set(0.98, 0.98, 1);
      group.add(g);
    }

    // visibility
    group.traverse(obj => {
      if (obj.material && obj.material.transparent) obj.material.opacity *= visible;
    });
    group.visible = true;

    function setProgress(p) {
      // p рухає “стрічку” по колу
      for (let i = 0; i < cards.length; i++) {
        const a = cards[i].a0 + p;
        const x = Math.sin(a) * R;
        const z = -Math.cos(a) * R - 760;

        cards[i].mesh.position.x = x;
        cards[i].mesh.position.z = z;
        cards[i].mesh.lookAt(0, 0, -760);
        cards[i].mesh.rotation.y += 0.25 * Math.sin(a);

        // Динамічна яскравість: ближче до центру => трохи світліше
        const near = (1 + Math.cos(a)) * 0.5; // 0..1
        const boost = 0.85 + near * 0.25;
        cards[i].mesh.material.emissiveIntensity = boost;
      }
    }

    function setVisibility(v) {
      // v: 0..1
      group.traverse(obj => {
        if (obj.material && obj.material.transparent) {
          obj.material.opacity = 0.08 * v;
        }
      });
      // для стандартних матеріалів зробимо “появу” через scale
      group.scale.setScalar(0.92 + v * 0.08);
    }

    // ініт
    setProgress(phase * Math.PI * 2);
    setVisibility(visible);

    return { group, setProgress, setVisibility };
  }
}
