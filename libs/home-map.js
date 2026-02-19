// libs/home-map.js
import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

const mount = document.getElementById("mapMount");
if (!mount) throw new Error("#mapMount not found");

const modal = document.getElementById("modal");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalCTA = document.getElementById("modalCTA");

// ---------- i18n ----------
const I18N = {
  uk: {
    navHome: "Головна",
    navAbout: "Про нас",
    navBlog: "Блог",
    heroTitle: "Історія — це простір.",
    heroSub: "Доторкнись до подій, щоб відкрити протокол.",
    hint: "Drag — move • Scroll — time • Click — preview",
    ctaEnter: "Увійти в простір",
    ctaBlog: "Читати блог →",
    lockedLine: "Повний доступ відкривається після входу.",
    unlockedLine: "Демо-прев’ю доступне. Повний урок — після входу.",
  },
  en: {
    navHome: "Home",
    navAbout: "About",
    navBlog: "Blog",
    heroTitle: "History is a space.",
    heroSub: "Touch events to activate the protocol.",
    hint: "Drag — move • Scroll — time • Click — preview",
    ctaEnter: "Enter the Space",
    ctaBlog: "Read the blog →",
    lockedLine: "Full access unlocks after sign-in.",
    unlockedLine: "Demo preview available. Full lesson after sign-in.",
  },
};

let currentLang = "uk";
function applyLang(lang) {
  currentLang = lang in I18N ? lang : "uk";
  const dict = I18N[currentLang];

  document.documentElement.lang = currentLang === "uk" ? "uk" : "en";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key && dict[key]) el.textContent = dict[key];
  });

  document.querySelectorAll(".lang-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === currentLang);
  });
}

document.querySelectorAll(".lang-btn").forEach((btn) => {
  btn.addEventListener("click", () => applyLang(btn.dataset.lang));
});
applyLang(currentLang);

// ---------- data (teaser nodes) ----------
const NODES = [
  {
    id: "1914",
    year: 1914,
    locked: false, // demo unlocked
    title: { uk: "Початок війни", en: "War begins" },
    teaser: {
      uk: "Як локальний конфлікт перетворився на світову війну — і чому це стало можливим.",
      en: "How a local crisis escalated into a world war — and why it was possible.",
    },
    bullets: {
      uk: ["Система союзів", "Мобілізація як тригер", "Перші фронти"],
      en: ["Alliance system", "Mobilization trigger", "Early fronts"],
    },
  },
  {
    id: "1915",
    year: 1915,
    locked: true,
    title: { uk: "Війна стає тотальною", en: "War turns total" },
    teaser: {
      uk: "Економіка, пропаганда і нові масштаби втрат змінюють правила гри.",
      en: "Economy, propaganda, and new scales of loss change the rules.",
    },
    bullets: {
      uk: ["Окопи", "Промисловість", "Втома суспільства"],
      en: ["Trenches", "Industry", "Societal fatigue"],
    },
  },
  {
    id: "1916",
    year: 1916,
    locked: true,
    title: { uk: "Верден / Сомма", en: "Verdun / Somme" },
    teaser: {
      uk: "Рік битв на виснаження. Чому перемога перестає бути швидкою.",
      en: "A year of attrition. Why victory stops being quick.",
    },
    bullets: {
      uk: ["Стратегія виснаження", "Технології", "Ціна метра землі"],
      en: ["Attrition strategy", "Technology", "Cost per meter"],
    },
  },
  {
    id: "1917",
    year: 1917,
    locked: false, // demo unlocked
    title: { uk: "Революції та злам", en: "Revolutions and rupture" },
    teaser: {
      uk: "Політичні вибухи змінюють карту Європи і логіку війни.",
      en: "Political shocks reshape Europe and the logic of war.",
    },
    bullets: {
      uk: ["Криза імперій", "Зміна режимів", "Радикалізація"],
      en: ["Imperial crisis", "Regime change", "Radicalization"],
    },
  },
  {
    id: "1918",
    year: 1918,
    locked: true,
    title: { uk: "Кінець війни", en: "War ends" },
    teaser: {
      uk: "Чому завершення війни не означало завершення конфліктів.",
      en: "Why ending the war didn’t end conflict.",
    },
    bullets: {
      uk: ["Перемир’я", "Наслідки", "Нова Європа"],
      en: ["Armistice", "Aftermath", "A new Europe"],
    },
  },
];

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(mount.clientWidth, mount.clientHeight);
mount.appendChild(renderer.domElement);

