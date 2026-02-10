import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";
import { GALLERY_ITEMS } from "./data.js";

export function initMainGallery(opts){
  const {
    mountEl,      // контейнер в main.html
    overlayEl,    // html-оверлей для тексту/кнопок
  } = opts;

  // --- renderer
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, powerPreference:"high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
  mountEl.appendChild(renderer.domElement);

  // --- scene/camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, mountEl.clientWidth / mountEl.clientHeight, 0.1, 2000);
  camera.position.set(0, 0, 16);

  // --- group
  const group = new THREE.Group();
  scene.add(group);

  // --- simple planes placeholders
  const geom = new THREE.PlaneGeometry(6.2, 3.8, 1, 1);
  const mats = [];
  for (let i=0;i<GALLERY_ITEMS.length;i++){
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL((i*0.07)%1, 0.45, 0.35),
      transparent:true,
      opacity: 0.95
    });
    mats.push(mat);

    const mesh = new THREE.Mesh(geom, mat);
    group.add(mesh);
  }

  // layout (поки просто стрічка)
  const spacing = 8.0;
  group.children.forEach((m, i)=>{
    m.position.x = (i - (group.children.length-1)/2) * spacing;
  });

  // --- scroll model (поки заглушка)
  let target = 0;
  let current = 0;

  function onWheel(e){
    target += e.deltaY * 0.0025;
    target = Math.max(-1.6, Math.min(1.6, target));
  }
  window.addEventListener("wheel", onWheel, { passive:true });

  // --- animation
  let raf = 0;
  function tick(){
    current += (target - current) * 0.08;

    // move camera along x
    camera.position.x = current * 20;
    camera.lookAt(camera.position.x, 0, 0);

    // subtle parallax
    group.children.forEach((m, i)=>{
      const dx = m.position.x - camera.position.x;
      const depth = Math.min(1, Math.abs(dx)/40);
      m.material.opacity = 0.25 + (1-depth) * 0.75;
      m.rotation.y = dx * 0.01;
    });

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  // resize
  function onResize(){
    const w = mountEl.clientWidth;
    const h = mountEl.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);

  // cleanup
  return ()=> {
    cancelAnimationFrame(raf);
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", onResize);
    renderer.dispose();
    mats.forEach(m=>m.dispose());
    geom.dispose();
    mountEl.innerHTML = "";
  };
}