// scene/camera
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070a12, 10, 120);

const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 500);
camera.position.set(0, 6, 26);

// light (soft)
const amb = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(amb);

const key = new THREE.DirectionalLight(0xffffff, 0.7);
key.position.set(8, 14, 10);
scene.add(key);

// subtle background plane (to catch fog feel)
const bg = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 120),
  new THREE.MeshBasicMaterial({ color: 0x070a12, transparent: true, opacity: 0.35 })
);
bg.position.set(0, 0, -60);
scene.add(bg);

// ---------- node visuals ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-999, -999);

const group = new THREE.Group();
scene.add(group);

const baseGeom = new THREE.PlaneGeometry(5.6, 3.2, 1, 1);

function makeCardTexture({ year, title, locked }) {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 432;
  const ctx = c.getContext("2d");

  ctx.clearRect(0, 0, c.width, c.height);

  // backdrop
  ctx.fillStyle = "rgba(8,12,22,0.88)";
  roundRect(ctx, 26, 26, c.width - 52, c.height - 52, 28);
  ctx.fill();

  // border
  ctx.lineWidth = 2;
  ctx.strokeStyle = locked ? "rgba(160,190,255,0.16)" : "rgba(255,220,160,0.22)";
  roundRect(ctx, 26, 26, c.width - 52, c.height - 52, 28);
  ctx.stroke();

  // year
  ctx.font = "700 88px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = locked ? "rgba(190,215,255,0.70)" : "rgba(255,230,190,0.90)";
  ctx.fillText(String(year), 70, 140);

  // title
  ctx.font = "600 40px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillStyle = "rgba(233,238,249,0.92)";
  wrapText(ctx, title, 70, 210, 630, 46, 2);

  // status pill
  ctx.font = "600 26px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const pillText = locked ? (currentLang === "uk" ? "LOCKED" : "LOCKED") : (currentLang === "uk" ? "DEMO" : "DEMO");
  const pillW = ctx.measureText(pillText).width + 42;
  const pillX = c.width - pillW - 70;
  const pillY = 88;

  ctx.fillStyle = locked ? "rgba(120,150,210,0.14)" : "rgba(255,210,120,0.14)";
  roundRect(ctx, pillX, pillY, pillW, 44, 22);
  ctx.fill();

  ctx.fillStyle = locked ? "rgba(190,215,255,0.88)" : "rgba(255,230,190,0.92)";
  ctx.fillText(pillText, pillX + 21, pillY + 32);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  tex.anisotropy = 4;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).split(" ");
  let line = "";
  let lines = 0;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + " ";
    const w = ctx.measureText(test).width;
    if (w > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, y + lines * lineHeight);
      line = words[n] + " ";
      lines++;
      if (lines >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, y + lines * lineHeight);
}

const warm = new THREE.Color(0xF5C27A);
const cold = new THREE.Color(0x6A86A8);

function makeNodeMesh(node) {
  const tex = makeCardTexture({
    year: node.year,
    title: node.title[currentLang],
    locked: node.locked,
  });

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(baseGeom, mat);

  // glow sprite behind
  const glowMat = new THREE.SpriteMaterial({
    color: node.locked ? cold : warm,
    transparent: true,
    opacity: node.locked ? 0.14 : 0.28,
    depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(12, 7, 1);
  glow.position.set(0, 0, -0.2);
  mesh.add(glow);

  mesh.userData.node = node;
  mesh.userData.glow = glow;
  mesh.userData.baseY = mesh.position.y;
  mesh.userData.hover = 0;
  return mesh;
}

// layout nodes along X (timeline strip)
const spacing = 7.8;
const startX = -((NODES.length - 1) * spacing) / 2;

const meshes = [];
for (let i = 0; i < NODES.length; i++) {
  const node = NODES[i];
  const m = makeNodeMesh(node);
  m.position.set(startX + i * spacing, 0, 0);
  // slight depth staggering for parallax
  m.position.z = -Math.abs(i - (NODES.length - 1) / 2) * 0.25;
  group.add(m);
  meshes.push(m);
}

// ---------- interaction ----------
let dragging = false;
let dragX0 = 0;
let groupX0 = 0;
let vx = 0;

function setPointerFromEvent(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  pointer.set(x, y);
}

renderer.domElement.addEventListener("pointerdown", (ev) => {
  dragging = true;
  dragX0 = ev.clientX;
  groupX0 = group.position.x;
  vx = 0;
  renderer.domElement.setPointerCapture(ev.pointerId);
});

renderer.domElement.addEventListener("pointermove", (ev) => {
  setPointerFromEvent(ev);
  if (!dragging) return;
  const dx = ev.clientX - dragX0;
  group.position.x = groupX0 + dx * 0.025;
  vx = dx * 0.0006;
});

renderer.domElement.addEventListener("pointerup", (ev) => {
  dragging = false;
  renderer.domElement.releasePointerCapture(ev.pointerId);
});

renderer.domElement.addEventListener("wheel", (ev) => {
  // scroll moves time
  group.position.x += -ev.deltaY * 0.0022;
}, { passive: true });

// modal
function openModal(node) {
  const dict = I18N[currentLang];

  modalTitle.textContent = `${node.year} — ${node.title[currentLang]}`;
  const bullets = node.bullets[currentLang] || [];
  const bulletHtml = bullets.length
    ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
    : "";

  const line = node.locked ? dict.lockedLine : dict.unlockedLine;

  modalBody.innerHTML = `
    <p>${escapeHtml(node.teaser[currentLang] || "")}</p>
    ${bulletHtml}
    <p style="margin-top:10px;opacity:.9">${escapeHtml(line)}</p>
  `;

  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
}

modalClose?.addEventListener("click", closeModal);
modal?.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

modalCTA?.addEventListener("click", () => {
  // поки що: просто ведемо в space.html (або ти можеш замінити на login overlay)
  window.location.href = "./space.html";
});

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- animation loop ----------
let last = performance.now();
let t = 0;

function animate(now) {
  const dt = Math.min(33, now - last);
  last = now;
  t += dt * 0.001;

  // cinematic camera drift
  const targetCamX = Math.sin(t * 0.35) * 0.8;
  const targetCamY = 6 + Math.cos(t * 0.28) * 0.45;
  camera.position.x += (targetCamX - camera.position.x) * 0.02;
  camera.position.y += (targetCamY - camera.position.y) * 0.02;
  camera.lookAt(0, 0.4, 0);

  // inertia
  if (!dragging) {
    group.position.x += vx * 60;
    vx *= 0.92;
  }

  // hover detection
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(meshes, true);
  const hit = hits.find((h) => h.object?.userData?.node) || null;

  for (const m of meshes) {
    const isHover = hit && hit.object === m;
    const h = isHover ? 1 : 0;
    m.userData.hover += (h - m.userData.hover) * 0.12;

    const k = m.userData.hover;

    // lift + subtle scale
    m.position.y = k * 0.35;
    const s = 1 + k * 0.045;
    m.scale.set(s, s, 1);

    // glow intensify
    const glow = m.userData.glow;
    if (glow) {
      glow.material.opacity = (m.userData.node.locked ? 0.14 : 0.28) + k * 0.22;
      glow.scale.set(12 + k * 2.2, 7 + k * 1.1, 1);
    }
  }

  // click handling (avoid click when dragged)
  // (simple approach: if pointer is down and moved, it won't click; browser handles)
  // We'll attach click listener once:
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

renderer.domElement.addEventListener("click", (ev) => {
  // If user is dragging heavily, ignore click
  if (Math.abs(vx) > 0.02) return;

  setPointerFromEvent(ev);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(meshes, true);
  const h = hits.find((x) => x.object?.userData?.node);
  if (!h) return;

  const node = h.object.userData.node;
  openModal(node);
});

requestAnimationFrame(animate);

// resize
function onResize() {
  const w = mount.clientWidth;
  const h = mount.clientHeight;
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", onResize);
onResize();
