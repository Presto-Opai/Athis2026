/* ============================================================
   NAVET PANIQUE ! — FPS de jardin normand (rendu réaliste)
   Monde construit depuis plan.json (corrigé par l'auteur via
   editeur-plan.html) : coordonnées en mètres,
   x: ouest→est (0..60), z: nord→sud (0..36)
   ============================================================ */
'use strict';

// ---------- petites aides ----------
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => t * t * (3 - 2 * t);
const W = 60, D = 36;                       // dimensions du terrain (m)
const P = (x, z) => new THREE.Vector3(x - W / 2, 0, z - D / 2); // plan → monde

// ---------- état global ----------
const state = {
  mode: 'menu',            // menu | play | pause | over
  hp: 100, score: 0, wave: 0, kills: 0,
  ammo: 12, ammoMax: 15,
  zombies: [], navets: [], chunks: [],
  lastHurt: 0, harvestT: 0, waveT: 0, betweenWaves: true, _pending: 0,
};

// ---------- relief du terrain ----------
// douces ondulations, aplaties autour du bâti (zones plan.json + marge)
const flatZones = [
  { x: 16.5, z: 27, hw: 15.8, hd: 4.6 },   // maison 1 (longère 30 m)
  { x: 9.75, z: 17, hw: 6.0, hd: 4.0 },    // maison 2
  { x: 3.25, z: 17, hw: 2.6, hd: 3.7 },    // appentis
  { x: 23.25, z: 21.5, hw: 9.1, hd: 3.9 }, // cour pavée
  { x: 12.5, z: 4, hw: 5.2, hd: 2.7 },     // potager
  { x: 36.5, z: 29.5, hw: 4.5, hd: 3.5 },  // entrée / portail
  { x: 15.25, z: 22, hw: 1.2, hd: 2.8 },   // mur porte blanche
  { x: 50.25, z: 4.25, hw: 2.0, hd: 1.7 }, // cabane d'enfant
];
function heightAt(px, pz) {
  let m = 1;
  for (const f of flatZones) {
    const dx = Math.max(0, Math.abs(px - f.x) - f.hw);
    const dz = Math.max(0, Math.abs(pz - f.z) - f.hd);
    m = Math.min(m, smooth(clamp(Math.hypot(dx, dz) / 2.2, 0, 1)));
  }
  if (m <= 0) return 0;
  const h = 0.22 * Math.sin(px * 0.33 + 1.3) + 0.17 * Math.sin(pz * 0.47 + 0.6)
    + 0.11 * Math.sin((px + pz) * 0.71) + 0.05 * Math.sin(px * 1.9) * Math.sin(pz * 1.7);
  return h * m;
}
const hAtWorld = (wx, wz) => heightAt(wx + W / 2, wz + D / 2);

// ---------- tactile ? ----------
const IS_TOUCH = ('ontouchstart' in window) || matchMedia('(pointer: coarse)').matches;
if (IS_TOUCH) document.body.classList.add('touch');
const PIX_CAP = IS_TOUCH ? 1.3 : 1.75;

// ---------- rendu ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, PIX_CAP));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe2cba6, 36, 120);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 300);
camera.rotation.order = 'YXZ';

// --- post-traitement : bloom doux + FXAA ---
const composer = new THREE.EffectComposer(renderer);
composer.addPass(new THREE.RenderPass(scene, camera));
const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.30, 0.55, 0.85);
composer.addPass(bloom);
const fxaa = new THREE.ShaderPass(THREE.FXAAShader);
composer.addPass(fxaa);

function resize() {
  const pr = Math.min(devicePixelRatio, PIX_CAP);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- ciel : COUCHER DE SOLEIL d'hiver à l'ouest ----------
const SUN_DIR = new THREE.Vector3(-0.66, 0.20, 0.27).normalize(); // couchant, ouest-sud-ouest, ~15°
{
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  // sur le dôme, l'horizon est à v ≈ 0.5
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#56708e');
  gr.addColorStop(0.28, '#8e9aa6');
  gr.addColorStop(0.42, '#c9a98a');
  gr.addColorStop(0.50, '#f0a862');
  gr.addColorStop(0.60, '#e0905a');
  gr.addColorStop(1, '#c9854f');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  // grand halo incandescent posé sur l'horizon (l'ouest ≈ u 0.25)
  const sx = 1024 * 0.25, sy = 512 * 0.49;
  let halo = g.createRadialGradient(sx, sy, 8, sx, sy, 330);
  halo.addColorStop(0, 'rgba(255,214,150,0.95)');
  halo.addColorStop(0.3, 'rgba(252,184,110,0.55)');
  halo.addColorStop(1, 'rgba(252,184,110,0)');
  g.fillStyle = halo; g.fillRect(0, 0, 1024, 512);
  halo = g.createRadialGradient(sx, sy, 4, sx, sy, 110);
  halo.addColorStop(0, 'rgba(255,240,210,1)');
  halo.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = halo; g.fillRect(0, 0, 1024, 512);
  // stratus rosés, soulignés par-dessous
  for (let i = 0; i < 55; i++) {
    const y = rand(30, 250);
    const cx = rand(0, 1024);
    const warm = 1 - Math.min(1, Math.hypot((cx - sx) / 520, (y - sy) / 320));
    g.fillStyle = `rgba(${irand(225, 250)},${Math.round(rand(190, 215) + warm * 25)},${Math.round(rand(175, 200) - warm * 35)},${rand(0.10, 0.30)})`;
    g.beginPath();
    g.ellipse(cx, y, rand(70, 230), rand(5, 15), 0, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 18),
    new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.rotation.y = Math.PI * 1.25;
  scene.add(dome);
  // disque solaire éclatant, posé sur l'horizon
  const sc = document.createElement('canvas'); sc.width = 256; sc.height = 256;
  const sg = sc.getContext('2d');
  const srg = sg.createRadialGradient(128, 128, 14, 128, 128, 126);
  srg.addColorStop(0, 'rgba(255,252,240,1)');
  srg.addColorStop(0.24, 'rgba(255,238,190,1)');
  srg.addColorStop(0.50, 'rgba(255,200,130,0.45)');
  srg.addColorStop(1, 'rgba(255,190,120,0)');
  sg.fillStyle = srg; sg.fillRect(0, 0, 256, 256);
  const st = new THREE.CanvasTexture(sc); st.encoding = THREE.sRGBEncoding;
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: st, transparent: true, fog: false, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending,
  }));
  sun.position.copy(SUN_DIR).multiplyScalar(148);
  sun.scale.setScalar(64);
  sun.renderOrder = 1;
  window._sun = sun;
  scene.add(sun);
}

// lumières : soleil couchant orangé + ciel bleu froid en face
const hemi = new THREE.HemisphereLight(0xaec0d6, 0x86795e, 0.62);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffb878, 1.75);
sunLight.position.copy(SUN_DIR).multiplyScalar(60);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(IS_TOUCH ? 2048 : 4096, IS_TOUCH ? 2048 : 4096);
sunLight.shadow.camera.left = -48; sunLight.shadow.camera.right = 48;
sunLight.shadow.camera.top = 48; sunLight.shadow.camera.bottom = -48;
sunLight.shadow.camera.far = 180; sunLight.shadow.bias = -0.0003;
sunLight.shadow.normalBias = 0.02;
scene.add(sunLight);
const fill = new THREE.DirectionalLight(0x8fa8c8, 0.30); // rebond froid opposé
fill.position.set(30, 18, -20);
scene.add(fill);

// ---------- textures procédurales (couleur + relief) ----------
function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
function texOf(cnv, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(cnv);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// — pierre : moellons irréguliers, joints creusés, lichens —
function drawStone(g, w, h, bump) {
  g.fillStyle = bump ? '#5a5a5a' : '#8a8071'; g.fillRect(0, 0, w, h);
  const stones = [];
  for (let y = 0; y < h + 30; y += rand(26, 40)) {
    for (let x = -20; x < w + 20; x += rand(30, 58)) {
      stones.push([x + rand(-6, 6), y + rand(-5, 5), rand(20, 46), rand(15, 26)]);
    }
  }
  for (const [x, y, rw, rh] of stones) {
    if (bump) {
      const gr = g.createRadialGradient(x, y - rh * 0.15, 2, x, y, rw * 0.62);
      gr.addColorStop(0, `rgb(${irand(190, 230)},${irand(190, 230)},${irand(190, 230)})`);
      gr.addColorStop(0.85, '#9a9a9a'); gr.addColorStop(1, '#3a3a3a');
      g.fillStyle = gr;
    } else {
      g.fillStyle = `hsl(${rand(26, 44)},${rand(10, 24)}%,${rand(38, 62)}%)`;
    }
    g.beginPath(); g.ellipse(x, y, rw / 2, rh / 2, rand(-.25, .25), 0, 7); g.fill();
    if (!bump) {
      g.strokeStyle = 'rgba(48,40,30,.45)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = 'rgba(255,250,235,.07)';
      g.beginPath(); g.ellipse(x - rw * 0.12, y - rh * 0.18, rw / 3, rh / 3.4, 0, 0, 7); g.fill();
    }
  }
  if (!bump) for (let i = 0; i < 130; i++) {
    g.fillStyle = Math.random() < 0.5
      ? `rgba(${irand(150, 185)},${irand(160, 180)},${irand(95, 125)},${rand(.12, .3)})`
      : `rgba(${irand(200, 220)},${irand(195, 210)},${irand(160, 175)},${rand(.10, .22)})`;
    g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(2, 9), 0, 7); g.fill();
  }
}
const stoneCanvas = makeCanvas(512, 512, (g, w, h) => drawStone(g, w, h, false));
const stoneBumpCanvas = makeCanvas(512, 512, (g, w, h) => drawStone(g, w, h, true));

// — tuiles plates brunes, rangées décalées, mousse —
function drawRoof(g, w, h, bump) {
  g.fillStyle = bump ? '#777' : '#63473a'; g.fillRect(0, 0, w, h);
  const tw = 36, th = 26;
  for (let y = 0; y < h; y += th) {
    for (let x = -tw; x < w + tw; x += tw) {
      const o = (y / th) % 2 ? tw / 2 : 0;
      if (bump) {
        const gr = g.createLinearGradient(0, y, 0, y + th);
        gr.addColorStop(0, '#c8c8c8'); gr.addColorStop(0.8, '#888'); gr.addColorStop(1, '#222');
        g.fillStyle = gr;
      } else {
        g.fillStyle = `hsl(${rand(12, 28)},${rand(24, 38)}%,${rand(27, 42)}%)`;
      }
      g.fillRect(x + o + 1, y + 1, tw - 2, th - 2);
      if (!bump) {
        g.fillStyle = 'rgba(255,235,210,.06)'; g.fillRect(x + o + 1, y + 1, tw - 2, 5);
        g.fillStyle = 'rgba(20,10,5,.35)'; g.fillRect(x + o + 1, y + th - 4, tw - 2, 3);
      }
    }
  }
  if (!bump) for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${irand(120, 165)},${irand(140, 170)},${irand(70, 100)},${rand(.15, .45)})`;
    g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(2, 10), 0, 7); g.fill();
  }
}
const roofCanvas = makeCanvas(512, 512, (g, w, h) => drawRoof(g, w, h, false));
const roofBumpCanvas = makeCanvas(512, 512, (g, w, h) => drawRoof(g, w, h, true));

// — pelouse d'hiver —
const grassCanvas = makeCanvas(1024, 1024, (g, w, h) => {
  g.fillStyle = '#6f7b50'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `hsl(${rand(55, 105)},${rand(16, 34)}%,${rand(24, 46)}%)`;
    const x = rand(0, w), y = rand(0, h);
    g.fillRect(x, y, rand(1, 3), rand(2, 5));
  }
  for (let i = 0; i < 120; i++) {
    const moss = Math.random() < 0.6;
    g.fillStyle = moss
      ? `rgba(${irand(110, 145)},${irand(130, 150)},${irand(55, 80)},${rand(.18, .4)})`
      : `rgba(${irand(120, 150)},${irand(95, 115)},${irand(60, 80)},${rand(.15, .35)})`;
    g.beginPath(); g.ellipse(rand(0, w), rand(0, h), rand(14, 70), rand(10, 45), rand(0, 3), 0, 7); g.fill();
  }
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `hsla(${rand(18, 38)},${rand(35, 60)}%,${rand(30, 50)}%,${rand(.5, .95)})`;
    g.save(); g.translate(rand(0, w), rand(0, h)); g.rotate(rand(0, 3));
    g.beginPath(); g.ellipse(0, 0, rand(2.5, 5), rand(1.5, 2.6), 0, 0, 7); g.fill();
    g.restore();
  }
});
const grassBumpCanvas = makeCanvas(512, 512, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgb(${irand(60, 200)},${irand(60, 200)},${irand(60, 200)})`;
    g.fillRect(rand(0, w), rand(0, h), 2, 2);
  }
});

// — pavés de la cour, joints moussus —
const pavingCanvas = makeCanvas(512, 512, (g, w, h) => {
  g.fillStyle = '#4d5244'; g.fillRect(0, 0, w, h);
  for (let y = 6; y < h; y += 84) {
    for (let x = 6; x < w; x += 104) {
      const dx = rand(-4, 4), dy = rand(-4, 4);
      g.fillStyle = `hsl(${rand(28, 46)},${rand(6, 12)}%,${rand(38, 52)}%)`;
      g.beginPath(); g.roundRect(x + dx, y + dy, 88, 68, 16); g.fill();
      g.fillStyle = 'rgba(255,250,240,.05)';
      g.beginPath(); g.roundRect(x + dx + 6, y + dy + 5, 76, 22, 12); g.fill();
      for (let k = 0; k < 3; k++) {
        g.fillStyle = `rgba(${irand(85, 115)},${irand(95, 120)},${irand(55, 78)},${rand(.12, .25)})`;
        g.beginPath(); g.arc(x + dx + rand(0, 88), y + dy + rand(0, 68), rand(3, 10), 0, 7); g.fill();
      }
    }
  }
});
const pavingBumpCanvas = makeCanvas(512, 512, (g, w, h) => {
  g.fillStyle = '#303030'; g.fillRect(0, 0, w, h);
  for (let y = 6; y < h; y += 84) for (let x = 6; x < w; x += 104) {
    const gr = g.createRadialGradient(x + 44, y + 34, 6, x + 44, y + 34, 60);
    gr.addColorStop(0, '#d8d8d8'); gr.addColorStop(0.8, '#a0a0a0'); gr.addColorStop(1, '#303030');
    g.fillStyle = gr;
    g.beginPath(); g.roundRect(x, y, 88, 68, 16); g.fill();
  }
});

// — terre du potager en sillons —
const dirtCanvas = makeCanvas(512, 512, (g, w, h) => {
  g.fillStyle = '#7a5f43'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 56) {
    const gr = g.createLinearGradient(0, y, 0, y + 56);
    gr.addColorStop(0, '#8d7050'); gr.addColorStop(0.45, '#6b5138'); gr.addColorStop(0.55, '#5d4630'); gr.addColorStop(1, '#8d7050');
    g.fillStyle = gr; g.fillRect(0, y, w, 56);
  }
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(${irand(70, 140)},${irand(55, 105)},${irand(35, 70)},.7)`;
    g.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 3));
  }
});
const dirtBumpCanvas = makeCanvas(256, 256, (g, w, h) => {
  for (let y = 0; y < h; y += 28) {
    const gr = g.createLinearGradient(0, y, 0, y + 28);
    gr.addColorStop(0, '#cfcfcf'); gr.addColorStop(0.5, '#3a3a3a'); gr.addColorStop(1, '#cfcfcf');
    g.fillStyle = gr; g.fillRect(0, y, w, 28);
  }
});

// — feuillage de haie (laurier) —
const hedgeCanvas = makeCanvas(512, 512, (g, w, h) => {
  g.fillStyle = '#24351e'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    const lum = rand(14, 42);
    g.fillStyle = `hsl(${rand(82, 132)},${rand(24, 42)}%,${lum}%)`;
    g.save(); g.translate(rand(0, w), rand(0, h)); g.rotate(rand(0, 3));
    g.beginPath(); g.ellipse(0, 0, rand(5, 11), rand(3, 6), 0, 0, 7); g.fill();
    if (lum > 32) { g.strokeStyle = 'rgba(255,255,230,.12)'; g.lineWidth = 1; g.stroke(); }
    g.restore();
  }
});
const hedgeBumpCanvas = makeCanvas(256, 256, (g, w, h) => {
  g.fillStyle = '#777'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const gr = g.createRadialGradient(0, 0, 1, 0, 0, 7);
    gr.addColorStop(0, '#ddd'); gr.addColorStop(1, '#333');
    g.save(); g.translate(rand(0, w), rand(0, h));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill(); g.restore();
  }
});

// — écorce —
const barkCanvas = makeCanvas(256, 256, (g, w, h) => {
  g.fillStyle = '#5d4c3a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${irand(40, 85)},${irand(34, 68)},${irand(24, 48)},.8)`;
    g.lineWidth = rand(2, 6);
    g.beginPath();
    let x = rand(0, w); g.moveTo(x, 0);
    for (let y = 0; y < h; y += 32) g.lineTo(x + rand(-8, 8), y);
    g.stroke();
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(${irand(120, 160)},${irand(140, 160)},${irand(90, 120)},.18)`;
    g.beginPath(); g.arc(rand(0, w), rand(0, h), rand(2, 7), 0, 7); g.fill();
  }
});
const barkBumpCanvas = makeCanvas(256, 256, (g, w, h) => {
  g.fillStyle = '#888'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = Math.random() < 0.5 ? '#bbb' : '#444';
    g.lineWidth = rand(2, 7);
    g.beginPath();
    let x = rand(0, w); g.moveTo(x, 0);
    for (let y = 0; y < h; y += 32) g.lineTo(x + rand(-8, 8), y);
    g.stroke();
  }
});

// — fenêtres : sombres-reflet ou allumées chaudes —
function windowCanvas(lit) {
  return makeCanvas(128, 160, (g, w, h) => {
    g.fillStyle = '#ece9df'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8d4c6'; g.fillRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#ece9df'; g.fillRect(6, 6, w - 12, h - 12);
    if (lit) {
      const gr = g.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w);
      gr.addColorStop(0, '#ffd98e'); gr.addColorStop(0.6, '#e8a953'); gr.addColorStop(1, '#9a5f2e');
      g.fillStyle = gr;
    } else {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#5d6e78'); gr.addColorStop(0.45, '#2e3a42');
      gr.addColorStop(0.55, '#46555e'); gr.addColorStop(1, '#28323a');
      g.fillStyle = gr;
    }
    g.fillRect(10, 10, w - 20, h - 20);
    if (!lit) {
      g.fillStyle = 'rgba(235,190,150,.30)'; // reflet du couchant
      g.beginPath(); g.moveTo(14, 60); g.lineTo(50, 10); g.lineTo(80, 10); g.lineTo(30, 80); g.closePath(); g.fill();
    }
    g.strokeStyle = '#ece9df'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, h - 10); g.stroke();
    for (let i = 1; i < 3; i++) {
      g.beginPath(); g.moveTo(10, 10 + (h - 20) * i / 3); g.lineTo(w - 10, 10 + (h - 20) * i / 3); g.stroke();
    }
  });
}
const texWindow = texOf(windowCanvas(false));
const texWindowLit = texOf(windowCanvas(true));
const texDoorWhite = texOf(makeCanvas(128, 224, (g, w, h) => {
  g.fillStyle = '#eeede4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f6f5ec';
  g.fillRect(10, 8, w - 20, h - 16);
  g.strokeStyle = '#c9c6b8'; g.lineWidth = 4;
  g.strokeRect(10, 8, w - 20, h - 16);
  g.strokeRect(24, 22, w - 48, h * 0.36);
  g.strokeRect(24, h * 0.5, w - 48, h * 0.38);
  g.fillStyle = 'rgba(0,0,0,.08)';
  g.fillRect(26, 24, w - 52, 8); g.fillRect(26, h * 0.5 + 2, w - 52, 8);
  g.fillStyle = '#8d8a7c'; g.beginPath(); g.arc(w - 24, h * 0.5, 5, 0, 7); g.fill();
}));
const texDoorGrey = texOf(makeCanvas(128, 224, (g, w, h) => {
  g.fillStyle = '#7d8a92'; g.fillRect(0, 0, w, h);
  for (let y = 8; y < h; y += 26) {
    g.fillStyle = (y / 26) % 2 ? '#75828a' : '#82909a';
    g.fillRect(6, y, w - 12, 22);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(6, y, w - 12, 4);
  }
  g.fillStyle = '#5d6a72'; g.beginPath(); g.arc(w - 22, h / 2, 5, 0, 7); g.fill();
}));
const texIvy = (() => {
  const c = makeCanvas(256, 256, (g) => {
    for (let i = 0; i < 900; i++) {
      const a = rand(0, Math.PI * 2), r = Math.pow(Math.random(), 0.6) * 118;
      g.fillStyle = `hsla(${rand(82, 128)},${rand(26, 44)}%,${rand(15, 38)}%,${rand(.6, 1)})`;
      g.save(); g.translate(128 + Math.cos(a) * r, 128 + Math.sin(a) * r * 1.06); g.rotate(rand(0, 3));
      g.beginPath(); g.ellipse(0, 0, rand(4, 9), rand(3, 7), 0, 0, 7); g.fill(); g.restore();
    }
  });
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
})();
// touffe d'herbe (alpha)
const tuftCanvas = makeCanvas(128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 38; i++) {
    const x0 = rand(18, 110), bend = rand(-26, 26), hgt = rand(45, 105);
    const hue = rand(48, 95), sat = rand(22, 44), lum = rand(34, 60);
    g.strokeStyle = `hsl(${hue},${sat}%,${lum}%)`;
    g.lineWidth = rand(2.5, 5);
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, 128);
    g.quadraticCurveTo(x0 + bend * 0.3, 128 - hgt * 0.6, x0 + bend, 128 - hgt);
    g.stroke();
  }
});

// ---------- matériaux ----------
function std(opts) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.95, metalness: 0 }, opts)); }
// feuillage texturé teinté (la couleur module la texture de laurier)
function leafMat(tint, rx = 2, ry = 2) {
  return std({
    map: texOf(hedgeCanvas, rx, ry), color: tint,
    bumpMap: texOf(hedgeBumpCanvas, rx * 2, ry * 2, false), bumpScale: 0.05, roughness: 0.88,
  });
}
const M = {
  grass: std({ map: texOf(grassCanvas, 14, 9), bumpMap: texOf(grassBumpCanvas, 28, 18, false), bumpScale: 0.04 }),
  paving: std({ map: texOf(pavingCanvas, 5.6, 2.4), bumpMap: texOf(pavingBumpCanvas, 5.6, 2.4, false), bumpScale: 0.05, roughness: 0.9 }),
  dirt: std({ map: texOf(dirtCanvas, 2.6, 1.2), bumpMap: texOf(dirtBumpCanvas, 5.2, 2.4, false), bumpScale: 0.09 }),
  hedge: std({ map: texOf(hedgeCanvas, 4, 1), bumpMap: texOf(hedgeBumpCanvas, 8, 2, false), bumpScale: 0.06, roughness: 0.85 }),
  bark: std({ map: texOf(barkCanvas, 1, 2), bumpMap: texOf(barkBumpCanvas, 1, 2, false), bumpScale: 0.05 }),
  stone: std({ map: texOf(stoneCanvas, 2, 1), bumpMap: texOf(stoneBumpCanvas, 2, 1, false), bumpScale: 0.045 }),
  white: std({ color: 0xeceadf, roughness: 0.7 }),
  granite: std({ color: 0x77797c, roughness: 0.75 }),
  greenTable: std({ color: 0x47704c, roughness: 0.6, metalness: 0.15 }),
  thuya: leafMat(0x9ab87a, 3, 3),
  thuyaLight: leafMat(0xb8d08c, 3, 3),
  thuyaDry: leafMat(0xc8a868, 3, 3),
  bush: leafMat(0xf0f4e8, 2.5, 2.5),
  bushLight: leafMat(0xd8e8b0, 2.5, 2.5),
  wood: std({ color: 0x5d4c3a, roughness: 0.9 }),
  navet: std({ color: 0xede7f2, roughness: 0.5 }),
  navetTop: std({ color: 0x7a539c, roughness: 0.55 }),
  leaf: std({ color: 0x44612f, roughness: 0.85 }),
  hortensia: leafMat(0xe0aeb2, 2, 2),
  tuft: new THREE.MeshLambertMaterial({ map: texOf(tuftCanvas, 1, 1), alphaTest: 0.35, side: THREE.DoubleSide }),
};

// ---------- collisions ----------
const boxColliders = [];
const discColliders = [];
// h = hauteur du sommet (m) : seuls les colliders sous le navet l'arrêtent
function addBox(x, z, w, d, h = 3.4) { boxColliders.push({ x, z, hw: w / 2, hd: d / 2, h }); }
function addDisc(x, z, r, h = 3.4) { discColliders.push({ x, z, r, h }); }
function collide(px, pz, r) {
  for (const b of boxColliders) {
    const dx = clamp(px, b.x - b.hw, b.x + b.hw) - px;
    const dz = clamp(pz, b.z - b.hd, b.z + b.hd) - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.001;
      px += dx / d * (d - r); pz += dz / d * (d - r);
    }
  }
  for (const c of discColliders) {
    const dx = px - c.x, dz = pz - c.z, rr = r + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      px = c.x + dx / d * rr; pz = c.z + dz / d * rr;
    }
  }
  return [px, pz];
}
// un navet vole : seuls les obstacles plus hauts que lui le stoppent
// (les murets bas et le feu de camp le laissent passer pour toucher les zombies)
function navetBlocked(px, pz, y, r) {
  for (const b of boxColliders) {
    if (y > b.h) continue;
    const dx = clamp(px, b.x - b.hw, b.x + b.hw) - px;
    const dz = clamp(pz, b.z - b.hd, b.z + b.hd) - pz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  for (const c of discColliders) {
    if (y > c.h) continue;
    const dx = px - c.x, dz = pz - c.z, rr = r + c.r;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}

// ============================================================
//  CONSTRUCTION DU MONDE — d'après plan.json
// ============================================================
const world = new THREE.Group(); scene.add(world);

function mesh(geo, mat, x, y, z, cast = true, recv = true, onGround = false) {
  const m = new THREE.Mesh(geo, mat);
  const p = P(x, z);
  m.position.set(p.x, y + (onGround ? heightAt(x, z) : 0), p.z);
  m.castShadow = cast; m.receiveShadow = recv;
  world.add(m); return m;
}

// --- sol vallonné ---
{
  const geo = new THREE.PlaneGeometry(W + 70, D + 70, 150, 96);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i), wz = pos.getZ(i);
    pos.setY(i, heightAt(wx + W / 2, wz + D / 2));
  }
  geo.computeVertexNormals();
  const g = new THREE.Mesh(geo, M.grass);
  g.receiveShadow = true; world.add(g);
  // cour pavée (14.9..31.6, 18.3..24.7)
  const cour = mesh(new THREE.PlaneGeometry(16.7, 6.45), M.paving, 23.25, 0.02, 21.5, false, true);
  cour.rotation.x = -Math.PI / 2;
  // potager (8..17, 2..6)
  const pot = mesh(new THREE.PlaneGeometry(9, 4.2), M.dirt, 12.5, 0.03, 4, false, true);
  pot.rotation.x = -Math.PI / 2;
  // chemin à l'est
  const chMat = std({ map: texOf(makeCanvas(256, 256, (g2, w2, h2) => {
    g2.fillStyle = '#a08a66'; g2.fillRect(0, 0, w2, h2);
    for (let i = 0; i < 900; i++) {
      g2.fillStyle = `rgba(${irand(130, 190)},${irand(110, 160)},${irand(80, 120)},.7)`;
      g2.beginPath(); g2.arc(rand(0, w2), rand(0, h2), rand(1, 3.5), 0, 7); g2.fill();
    }
  }), 2, 12), roughness: 0.95 });
  const ch = new THREE.Mesh(new THREE.PlaneGeometry(5, D + 8, 8, 40), chMat);
  ch.rotation.x = -Math.PI / 2;
  {
    const pp = P(58, D / 2); ch.position.set(pp.x, 0.04, pp.z);
    const cpos = ch.geometry.attributes.position;
    for (let i = 0; i < cpos.count; i++) {
      const wx = cpos.getX(i) + pp.x, wz = -cpos.getY(i) + pp.z;
      cpos.setZ(i, hAtWorld(wx, wz));
    }
    ch.geometry.computeVertexNormals();
    ch.receiveShadow = true; world.add(ch);
  }
  // entrée en terre battue devant le portail
  const ent = mesh(new THREE.PlaneGeometry(3.6, 9), std({ color: 0x9c8866, roughness: 0.95 }), 36, 0.025, 27, false, true);
  ent.rotation.x = -Math.PI / 2;
}

// --- herbe instanciée : touffes d'hiver ---
{
  const quad = new THREE.PlaneGeometry(0.6, 0.42);
  quad.translate(0, 0.21, 0);
  const quad2 = quad.clone(); quad2.rotateY(Math.PI / 2);
  const cross = new THREE.BufferGeometry();
  const p1 = quad.attributes.position.array, p2 = quad2.attributes.position.array;
  const u1 = quad.attributes.uv.array, n1 = quad.attributes.normal.array, n2 = quad2.attributes.normal.array;
  cross.setAttribute('position', new THREE.Float32BufferAttribute([...p1, ...p2], 3));
  cross.setAttribute('uv', new THREE.Float32BufferAttribute([...u1, ...u1], 2));
  cross.setAttribute('normal', new THREE.Float32BufferAttribute([...n1, ...n2], 3));
  cross.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]);
  const COUNT = IS_TOUCH ? 4500 : 9000;
  const inst = new THREE.InstancedMesh(cross, M.tuft, COUNT);
  inst.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const colr = new THREE.Color();
  let placed = 0, guard = 0;
  const blocked = (x, z) =>
    x < 1.6 || x > 53 || z < 2 || z > 30.4 ||                  // bords, haies, sud
    (x < 32.2 && z > 17.9) && !(x > 15.8 && z < 18.3) && (z > 17.9 && (x < 32.2)) && (z > 17.9 && x < 32.2) ||
    (x > 1 && x < 15.6 && z > 13.4 && z < 20.6) ||             // maison 2 + appentis
    (x > 7.6 && x < 17.4 && z > 1.6 && z < 6.4) ||             // potager
    (x > 33 && x < 40 && z > 26 && z < 31) ||                  // entrée portail
    (Math.hypot(x - 20.75, z - 10.75) < 1.0) ||               // feu de camp
    (x > 48.5 && x < 52 && z > 2.8 && z < 5.7) ||             // cabane d'enfant
    (x > 9.4 && x < 11.1 && z > 7.8 && z < 9.2);              // bac à compost
  while (placed < COUNT && guard++ < COUNT * 14) {
    const x = rand(1.2, 56), z = rand(1.2, 35);
    if (blocked(x, z)) continue;
    const p = P(x, z);
    dummy.position.set(p.x, heightAt(x, z), p.z);
    dummy.rotation.set(0, rand(0, Math.PI), rand(-0.07, 0.07));
    dummy.scale.setScalar(rand(0.55, 1.5));
    dummy.updateMatrix();
    inst.setMatrixAt(placed, dummy.matrix);
    colr.setHSL(rand(0.12, 0.24), rand(0.22, 0.4), rand(0.45, 0.68));
    inst.setColorAt(placed, colr);
    placed++;
  }
  inst.count = placed;
  world.add(inst);
}

// --- maison à pignons en pierre ---
function house(cx, cz, w, d, eave, ridge, opts = {}) {
  const grp = new THREE.Group();
  const p = P(cx, cz); grp.position.set(p.x, 0, p.z);
  const wallMat = std({
    map: texOf(stoneCanvas, Math.max(1, w / 4), Math.max(1, eave / 3)),
    bumpMap: texOf(stoneBumpCanvas, Math.max(1, w / 4), Math.max(1, eave / 3), false), bumpScale: 0.05,
  });
  const gblMat = std({
    map: texOf(stoneCanvas, 0.25, 0.33),
    bumpMap: texOf(stoneBumpCanvas, 0.25, 0.33, false), bumpScale: 0.05,
  });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, eave, d), wallMat);
  walls.position.y = eave / 2; walls.castShadow = walls.receiveShadow = true;
  grp.add(walls);
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, ridge - eave); shape.closePath();
    const gbl = new THREE.Mesh(new THREE.ShapeGeometry(shape), gblMat);
    gbl.position.set(0, eave, s * (d / 2 - 0.01));
    if (s < 0) gbl.rotation.y = Math.PI;
    gbl.castShadow = true; grp.add(gbl);
  }
  const roofMat = std({
    map: texOf(roofCanvas, Math.max(1.4, w / 6), 1.6),
    bumpMap: texOf(roofBumpCanvas, Math.max(1.4, w / 6), 1.6, false), bumpScale: 0.06, roughness: 0.9,
  });
  if (opts.ridgeZ) {
    // faîtage le long de la profondeur (z) : pans est/ouest, pignons vers ±z
    const slope = Math.hypot(w / 2 + 0.35, ridge - eave);
    const ang = Math.atan2(ridge - eave, w / 2 + 0.35);
    for (const s of [-1, 1]) {
      const pan = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.14, d + 0.7), roofMat);
      pan.position.set(s * (w / 4 + 0.07), (eave + ridge) / 2, 0);
      pan.rotation.z = -s * ang;
      pan.castShadow = pan.receiveShadow = true;
      grp.add(pan);
    }
    const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, d + 0.7), roofMat);
    ridgeBeam.position.y = ridge + 0.02; ridgeBeam.castShadow = true; grp.add(ridgeBeam);
  } else {
    const slope = Math.hypot(d / 2 + 0.35, ridge - eave);
    const ang = Math.atan2(ridge - eave, d / 2 + 0.35);
    // toits : pans nord/sud (faîtage le long de la longueur)
    for (const s of [-1, 1]) {
      const pan = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.14, slope), roofMat);
      pan.position.set(0, (eave + ridge) / 2, s * (d / 4 + 0.07));
      pan.rotation.x = s * ang;
      pan.castShadow = pan.receiveShadow = true;
      grp.add(pan);
    }
    const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.18, 0.3), roofMat);
    ridgeBeam.position.y = ridge + 0.02; ridgeBeam.castShadow = true; grp.add(ridgeBeam);
  }
  for (const chx of (opts.chimneys || [])) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.9), gblMat);
    ch.position.set(chx, ridge + 0.35, 0); ch.castShadow = true; grp.add(ch);
  }
  const ivyN = irand(2, 5);
  for (let i = 0; i < ivyN; i++) {
    const im = new THREE.Mesh(new THREE.PlaneGeometry(rand(1.6, 3.2), rand(2, eave + 0.7)),
      new THREE.MeshLambertMaterial({ map: texIvy, transparent: true, depthWrite: false }));
    const side = Math.random() < 0.5 ? -1 : 1;
    if (Math.random() < 0.5) { im.position.set(rand(-w / 2 + 1.5, w / 2 - 1.5), rand(1, 1.7), side * (d / 2 + 0.04)); if (side < 0) im.rotation.y = Math.PI; }
    else { im.position.set(side * (w / 2 + 0.04), rand(1, 1.7), rand(-d / 2 + 1.5, d / 2 - 1.5)); im.rotation.y = side * Math.PI / 2; }
    grp.add(im);
  }
  world.add(grp);
  addBox(cx, cz, w, d);
  return grp;
}
function plaque(parent, tex, w, h, x, y, z, ry = 0, lit = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    lit ? new THREE.MeshBasicMaterial({ map: tex })
      : std({ map: tex, roughness: 0.55, metalness: 0.05 }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}

// MAISON 1 — longère principale de 30 m (1.4..31.6, 23.1..30.9)
const maison1 = house(16.5, 27, 30.25, 7.75, 3.1, 5.8, { chimneys: [-5, 8] });
{
  const zN = -3.875 - 0.04; // face nord (côté cour & jardin)
  for (const [fx, lit] of [[-13, false], [-9.5, true], [-6, false], [-2.5, false], [1, false], [5, true], [9, true]]) {
    plaque(maison1, lit ? texWindowLit : texWindow, 1.1, 1.4, fx, 1.5, zN, Math.PI, lit);
  }
  plaque(maison1, texDoorWhite, 1.3, 2.2, 3.2, 1.1, zN, Math.PI);  // porte sur la cour
  const zS = 3.875 + 0.04;
  for (const fx of [-11, -6.5, -2, 2.5, 7]) plaque(maison1, texWindow, 1.1, 1.4, fx, 1.5, zS);
  plaque(maison1, texDoorWhite, 1.3, 2.2, 11, 1.1, zS);          // porte-fenêtre côté portail
  plaque(maison1, texWindow, 0.95, 1.15, 11, 3.0, zS);           // fenêtre d'étage au-dessus
  const linteau = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.16), M.granite);
  linteau.position.set(11, 2.32, zS); linteau.castShadow = true; maison1.add(linteau); // linteau en pierre
}

// MAISON 2 — dépendance (4.5..15, 13.75..20.25), pignon vers la cour
const maison2 = house(9.75, 17, 10.5, 6.5, 3.0, 5.2, { ridgeZ: true });
{
  // pignon sud (face à la cour & à la table verte) : une porte-fenêtre centrée
  plaque(maison2, texDoorWhite, 1.5, 2.2, 0, 1.1, 3.25 + 0.04);
  // mur est (vers la cour et la longère) : une porte-fenêtre + une fenêtre
  plaque(maison2, texDoorWhite, 1.4, 2.2, 5.25 + 0.04, 1.1, 1.4, Math.PI / 2);
  plaque(maison2, texWindow, 1.0, 1.3, 5.25 + 0.04, 1.5, -1.4, Math.PI / 2);
  // mur ouest : une fenêtre qui donne sur l'appentis à vélos
  plaque(maison2, texWindow, 1.0, 1.3, -5.25 - 0.04, 1.5, 0, -Math.PI / 2);
  // pignon nord (face au potager) : seulement une fenêtre moyenne en hauteur (étage)
  plaque(maison2, texWindowLit, 1.1, 1.2, 0, 2.9, -3.25 - 0.04, Math.PI, true);
}

// --- APPENTIS vélos (1.375..5.125, 14..20) ---
{
  const grp = new THREE.Group(); const p = P(3.25, 17); grp.position.set(p.x, 0, p.z);
  const roofMat = std({ map: texOf(roofCanvas, 1.4, 2.2), bumpMap: texOf(roofBumpCanvas, 1.4, 2.2, false), bumpScale: 0.06 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.1, 6.4), roofMat);
  roof.position.y = 2.45; roof.rotation.z = 0.18; roof.castShadow = true; grp.add(roof);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 6), M.wood);
  back.position.set(-1.68, 1.3, 0); back.castShadow = true; grp.add(back);
  for (const pz of [-2.8, 0, 2.8]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.16), M.wood);
    post.position.set(1.68, 1.1, pz); post.castShadow = true; grp.add(post);
  }
  for (let i = 0; i < 2; i++) {
    const bike = new THREE.Group();
    const wG = new THREE.TorusGeometry(0.32, 0.035, 8, 18);
    const mW = std({ color: 0x2e2e2e, roughness: 0.6, metalness: 0.4 });
    const w1 = new THREE.Mesh(wG, mW); w1.position.set(-0.42, 0.32, 0);
    const w2 = new THREE.Mesh(wG, mW); w2.position.set(0.42, 0.32, 0);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05),
      std({ color: i ? 0x6e3a3a : 0x3a566e, roughness: 0.45, metalness: 0.5 }));
    bar.position.y = 0.62; bar.rotation.z = 0.25;
    bike.add(w1, w2, bar);
    bike.position.set(rand(-0.6, 0.6), 0, -1.4 + i * 1.6);
    bike.rotation.y = Math.PI / 2 + rand(-.2, .2);
    grp.add(bike);
  }
  world.add(grp);
  addBox(3.25, 17, 3.75, 6.2);
}

// --- mur de pierres + PORTE BLANCHE (15.25, 22 — l 0.7, p 4.2) ---
{
  mesh(new THREE.BoxGeometry(0.7, 2.5, 4.2), M.stone, 15.25, 1.25, 22);
  addBox(15.25, 22, 0.75, 4.2);
  mesh(new THREE.BoxGeometry(0.9, 0.12, 4.3), M.granite, 15.25, 2.56, 22);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), std({ map: texDoorWhite, roughness: 0.55 }));
  const dp = P(15.25 - 0.36, 22); door.position.set(dp.x, 1.1, dp.z); door.rotation.y = -Math.PI / 2;
  world.add(door);
  const door2 = door.clone(); door2.position.x = P(15.25 + 0.36, 22).x; door2.rotation.y = Math.PI / 2;
  world.add(door2);
}

// --- clôture sud + PORTAIL BLANC « 92 » + boîte aux lettres ---
function picketGate(cx, cz, width, opening = 0) {
  const grp = new THREE.Group(); const p = P(cx, cz); grp.position.set(p.x, heightAt(cx, cz), p.z);
  const n = Math.floor(width / 0.17);
  for (let i = 0; i < n; i++) {
    const pk = new THREE.Mesh(new THREE.BoxGeometry(0.09, rand(0.98, 1.06), 0.03), M.white);
    pk.position.set(-width / 2 + 0.08 + i * 0.17, 0.62, 0); pk.castShadow = true; grp.add(pk);
  }
  for (const y of [0.35, 0.92]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.035), M.white);
    rail.position.y = y; grp.add(rail);
  }
  grp.rotation.y = opening;
  world.add(grp); return grp;
}
{
  mesh(new THREE.BoxGeometry(3, 1.1, 0.45), M.stone, 33.5, 0.55, 31, true, true, true);
  mesh(new THREE.BoxGeometry(3, 1.1, 0.75), M.stone, 39.5, 0.55, 31, true, true, true);
  addBox(33.5, 31, 3, 0.5); addBox(39.5, 31, 3, 0.8);
  picketGate(35.8, 31, 1.5, -0.25);
  picketGate(37.4, 31, 1.4, 0.35);
  addBox(36.6, 31, 3.2, 0.4); // le portail reste fermé (les zombies sautent par-dessus !)
  mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), M.granite, 38.3, 0.75, 31, true, true, true);
  mesh(new THREE.BoxGeometry(0.42, 0.32, 0.3), std({ color: 0x2a5e38, roughness: 0.5, metalness: 0.3 }), 38.3, 1.6, 31, true, true, true);
  const t92 = texOf(makeCanvas(64, 40, (g) => {
    g.fillStyle = '#f6f5ec'; g.fillRect(0, 0, 64, 40);
    g.strokeStyle = '#8a2e2e'; g.lineWidth = 3; g.strokeRect(2, 2, 60, 36);
    g.fillStyle = '#8a2e2e'; g.font = 'bold 26px Georgia'; g.textAlign = 'center'; g.fillText('92', 32, 30);
  }));
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), std({ map: t92, roughness: 0.5 }));
  const pp = P(35.1, 30.96); pl.position.set(pp.x, 0.95 + heightAt(35.1, 30.9), pp.z - 0.26); pl.rotation.y = Math.PI; world.add(pl);
}

// --- PORTAIL BLANC « 86 » au bout du chemin (58, 31.25 — l 5.5) ---
{
  mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), M.granite, 55.5, 0.75, 31.25, true, true, true);
  mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), M.granite, 60.5, 0.75, 31.25, true, true, true);
  picketGate(56.9, 31.25, 2.5, 0.12);
  picketGate(59.3, 31.25, 2.4, -0.08);
  addBox(58, 31.25, 5.5, 0.75); // lui aussi reste fermé
  const t86 = texOf(makeCanvas(64, 40, (g) => {
    g.fillStyle = '#f6f5ec'; g.fillRect(0, 0, 64, 40);
    g.strokeStyle = '#2e4a8a'; g.lineWidth = 3; g.strokeRect(2, 2, 60, 36);
    g.fillStyle = '#2e4a8a'; g.font = 'bold 26px Georgia'; g.textAlign = 'center'; g.fillText('86', 32, 30);
  }));
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), std({ map: t86, roughness: 0.5 }));
  const pp = P(55.5, 31.25); pl.position.set(pp.x, 1.05 + heightAt(55.5, 31.25), pp.z - 0.17); pl.rotation.y = Math.PI; world.add(pl);
}

// --- haies (positions plan.json, brèches pour les zombies) ---
function hedgeRow(x1, z1, x2, z2, h = 2.2, th = 1.4) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const horiz = Math.abs(x2 - x1) > Math.abs(z2 - z1);
  const g = new THREE.BoxGeometry(horiz ? len : th, h, horiz ? th : len,
    Math.max(1, Math.round(len / 1.2)), 3, 2);
  const posA = g.attributes.position;
  for (let i = 0; i < posA.count; i++) {
    posA.setX(i, posA.getX(i) + rand(-0.07, 0.07));
    posA.setY(i, posA.getY(i) + rand(-0.06, 0.06));
    posA.setZ(i, posA.getZ(i) + rand(-0.07, 0.07));
  }
  g.computeVertexNormals();
  const base = hAtWorld(...(() => { const p = P(cx, cz); return [p.x, p.z]; })());
  mesh(g, M.hedge, cx, h / 2 - 0.25 + base, cz);
  const bumps = Math.floor(len / 2.0);
  for (let i = 0; i < bumps; i++) {
    const t = (i + 0.5) / bumps;
    const bx = x1 + (x2 - x1) * t, bz = z1 + (z2 - z1) * t;
    mesh(new THREE.SphereGeometry(rand(0.7, 1.15), 8, 7),
      Math.random() < .3 ? M.bushLight : M.hedge,
      bx + rand(-.2, .2), h - rand(0.05, .4) + base, bz + rand(-.2, .2));
  }
  addBox(cx, cz, horiz ? len : th, horiz ? th : len);
}
hedgeRow(0, 0.7, 30, 0.7);                    // haie épaisse NO
hedgeRow(33, 1.25, 53, 1.25, 2.2, 2.2);       // haie épaisse NE (brèche 30..33)
hedgeRow(0.7, 0, 0.7, 36);                    // haie ouest
hedgeRow(53.75, 0, 53.75, 8.5);               // haie est nord
hedgeRow(55, 18.63, 55, 30.38, 2.2, 1.0);     // haie est sud (brèche 8.5..18.6)
hedgeRow(0, 31.25, 14, 31.25);                // haie sud-ouest (derrière la longère)
hedgeRow(40.88, 31, 55.63, 31, 2.2, 1.75);    // haie sud-est
hedgeRow(14, 31, 32, 31, 1.6, 0.8);           // haie basse derrière maison 1
hedgeRow(43.63, 29.25, 53.38, 29.25, 2.4, 2); // haie extérieure SE

// --- arbres d'hiver : tronc + branches récursives ---
function branch(parent, len, radius, depth) {
  const geo = new THREE.CylinderGeometry(radius * 0.55, radius, len, 6);
  geo.translate(0, len / 2, 0);
  const b = new THREE.Mesh(geo, M.bark);
  b.castShadow = true;
  parent.add(b);
  if (depth > 0) {
    const kids = irand(2, 3);
    for (let i = 0; i < kids; i++) {
      const sub = new THREE.Group();
      sub.position.y = len * rand(0.65, 1);
      sub.rotation.set(rand(0.45, 0.95) * (Math.random() < 0.5 ? 1 : -1), rand(0, Math.PI * 2), rand(-0.3, 0.3));
      b.add(sub);
      branch(sub, len * rand(0.55, 0.75), radius * 0.55, depth - 1);
    }
  } else {
    const haze = new THREE.Mesh(new THREE.SphereGeometry(len * 0.8, 6, 5),
      new THREE.MeshLambertMaterial({ color: 0x4a3b2c, transparent: true, opacity: 0.09, depthWrite: false }));
    haze.position.y = len * 0.9;
    b.add(haze);
  }
  return b;
}
function tree(x, z, h = 5) {
  const grp = new THREE.Group();
  const p = P(x, z); grp.position.set(p.x, heightAt(x, z), p.z);
  grp.rotation.y = rand(0, Math.PI * 2);
  branch(grp, h * 0.45, h * 0.045, 2);
  world.add(grp);
  addDisc(x, z, 0.35);
}
function bush(x, z, r = 1, mat = M.bush) {
  const grp = new THREE.Group(); const p = P(x, z); grp.position.set(p.x, heightAt(x, z), p.z);
  const n = irand(4, 6);
  for (let i = 0; i < n; i++) {
    const sg = new THREE.SphereGeometry(r * rand(0.5, 0.85), 8, 7);
    const posA = sg.attributes.position;
    for (let j = 0; j < posA.count; j++) {
      posA.setX(j, posA.getX(j) * rand(0.93, 1.07));
      posA.setY(j, posA.getY(j) * rand(0.9, 1.1));
    }
    sg.computeVertexNormals();
    const b = new THREE.Mesh(sg, Math.random() < 0.3 ? M.bushLight : mat);
    b.position.set(rand(-r * .5, r * .5), r * rand(0.35, 0.7), rand(-r * .5, r * .5));
    b.castShadow = true; grp.add(b);
  }
  world.add(grp); addDisc(x, z, r * 0.8);
}
// arbres (positions plan.json)
tree(21, 15.75, 6);        // arbre du jardin
tree(16, 9.75, 4.5);       // arbre solitaire
tree(40.75, 28.25, 6);
tree(51.5, 17, 5);
tree(51, 22, 6.5);
tree(13.5, 13, 3.5);       // petit arbre près de la dépendance
tree(26.5, 12.25, 5);      // arbre entre l'étendoir et le bosquet
// GRAND THUYA central (33.75, 12 — r 3.5 : un monument)
{
  const x = 33.75, z = 12;
  mesh(new THREE.CylinderGeometry(0.35, 0.6, 1.8, 8), M.bark, x, 0.9, z, true, true, true);
  const base = heightAt(x, z);
  for (let i = 0; i < 7; i++) {
    const r = 3.7 - i * 0.5, y = 1.1 + i * 1.35;
    const cone = mesh(new THREE.ConeGeometry(r, 2.3, 12),
      i === 1 ? M.thuyaDry : (i % 2 ? M.thuyaLight : M.thuya), x + rand(-0.08, 0.08), y + base, z + rand(-0.08, 0.08));
    cone.rotation.y = rand(0, 3);
  }
  addDisc(x, z, 2.4);
}
// bosquets (positions plan.json)
bush(26, 4.5, 2.4);
bush(28.25, 11.25, 2.0);
bush(11.5, 12.75, 1);
bush(9, 9.25, 1.5, M.bushLight);
// murets (positions plan.json)
function muret(x1, z1, x2, z2, th = 0.4) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const m = mesh(new THREE.BoxGeometry(len, 0.55, th), M.stone, cx, 0.275, cz, true, true, true);
  m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
  const cap = mesh(new THREE.BoxGeometry(len, 0.07, th + 0.1), M.granite, cx, 0.58, cz, true, true, true);
  cap.rotation.y = m.rotation.y;
  const n = Math.ceil(len / 0.8);
  // h basse : arrête les zombies mais laisse passer les navets par-dessus
  for (let i = 0; i <= n; i++) addDisc(x1 + (x2 - x1) * i / n, z1 + (z2 - z1) * i / n, th * 0.75, 0.7);
}
muret(19.53, 17.75, 31.47, 17.75, 0.7);  // muret central ouest (le long de la cour)
muret(19.65, 13.37, 31.35, 17.63, 0.45); // muret central est (en diagonale)
muret(29, 2.03, 29, 7.48, 1.0);          // muret du bosquet nord (vertical)
// potager : poireaux et navets en place
for (let i = 0; i < 12; i++) {
  const px = rand(8.6, 16.4), pz = rand(2.4, 5.6);
  if (Math.random() < 0.5) {
    mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 5), M.leaf, px, 0.25, pz, true, false);
  } else {
    mesh(new THREE.SphereGeometry(0.09, 8, 7), M.navet, px, 0.06, pz, true, false);
    mesh(new THREE.ConeGeometry(0.06, 0.22, 5), M.leaf, px, 0.22, pz, true, false);
  }
}
// hortensias le long de la longère
for (const hx of [16.5, 18.5, 28, 30]) bush(hx, 23.4, 0.7, M.hortensia);
// hortensias/fleurs le long du muret central
for (const [hx, hz] of [[23.25, 16], [24.25, 16.75], [25.75, 16.5], [27, 17]]) bush(hx, hz, 0.7, M.hortensia);
// tas de bois vert ×2 (un petit près du thuya, un grand à l'est)
function woodpile(cx, cz, len, cols, rows, rotDeg = 0) {
  const logMat = std({ color: 0x55663f, roughness: 0.9 });
  const endMat = std({ color: 0x8a7350, roughness: 0.9 });
  const grp = new THREE.Group();
  const p = P(cx, cz); grp.position.set(p.x, heightAt(cx, cz), p.z);
  grp.rotation.y = -rotDeg * Math.PI / 180;
  for (let r = 0; r < rows; r++) for (let i = 0; i < cols - r; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, len * rand(0.85, 1), 9), [logMat, endMat, endMat]);
    log.position.set((i - (cols - r - 1) / 2) * 0.36, 0.18 + r * 0.3, 0);
    log.rotation.x = Math.PI / 2;
    log.castShadow = true; grp.add(log);
  }
  world.add(grp);
  addBox(cx, cz, Math.max(len, cols * 0.36), Math.max(len, cols * 0.36) * 0.7);
}
woodpile(25.25, 11.5, 1.0, 3, 2, 30);
woodpile(37, 10.5, 2.0, 6, 3, 0);
// bac à compost (10.25, 8.5 — caisse en bois ouverte sur le dessus)
{
  const grp = new THREE.Group(); const p = P(10.25, 8.5);
  grp.position.set(p.x, heightAt(10.25, 8.5), p.z);
  const plank = std({ color: 0x6f5b40, roughness: 0.95 });
  for (let r = 0; r < 3; r++) {
    const y = 0.16 + r * 0.27;
    for (const s of [-1, 1]) {
      const long = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.2, 0.06), plank);
      long.position.set(0, y, s * 0.47); long.castShadow = true; grp.add(long);
      const court = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.88), plank);
      court.position.set(s * 0.595, y, 0); court.castShadow = true; grp.add(court);
    }
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.85, 0.09), M.wood);
    post.position.set(sx * 0.595, 0.42, sz * 0.47); post.castShadow = true; grp.add(post);
  }
  const compost = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.6, 0.86), std({ color: 0x3e3326, roughness: 1 }));
  compost.position.y = 0.32; grp.add(compost);
  world.add(grp);
  addBox(10.25, 8.5, 1.3, 1.05);
}
// feu de camp presque éteint (20.75, 10.75 — cercle de pierres, braises)
{
  const x = 20.75, z = 10.75;
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + rand(-0.15, 0.15);
    const st = mesh(new THREE.DodecahedronGeometry(rand(0.13, 0.19)), M.granite,
      x + Math.cos(a) * 0.72, 0.07, z + Math.sin(a) * 0.62, true, true, true);
    st.rotation.set(rand(0, 3), rand(0, 3), 0);
  }
  const charMat = std({ color: 0x1f1a16, roughness: 1 });
  for (let i = 0; i < 4; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.05, 0.06, rand(0.55, 0.75), 6), charMat,
      x + rand(-0.12, 0.12), 0.1, z + rand(-0.1, 0.1), true, true, true);
    log.rotation.set(Math.PI / 2 + rand(-0.25, 0.25), 0, i * 0.8 + rand(-0.3, 0.3));
  }
  const braise = mesh(new THREE.CircleGeometry(0.22, 10),
    new THREE.MeshBasicMaterial({ color: 0xc24a18 }), x, 0.045, z, false, false, true);
  braise.rotation.x = -Math.PI / 2;
  const pf = P(x, z);
  const glow = new THREE.PointLight(0xff7a36, 0.55, 4.5, 2);
  glow.position.set(pf.x, 0.4 + heightAt(x, z), pf.z);
  scene.add(glow);
  addDisc(x, z, 0.75, 0.35); // basse : les navets passent par-dessus
}
// cabane d'enfant (50.25, 4.25 — 3 × 2.5)
{
  const grp = new THREE.Group(); const p = P(50.25, 4.25);
  grp.position.set(p.x, heightAt(50.25, 4.25), p.z);
  const bois = std({ color: 0x8a6e4e, roughness: 0.95 });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 2.5), bois);
  walls.position.y = 0.75; walls.castShadow = walls.receiveShadow = true; grp.add(walls);
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-1.5, 0); shape.lineTo(1.5, 0); shape.lineTo(0, 0.7); shape.closePath();
    const gbl = new THREE.Mesh(new THREE.ShapeGeometry(shape), bois);
    gbl.position.set(0, 1.5, s * 1.24);
    if (s < 0) gbl.rotation.y = Math.PI;
    gbl.castShadow = true; grp.add(gbl);
  }
  const roofMat = std({ map: texOf(roofCanvas, 1.2, 0.8), bumpMap: texOf(roofBumpCanvas, 1.2, 0.8, false), bumpScale: 0.06 });
  // faîtage le long de z : pans est/ouest, alignés sur les pignons (façade au sud)
  const slope = Math.hypot(1.7, 0.7);
  const ang = Math.atan2(0.7, 1.7);
  for (const s of [-1, 1]) {
    const pan = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.08, 2.9), roofMat);
    pan.position.set(s * 0.79, 1.85, 0);
    pan.rotation.z = -s * ang;
    pan.castShadow = pan.receiveShadow = true; grp.add(pan);
  }
  // petite porte rouge et fenêtre, face au jardin (sud)
  const porte = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.1), std({ color: 0x9c4a3a, roughness: 0.8 }));
  porte.position.set(-0.6, 0.55, 1.26); grp.add(porte);
  const fen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.5), std({ map: texWindow, roughness: 0.55 }));
  fen.position.set(0.7, 0.85, 1.26); grp.add(fen);
  world.add(grp);
  addBox(50.25, 4.25, 3, 2.5);
}
// table verte (3.25 × 1.5 — la grande table de la cour)
{
  mesh(new THREE.BoxGeometry(3.25, 0.06, 1.5), M.greenTable, 22.75, 0.72, 20.5);
  for (const [dx, dz] of [[-1.45, -0.6], [1.45, -0.6], [-1.45, 0.6], [1.45, 0.6]]) {
    mesh(new THREE.BoxGeometry(0.07, 0.7, 0.07), M.greenTable, 22.75 + dx, 0.35, 20.5 + dz);
  }
  addBox(22.75, 20.5, 3.3, 1.55);
}
// étendoir à linge en diagonale (centre 24,13.75 — rot 145°)
const laundry = [];
{
  const ang = 145 * Math.PI / 180;
  const grp = new THREE.Group();
  const pC = P(24, 13.75);
  const hAvg = (heightAt(20.72, 16.04) + heightAt(27.28, 11.46)) / 2;
  grp.position.set(pC.x, hAvg, pC.z);
  grp.rotation.y = -ang;
  for (const lx of [-4, 4]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 7), M.granite);
    pole.position.set(lx, 0.9, 0); pole.castShadow = true; grp.add(pole);
  }
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 8, 5),
    std({ color: 0x2e6b3e, roughness: 0.6 }));
  wire.rotation.z = Math.PI / 2; wire.position.y = 1.78; grp.add(wire);
  const colors = [0xaebfca, 0xc4a8b4, 0xacbc96];
  for (let i = 0; i < 3; i++) {
    const gcl = new THREE.PlaneGeometry(0.8, rand(0.6, 0.9), 4, 4);
    gcl.translate(0, -gcl.parameters.height / 2, 0);
    const posA = gcl.attributes.position;
    for (let j = 0; j < posA.count; j++) posA.setZ(j, Math.sin(posA.getX(j) * 6) * 0.03);
    gcl.computeVertexNormals();
    const cl = new THREE.Mesh(gcl, std({ color: colors[i], roughness: 0.95, side: THREE.DoubleSide }));
    cl.position.set(-2.4 + i * 2.4, 1.78, 0);
    cl.castShadow = true; grp.add(cl); laundry.push(cl);
  }
  world.add(grp);
  addDisc(20.72, 16.04, 0.15); addDisc(27.28, 11.46, 0.15);
}
// feuilles mortes qui dérivent
let leavesPts;
{
  const n = 80, pos = new Float32Array(n * 3); const seeds = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = rand(-W / 2, W / 2); pos[i * 3 + 1] = rand(0.2, 6); pos[i * 3 + 2] = rand(-D / 2, D / 2);
    seeds.push(rand(0, 10));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tex = texOf(makeCanvas(32, 32, (gg) => {
    gg.fillStyle = '#a4763c'; gg.beginPath(); gg.ellipse(16, 16, 9, 5, 0.6, 0, 7); gg.fill();
  }));
  leavesPts = new THREE.Points(g, new THREE.PointsMaterial({
    size: 0.2, map: tex, transparent: true, depthWrite: false, color: 0xc08a50
  }));
  leavesPts.userData.seeds = seeds; scene.add(leavesPts);
}
// fumée de cheminée (cheminée ouest de la longère : x = 16.5 − 5 = 11.5)
const smoke = [];
const CHIMNEY = { x: 11.5, z: 27, y: 6.6 };
{
  const tex = texOf(makeCanvas(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    gr.addColorStop(0, 'rgba(235,235,230,.65)'); gr.addColorStop(1, 'rgba(235,235,230,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }));
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false }));
    const p = P(CHIMNEY.x, CHIMNEY.z); s.position.set(p.x, CHIMNEY.y + i * 0.7, p.z);
    s.scale.setScalar(1 + i * 0.4); s.userData.t = i / 8;
    scene.add(s); smoke.push(s);
  }
}

// ============================================================
//  JOUEUR
// ============================================================
const player = {
  pos: P(20, 20).setY(1.65), yaw: 0.35, pitch: 0,
  vel: new THREE.Vector3(), r: 0.45, speed: 4.2, sprint: 6.6,
  charge: 0, charging: false,
};
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyE') harvest(true);
  // Espace : charge le lancer (comme le clic maintenu)
  if (e.code === 'Space' && !e.repeat && state.mode === 'play' && state.ammo > 0 && !player.charging) {
    player.charging = true; player.charge = 0;
  }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space' && state.mode === 'play' && player.charging) {
    throwNavet(); player.charging = false;
  }
});

addEventListener('mousemove', e => {
  if (state.mode !== 'play' || document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * 0.0023;
  player.pitch = clamp(player.pitch - e.movementY * 0.0023, -1.45, 1.45);
});
canvas.addEventListener('mousedown', e => {
  if (state.mode !== 'play') return;
  if (e.button === 0 && state.ammo > 0) { player.charging = true; player.charge = 0; }
});
addEventListener('mouseup', e => {
  if (state.mode !== 'play' || e.button !== 0) return;
  if (player.charging) { throwNavet(); player.charging = false; }
});

// ---------- contrôles tactiles : joystick gauche + visée à droite ----------
const touch = { moveId: null, mx: 0, my: 0, baseX: 0, baseY: 0, lookId: null, lx: 0, ly: 0 };
const stickBase = document.getElementById('stick-base');
const stickKnob = document.getElementById('stick-knob');
function placeStick(x, y) {
  stickBase.style.left = (x - 59) + 'px';
  stickBase.style.top = (y - 59) + 'px';
  stickBase.style.bottom = 'auto';
}
function resetStick() {
  stickBase.classList.remove('active');
  stickBase.style.left = '26px'; stickBase.style.top = 'auto'; stickBase.style.bottom = '88px';
  stickKnob.style.transform = 'translate(-50%,-50%)';
  touch.moveId = null; touch.mx = 0; touch.my = 0;
}
canvas.addEventListener('touchstart', e => {
  if (state.mode !== 'play') return;
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth * 0.45 && touch.moveId === null) {
      touch.moveId = t.identifier;
      touch.baseX = t.clientX; touch.baseY = t.clientY;
      touch.mx = 0; touch.my = 0;
      placeStick(t.clientX, t.clientY);
      stickBase.classList.add('active');
    } else if (touch.lookId === null) {
      touch.lookId = t.identifier;
      touch.lx = t.clientX; touch.ly = t.clientY;
    }
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (state.mode !== 'play') return;
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) {
      let dx = t.clientX - touch.baseX, dy = t.clientY - touch.baseY;
      const d = Math.hypot(dx, dy);
      if (d > 56) { dx *= 56 / d; dy *= 56 / d; }
      touch.mx = dx / 56; touch.my = dy / 56;
      stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (t.identifier === touch.lookId) {
      player.yaw -= (t.clientX - touch.lx) * 0.005;
      player.pitch = clamp(player.pitch - (t.clientY - touch.ly) * 0.005, -1.45, 1.45);
      touch.lx = t.clientX; touch.ly = t.clientY;
    }
  }
  e.preventDefault();
}, { passive: false });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) resetStick();
    if (t.identifier === touch.lookId) touch.lookId = null;
  }
}
canvas.addEventListener('touchend', touchEnd);
canvas.addEventListener('touchcancel', touchEnd);
// bouton navet : appuyer = charger, relâcher = lancer
const btnThrow = document.getElementById('btn-throw');
btnThrow.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state.mode !== 'play' || state.ammo <= 0) return;
  player.charging = true; player.charge = 0;
  btnThrow.classList.add('charging');
}, { passive: false });
btnThrow.addEventListener('touchend', e => {
  e.preventDefault();
  btnThrow.classList.remove('charging');
  if (state.mode === 'play' && player.charging) { throwNavet(); player.charging = false; }
}, { passive: false });
// bouton pause
document.getElementById('btn-pause').addEventListener('touchend', e => {
  e.preventDefault();
  if (state.mode === 'play') { state.mode = 'pause'; setScreen('pause'); resetStick(); touch.lookId = null; }
}, { passive: false });

function playerPlanPos() { return [player.pos.x + W / 2, player.pos.z + D / 2]; }

function updatePlayer(dt) {
  const sp = (keys.ShiftLeft || keys.ShiftRight) ? player.sprint : player.speed;
  const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const r = new THREE.Vector3(-f.z, 0, f.x);
  const mv = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) mv.add(f);
  if (keys.KeyS || keys.ArrowDown) mv.sub(f);
  if (keys.KeyA || keys.ArrowLeft) mv.sub(r);
  if (keys.KeyD || keys.ArrowRight) mv.add(r);
  if (mv.lengthSq() > 0) mv.normalize().multiplyScalar(sp * dt);
  // joystick tactile (à fond = sprint)
  if (touch.moveId !== null && (touch.mx || touch.my)) {
    const mag = Math.hypot(touch.mx, touch.my);
    const spT = (mag > 0.92 ? player.sprint : player.speed) * Math.min(1, mag);
    mv.addScaledVector(f, -touch.my * spT * dt).addScaledVector(r, touch.mx * spT * dt);
  }
  let nx = player.pos.x + mv.x, nz = player.pos.z + mv.z;
  let [px, pz] = [nx + W / 2, nz + D / 2];
  px = clamp(px, 1.0, W - 1.0); pz = clamp(pz, 1.0, D - 1.0);
  [px, pz] = collide(px, pz, player.r);
  player.pos.x = px - W / 2; player.pos.z = pz - D / 2;
  const bob = mv.lengthSq() > 0 ? Math.sin(performance.now() * 0.011) * 0.045 : 0;
  camera.position.set(player.pos.x, 1.65 + bob + heightAt(px, pz), player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  if (player.charging) player.charge = Math.min(1, player.charge + dt * 1.6);
  if (px > 8 && px < 17 && pz > 2 && pz < 6) {
    state.harvestT += dt;
    if (state.harvestT > 0.45) { state.harvestT = 0; harvest(false); }
  }
}
function harvest(manual) {
  if (state.mode !== 'play') return;
  if (manual) {
    const [px, pz] = playerPlanPos();
    if (!(px > 7.4 && px < 17.6 && pz > 1.4 && pz < 6.6)) { toast('Le potager est au fond à gauche du jardin !'); return; }
  }
  if (state.ammo >= state.ammoMax) { if (manual) toast('Les poches sont pleines de navets !'); return; }
  state.ammo++; updateAmmo(); sndPop();
  toast('Un navet de plus ! (' + state.ammo + '/' + state.ammoMax + ')');
}

// ============================================================
//  NAVETS (projectiles)
// ============================================================
function makeNavetMesh() {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), M.navet);
  body.scale.y = 1.15; body.castShadow = true;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 7, 0, Math.PI * 2, 0, 1.1), M.navetTop);
  top.position.y = 0.04;
  const root = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 5), M.navet);
  root.position.y = -0.22; root.rotation.x = Math.PI;
  grp.add(body, top, root);
  for (let i = 0; i < 3; i++) {
    const lf = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 5), M.leaf);
    lf.position.set(rand(-0.05, 0.05), 0.26, rand(-0.05, 0.05));
    lf.rotation.set(rand(-0.4, 0.4), 0, rand(-0.4, 0.4));
    grp.add(lf);
  }
  return grp;
}
const navetProto = makeNavetMesh();
function throwNavet() {
  if (state.ammo <= 0) { toast('Plus de navets ! File au potager !'); sndEmpty(); return; }
  state.ammo--; updateAmmo();
  const m = navetProto.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  m.position.copy(camera.position).addScaledVector(dir, 0.5);
  m.position.y -= 0.15;
  const power = 11 + player.charge * 11;
  const vel = dir.multiplyScalar(power);
  vel.y += 2.2 + player.charge * 1.5;
  state.navets.push({ m, vel, spin: rand(4, 9), life: 6 });
  scene.add(m);
  sndWhoosh(0.4 + player.charge * 0.6);
}
function updateNavets(dt) {
  for (let i = state.navets.length - 1; i >= 0; i--) {
    const n = state.navets[i];
    n.vel.y -= 21 * dt;
    n.m.position.addScaledVector(n.vel, dt);
    n.m.rotation.x += n.spin * dt; n.m.rotation.z += n.spin * 0.6 * dt;
    n.life -= dt;
    let hit = false;
    for (const z of state.zombies) {
      if (z.dead) continue;
      const dx = n.m.position.x - z.grp.position.x, dz = n.m.position.z - z.grp.position.z;
      const dy = n.m.position.y - (z.grp.position.y + 1.1);
      if (dx * dx + dz * dz < 0.45 && dy > -1.2 && dy < 0.9) {
        hitZombie(z, n.vel, dy > 0.45);
        splat(n.m.position); hit = true; break;
      }
    }
    if (!hit && n.m.position.y < hAtWorld(n.m.position.x, n.m.position.z) + 0.12) { splat(n.m.position); hit = true; }
    if (!hit) {
      const px = n.m.position.x + W / 2, pz = n.m.position.z + D / 2;
      if (navetBlocked(px, pz, n.m.position.y, 0.12)) { splat(n.m.position); hit = true; }
    }
    if (hit || n.life <= 0) {
      scene.remove(n.m); state.navets.splice(i, 1);
    }
  }
}
const chunkGeo = new THREE.IcosahedronGeometry(0.06);
function splat(pos) {
  sndSplat();
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(chunkGeo, i % 3 === 2 ? M.navetTop : M.navet);
    c.position.copy(pos);
    const v = new THREE.Vector3(rand(-1, 1), rand(1.5, 4), rand(-1, 1)).multiplyScalar(rand(0.8, 1.6));
    state.chunks.push({ m: c, vel: v, life: rand(0.5, 1.0) });
    scene.add(c);
  }
}
function updateChunks(dt) {
  for (let i = state.chunks.length - 1; i >= 0; i--) {
    const c = state.chunks[i];
    c.vel.y -= 14 * dt;
    c.m.position.addScaledVector(c.vel, dt);
    const floor = hAtWorld(c.m.position.x, c.m.position.z) + 0.04;
    if (c.m.position.y < floor) { c.m.position.y = floor; c.vel.set(0, 0, 0); }
    c.life -= dt;
    c.m.scale.setScalar(Math.max(0.01, c.life));
    if (c.life <= 0) { scene.remove(c.m); state.chunks.splice(i, 1); }
  }
}

// ============================================================
//  ZOMBIES
// ============================================================
const zombieSkins = [0x7e9962, 0x82a070, 0x74905e];
const zombieShirts = [0x4e5d6b, 0x6b5340, 0x5d4f64, 0x455d4e];
function makeZombie() {
  const grp = new THREE.Group();
  const skinCanvas = makeCanvas(64, 64, (g) => {
    const base = zombieSkins[irand(0, 2)];
    g.fillStyle = '#' + base.toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${irand(60, 110)},${irand(90, 130)},${irand(50, 80)},${rand(.1, .35)})`;
      g.beginPath(); g.arc(rand(0, 64), rand(0, 64), rand(2, 7), 0, 7); g.fill();
    }
  });
  const skin = std({ map: texOf(skinCanvas), roughness: 0.8 });
  const shirtCanvas = makeCanvas(64, 64, (g) => {
    const base = zombieShirts[irand(0, 3)];
    g.fillStyle = '#' + base.toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 25; i++) {
      g.fillStyle = `rgba(${irand(20, 50)},${irand(20, 45)},${irand(15, 40)},${rand(.2, .5)})`;
      g.beginPath(); g.ellipse(rand(0, 64), rand(0, 64), rand(2, 9), rand(2, 6), rand(0, 3), 0, 7); g.fill();
    }
  });
  const shirt = std({ map: texOf(shirtCanvas), roughness: 0.95 });
  const pants = std({ color: 0x3e3a35, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirt);
  body.position.y = 1.15; body.castShadow = true;
  const faceTex = texOf(makeCanvas(64, 64, (g) => {
    g.fillStyle = '#7e9968'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${irand(60, 110)},${irand(90, 130)},${irand(50, 80)},${rand(.15, .4)})`;
      g.beginPath(); g.arc(rand(0, 64), rand(0, 64), rand(2, 6), 0, 7); g.fill();
    }
    g.fillStyle = '#1a1a1a'; g.fillRect(14, 22, 12, 8); g.fillRect(38, 20, 12, 10);
    g.fillStyle = '#3a2a2a'; g.beginPath(); g.ellipse(32, 47, 10, 5, 0, 0, 7); g.fill();
    g.fillStyle = '#cfcabc'; g.fillRect(26, 44, 4, 4); g.fillRect(34, 45, 4, 4);
  }));
  const headMats = [skin, skin, skin, skin, std({ map: faceTex, roughness: 0.8 }), skin];
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), headMats);
  head.position.y = 1.78; head.rotation.z = rand(-0.12, 0.12); head.castShadow = true;
  for (const ex of [-0.09, 0.10]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xd4ffae }));
    eye.position.set(ex, 0.04, 0.215);
    head.add(eye);
  }
  const armGeo = new THREE.BoxGeometry(0.14, 0.62, 0.14);
  armGeo.translate(0, -0.26, 0);
  const armL = new THREE.Mesh(armGeo, skin); armL.position.set(-0.40, 1.5, 0);
  const armR = new THREE.Mesh(armGeo, skin); armR.position.set(0.40, 1.5, 0);
  armL.rotation.x = -1.35; armR.rotation.x = -1.5;
  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.2);
  legGeo.translate(0, -0.39, 0);
  const legL = new THREE.Mesh(legGeo, pants); legL.position.set(-0.16, 0.78, 0);
  const legR = new THREE.Mesh(legGeo, pants); legR.position.set(0.16, 0.78, 0);
  for (const m of [armL, armR, legL, legR]) m.castShadow = true;
  grp.add(body, head, armL, armR, legL, legR);
  grp.userData = { armL, armR, legL, legR, head };
  return grp;
}
// portes d'entrée des zombies (repères plan.json)
const gates = [
  { x: 36.6, z: 30.2, name: 'le portail' },
  { x: 54.8, z: 10, name: 'le chemin' },
  { x: 31.75, z: 0.75, name: 'la haie' },
];
function spawnZombie(speedMul = 1) {
  const gate = gates[irand(0, gates.length - 1)];
  const grp = makeZombie();
  const gx = gate.x + rand(-0.5, 0.5), gz = gate.z + rand(-0.5, 0.5);
  const p = P(gx, gz);
  grp.position.set(p.x, heightAt(gx, gz), p.z);
  const z = {
    grp, hp: 2, speed: rand(0.85, 1.15) * speedMul,
    dead: false, deadT: 0, hitT: 0, attackT: rand(0, 0.5),
    phase: rand(0, 6), moanT: rand(2, 9),
  };
  state.zombies.push(z); scene.add(grp);
  poof(grp.position);
}
const poofTex = texOf(makeCanvas(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, 'rgba(160,150,130,.8)'); gr.addColorStop(1, 'rgba(160,150,130,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}));
const poofs = [];
function poof(pos) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: poofTex, transparent: true, depthWrite: false }));
  s.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0)); s.scale.setScalar(1.2);
  s.userData.life = 0.7; scene.add(s); poofs.push(s);
}
function hitZombie(z, vel, headshot) {
  if (z.dead) return;
  z.hp -= headshot ? 2 : 1;
  z.hitT = 0.25;
  z.grp.position.addScaledVector(new THREE.Vector3(vel.x, 0, vel.z).normalize(), 0.35);
  state.score += 2;
  if (z.hp <= 0) {
    z.dead = true; z.deadT = 0;
    state.kills++; state.score += headshot ? 15 : 10;
    sndKill();
    toast(headshot ? 'En pleine tête ! +15' : 'Zombie composté ! +10');
  } else { sndThud(); }
  updateScore();
}
function updateZombies(dt, t) {
  let alive = 0;
  for (let i = state.zombies.length - 1; i >= 0; i--) {
    const z = state.zombies[i];
    if (z.dead) {
      z.deadT += dt;
      z.grp.rotation.x = -Math.min(1, z.deadT * 2.4) * Math.PI / 2;
      if (z.deadT > 1.1) z.grp.position.y -= dt * 0.7;
      if (z.deadT > 2.6) { scene.remove(z.grp); state.zombies.splice(i, 1); }
      continue;
    }
    alive++;
    const dx = player.pos.x - z.grp.position.x, dz = player.pos.z - z.grp.position.z;
    const dist = Math.hypot(dx, dz);
    const sp = z.speed * (z.hitT > 0 ? 0.25 : 1);
    if (dist > 1.05) {
      let nx = z.grp.position.x + dx / dist * sp * dt;
      let nz = z.grp.position.z + dz / dist * sp * dt;
      let [px, pz] = [nx + W / 2, nz + D / 2];
      px = clamp(px, 0.8, W - 0.8); pz = clamp(pz, 0.8, D - 0.8);
      [px, pz] = collide(px, pz, 0.4);
      for (const o of state.zombies) {
        if (o === z || o.dead) continue;
        const ox = px - (o.grp.position.x + W / 2), oz = pz - (o.grp.position.z + D / 2);
        const od = Math.hypot(ox, oz);
        if (od < 0.7 && od > 0.01) { px += ox / od * (0.7 - od) * 0.5; pz += oz / od * (0.7 - od) * 0.5; }
      }
      z.grp.position.x = px - W / 2; z.grp.position.z = pz - D / 2;
    } else {
      z.attackT -= dt;
      if (z.attackT <= 0) { z.attackT = 0.9; damagePlayer(8); }
    }
    z.grp.rotation.y = Math.atan2(dx, dz);
    const ph = t * 5.2 * z.speed + z.phase;
    const u = z.grp.userData;
    u.legL.rotation.x = Math.sin(ph) * 0.55;
    u.legR.rotation.x = -Math.sin(ph) * 0.55;
    u.armL.rotation.x = -1.35 + Math.sin(ph * 0.7) * 0.18;
    u.armR.rotation.x = -1.5 - Math.sin(ph * 0.7) * 0.15;
    u.head.rotation.y = Math.sin(t * 1.3 + z.phase) * 0.25;
    z.grp.position.y = hAtWorld(z.grp.position.x, z.grp.position.z) + Math.abs(Math.sin(ph)) * 0.05;
    if (z.hitT > 0) z.hitT -= dt;
    z.moanT -= dt;
    if (z.moanT <= 0 && dist < 22) { z.moanT = rand(4, 11); sndMoan(clamp(1 - dist / 25, 0.1, 0.8)); }
  }
  return alive;
}
function damagePlayer(n) {
  if (state.mode !== 'play') return;
  state.hp = Math.max(0, state.hp - n);
  state.lastHurt = performance.now();
  document.getElementById('degats').style.opacity = '1';
  setTimeout(() => document.getElementById('degats').style.opacity = '0', 220);
  sndHurt(); updateHP();
  if (state.hp <= 0) gameOver();
}

// ---------- vagues ----------
function startWave(n) {
  state.wave = n; state.betweenWaves = false;
  document.getElementById('wave').textContent = 'Vague ' + n;
  annonce(n === 1 ? 'Les voilà !' : 'Vague ' + n + ' !');
  sndHorn();
  // les apparitions sont gérées dans updateWaves (boucle de jeu) :
  // elles se mettent en pause avec le jeu au lieu de se perdre
  state._pending = 3 + n * 2;
  state._speedMul = Math.min(1 + n * 0.11, 2.1);
  state._spawnIv = Math.max(2.6 - n * 0.22, 0.9);
  state._spawnT = 0; // premier zombie immédiat
}
function updateWaves(dt, alive) {
  if (state.betweenWaves) {
    state.waveT -= dt;
    if (state.waveT <= 0) startWave(state.wave + 1);
    return;
  }
  if (state._pending > 0) {
    state._spawnT -= dt;
    if (state._spawnT <= 0) {
      spawnZombie(state._speedMul);
      state._pending--;
      state._spawnT = state._spawnIv;
    }
  } else if (alive === 0 && state.zombies.length === 0) {
    state.betweenWaves = true; state.waveT = 6;
    state.score += 25; updateScore();
    annonce('Vague nettoyée ! +25');
    toast('Petite pause… file remplir tes poches au potager !');
  }
}

// ============================================================
//  AUDIO (tout est synthétisé, rien à télécharger)
// ============================================================
let AC = null, masterGain = null;
function audioInit() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === 'suspended') AC.resume();
  masterGain = AC.createGain(); masterGain.gain.value = 0.5;
  masterGain.connect(AC.destination);
  const len = AC.sampleRate * 2;
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4;
  const g = AC.createGain(); g.gain.value = 0.05;
  const lfo = AC.createOscillator(); lfo.frequency.value = 0.13;
  const lfoG = AC.createGain(); lfoG.gain.value = 0.03;
  lfo.connect(lfoG); lfoG.connect(g.gain);
  src.connect(lp); lp.connect(g); g.connect(masterGain);
  src.start(); lfo.start();
}
function env(g, t0, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
}
function sndWhoosh(p) {
  if (!AC) return; const t = AC.currentTime;
  const buf = AC.createBuffer(1, AC.sampleRate * 0.3, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = AC.createBufferSource(); s.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
  f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.22);
  const g = AC.createGain(); env(g, t, 0.02, 0.25 * p + 0.1, 0.24);
  s.connect(f); f.connect(g); g.connect(masterGain); s.start(t);
}
function sndSplat() {
  if (!AC) return; const t = AC.currentTime;
  const buf = AC.createBuffer(1, AC.sampleRate * 0.18, AC.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = AC.createBufferSource(); s.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = AC.createGain(); env(g, t, 0.005, 0.5, 0.16);
  const o = AC.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
  const og = AC.createGain(); env(og, t, 0.005, 0.35, 0.13);
  s.connect(f); f.connect(g); g.connect(masterGain);
  o.connect(og); og.connect(masterGain);
  s.start(t); o.start(t); o.stop(t + 0.2);
}
function sndThud() {
  if (!AC) return; const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
  const g = AC.createGain(); env(g, t, 0.005, 0.4, 0.12);
  o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.15);
}
function sndKill() {
  if (!AC) return; const t = AC.currentTime;
  sndSplat();
  [523, 659, 784].forEach((f, i) => {
    const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = AC.createGain(); env(g, t + 0.08 + i * 0.07, 0.01, 0.16, 0.18);
    o.connect(g); g.connect(masterGain); o.start(t + 0.08 + i * 0.07); o.stop(t + 0.5 + i * 0.07);
  });
}
function sndPop() {
  if (!AC) return; const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.07);
  const g = AC.createGain(); env(g, t, 0.005, 0.3, 0.09);
  o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.12);
}
function sndEmpty() {
  if (!AC) return; const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'square'; o.frequency.value = 140;
  const g = AC.createGain(); env(g, t, 0.005, 0.12, 0.08);
  o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.1);
}
function sndMoan(vol) {
  if (!AC) return; const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'sawtooth';
  const f0 = rand(70, 120);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f0 * rand(1.15, 1.4), t + rand(0.4, 0.7));
  o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 1.1);
  const v = AC.createOscillator(); v.frequency.value = rand(4, 7);
  const vg = AC.createGain(); vg.gain.value = 6;
  v.connect(vg); vg.connect(o.frequency);
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
  const g = AC.createGain(); env(g, t, 0.15, 0.14 * vol, 1.0);
  o.connect(f); f.connect(g); g.connect(masterGain);
  o.start(t); v.start(t); o.stop(t + 1.3); v.stop(t + 1.3);
}
function sndHurt() {
  if (!AC) return; const t = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
  const g = AC.createGain(); env(g, t, 0.005, 0.3, 0.2);
  o.connect(g); g.connect(masterGain); o.start(t); o.stop(t + 0.25);
}
function sndHorn() {
  if (!AC) return; const t = AC.currentTime;
  [[220, 0], [220, 0.18], [330, 0.36]].forEach(([f, dt]) => {
    const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 900;
    const g = AC.createGain(); env(g, t + dt, 0.02, 0.2, 0.3);
    o.connect(fl); fl.connect(g); g.connect(masterGain);
    o.start(t + dt); o.stop(t + dt + 0.4);
  });
}
function sndGameOver() {
  if (!AC) return; const t = AC.currentTime;
  [392, 330, 262, 196].forEach((f, i) => {
    const o = AC.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const g = AC.createGain(); env(g, t + i * 0.25, 0.02, 0.25, 0.4);
    o.connect(g); g.connect(masterGain); o.start(t + i * 0.25); o.stop(t + i * 0.25 + 0.5);
  });
}

// ============================================================
//  HUD
// ============================================================
const $ = id => document.getElementById(id);
function updateScore() { $('score').textContent = state.score + ' pts'; }
function updateAmmo() { $('navet-count').textContent = state.ammo; }
function updateHP() {
  const hearts = Math.ceil(state.hp / 20);
  $('hearts').textContent = '❤️'.repeat(hearts) + '🤍'.repeat(5 - hearts);
  $('hpfill').style.width = state.hp + '%';
}
let toastTimer = null;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
function annonce(msg) {
  const el = $('annonce'); el.textContent = msg;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

// ---------- minimap (calquée sur plan.json) ----------
const mm = $('minimap'), mctx = mm.getContext('2d');
const mmScale = 220 / W;
const mmOff = document.createElement('canvas'); mmOff.width = 220; mmOff.height = 142;
{
  const g = mmOff.getContext('2d'), s = mmScale;
  g.fillStyle = '#9aa97e'; g.fillRect(0, 0, 220, 142);
  g.fillStyle = '#b6a380'; g.fillRect(55.5 * s, 0, 4.5 * s, 36 * s);                 // chemin
  g.fillStyle = '#8a6c4e'; g.fillRect(8 * s, 2 * s, 9 * s, 4 * s);                   // potager
  g.fillStyle = '#8f8a7c'; g.fillRect(14.9 * s, 18.3 * s, 16.7 * s, 6.45 * s);       // cour
  g.fillStyle = '#6e5142';                                                            // maisons
  g.fillRect(1.4 * s, 23.1 * s, 30.25 * s, 7.75 * s);                                // longère
  g.fillRect(4.5 * s, 13.75 * s, 10.5 * s, 6.5 * s);                                 // dépendance
  g.fillStyle = '#7d7468'; g.fillRect(1.4 * s, 14 * s, 3.7 * s, 6 * s);              // appentis
  g.fillStyle = '#a89a85'; g.fillRect(14.9 * s, 19.9 * s, 0.7 * s, 4.2 * s);         // mur
  g.fillStyle = '#fff'; g.fillRect(14.9 * s - 1, 21.3 * s, 0.7 * s + 2, 1.4 * s);    // porte blanche
  g.fillStyle = '#2f4528';                                                            // haies
  g.fillRect(0, 0, 30 * s, 1.4 * s);                  // NO
  g.fillRect(33 * s, 0.15 * s, 20 * s, 2.2 * s);      // NE
  g.fillRect(0, 0, 1.4 * s, 36 * s);                  // ouest
  g.fillRect(53.05 * s, 0, 1.4 * s, 8.5 * s);         // est nord
  g.fillRect(54.5 * s, 18.63 * s, 1 * s, 11.75 * s);  // est sud
  g.fillRect(0, 30.55 * s, 14 * s, 1.4 * s);          // SO
  g.fillRect(40.88 * s, 30.13 * s, 14.75 * s, 1.75 * s); // SE
  g.fillRect(14 * s, 30.6 * s, 18 * s, 0.8 * s);      // haie basse
  g.fillRect(43.63 * s, 28.25 * s, 9.75 * s, 2 * s);  // ext. SE
  g.fillStyle = '#6e5142'; g.fillRect(48.75 * s, 3 * s, 3 * s, 2.5 * s);             // cabane d'enfant
  g.fillStyle = '#5a4632'; g.fillRect(9.63 * s, 8 * s, 1.25 * s, 1 * s);             // bac à compost
  const dot = (x, z, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x * s, z * s, r * s, 0, 7); g.fill(); };
  dot(33.75, 12, 3.5, '#5e7440');                     // grand thuya
  dot(26, 4.5, 2.4, '#46603a'); dot(28.25, 11.25, 2, '#46603a');
  dot(11.5, 12.75, 1, '#46603a'); dot(9, 9.25, 1.5, '#5a7a48');
  dot(21, 15.75, 1.2, '#7a6a52'); dot(16, 9.75, 0.8, '#7a6a52');
  dot(40.75, 28.25, 1.2, '#7a6a52'); dot(51.5, 17, 1, '#7a6a52'); dot(51, 22, 1.3, '#7a6a52');
  dot(13.5, 13, 0.5, '#7a6a52'); dot(26.5, 12.25, 1, '#7a6a52');
  dot(20.75, 10.75, 0.7, '#8a8276');                  // feu de camp
  g.fillStyle = '#5d7045';                                                            // tas de bois
  g.fillRect(24.65 * s, 10.85 * s, 1.2 * s, 1.3 * s); g.fillRect(35.7 * s, 9.3 * s, 2.6 * s, 2.4 * s);
  g.strokeStyle = '#c2b49c'; g.lineWidth = 2;                                         // murets
  g.beginPath(); g.moveTo(19.5 * s, 17.75 * s); g.lineTo(31.5 * s, 17.75 * s); g.stroke();
  g.beginPath(); g.moveTo(19.65 * s, 13.37 * s); g.lineTo(31.35 * s, 17.63 * s); g.stroke();
  g.beginPath(); g.moveTo(29 * s, 2 * s); g.lineTo(29 * s, 7.5 * s); g.stroke();
  g.fillStyle = '#fff'; g.fillRect(35 * s, 30.6 * s, 2.6 * s, 2);                    // portail 92
  g.fillRect(55.5 * s, 30.9 * s, 4.5 * s, 2);                                        // portail 86
  g.strokeStyle = 'rgba(60,51,42,.8)'; g.lineWidth = 2; g.strokeRect(0, 0, 220, 142);
}
function drawMinimap() {
  mctx.clearRect(0, 0, 220, 142);
  mctx.drawImage(mmOff, 0, 0);
  const s = mmScale;
  for (const z of state.zombies) {
    if (z.dead) continue;
    const x = (z.grp.position.x + W / 2) * s, y = (z.grp.position.z + D / 2) * s;
    mctx.fillStyle = '#9eff7a';
    mctx.beginPath(); mctx.arc(x, y, 3, 0, 7); mctx.fill();
    mctx.strokeStyle = '#2c4a1e'; mctx.stroke();
  }
  const px = (player.pos.x + W / 2) * s, py = (player.pos.z + D / 2) * s;
  mctx.save(); mctx.translate(px, py); mctx.rotate(-player.yaw);
  mctx.fillStyle = '#fff';
  mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4, 4); mctx.lineTo(-4, 4); mctx.closePath(); mctx.fill();
  mctx.strokeStyle = '#3c332a'; mctx.stroke();
  mctx.restore();
}

// ============================================================
//  ÉTATS DE JEU
// ============================================================
function setScreen(id) {
  for (const s of ['accueil', 'pause', 'gameover']) $(s).classList.toggle('hidden', s !== id);
  document.body.classList.toggle('hud-hidden', id !== null);
}
function startGame() {
  for (const z of state.zombies) scene.remove(z.grp);
  for (const n of state.navets) scene.remove(n.m);
  for (const c of state.chunks) scene.remove(c.m);
  Object.assign(state, {
    hp: 100, score: 0, wave: 0, kills: 0, ammo: 12,
    zombies: [], navets: [], chunks: [], betweenWaves: true, waveT: 3.5, _pending: 0,
  });
  player.pos.copy(P(20, 20)); player.pos.y = 1.65;
  player.yaw = 0.35; player.pitch = 0;   // depuis la cour, face au jardin et au thuya
  updateScore(); updateAmmo(); updateHP();
  $('wave').textContent = 'Vague 1';
  state.mode = 'play';
  setScreen(null);
  annonce('Défends le jardin !');
  if (!IS_TOUCH) canvas.requestPointerLock();
  else if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => { });
  }
}
function gameOver() {
  state.mode = 'over';
  document.exitPointerLock();
  sndGameOver();
  const phrases = [
    'Un zombie t\'a confondu avec un navet.',
    'Le potager est perdu… pour cette fois.',
    'Même le grand thuya n\'a rien pu faire.',
    'Ils sont entrés par le portail du 92.',
    'La porte blanche est restée fermée, hélas.',
  ];
  $('go-phrase').textContent = phrases[irand(0, phrases.length - 1)];
  $('go-score').textContent = state.score + ' points';
  $('go-detail').textContent = state.kills + ' zombies compostés — vague ' + state.wave;
  setScreen('gameover');
}
$('play').addEventListener('click', () => { audioInit(); startGame(); });
$('replay').addEventListener('click', () => { audioInit(); startGame(); });
$('resume').addEventListener('click', () => {
  state.mode = 'play'; setScreen(null);
  if (!IS_TOUCH) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (IS_TOUCH) return;
  if (document.pointerLockElement !== canvas && state.mode === 'play') {
    state.mode = 'pause'; setScreen('pause');
  }
});
canvas.addEventListener('click', () => {
  if (!IS_TOUCH && state.mode === 'play' && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});

// ============================================================
//  BOUCLE PRINCIPALE
// ============================================================
let lastT = performance.now();
function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const t = now / 1000;

  if (leavesPts) {
    const pos = leavesPts.geometry.attributes.position;
    const seeds = leavesPts.userData.seeds;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * rand(0.25, 0.5);
      let x = pos.getX(i) + Math.sin(t * 0.7 + seeds[i]) * dt * 0.7;
      if (y < 0.1) { y = rand(3, 7); x = rand(-W / 2, W / 2); }
      pos.setY(i, y); pos.setX(i, x);
    }
    pos.needsUpdate = true;
  }
  for (const s of smoke) {
    s.userData.t += dt * 0.14;
    if (s.userData.t > 1) s.userData.t = 0;
    const u = s.userData.t;
    const p = P(CHIMNEY.x, CHIMNEY.z);
    s.position.set(p.x + Math.sin(u * 5) * 0.4 + u * 1.6, CHIMNEY.y + u * 4.2, p.z);
    s.scale.setScalar(0.8 + u * 2.4);
    s.material.opacity = 0.4 * (1 - u);
  }
  laundry.forEach((cl, i) => { cl.rotation.x = Math.sin(t * 1.6 + i * 1.7) * 0.16; });

  if (state.mode === 'play') {
    updatePlayer(dt);
    updateNavets(dt);
    updateChunks(dt);
    const alive = updateZombies(dt, t);
    updateWaves(dt, alive);
    drawMinimap();
  } else if (state.mode === 'menu') {
    const a = t * 0.08;
    camera.position.set(Math.sin(a) * 22, 13, Math.cos(a) * 16);
    camera.lookAt(P(28, 14).setY(1.5));
  }
  for (let i = poofs.length - 1; i >= 0; i--) {
    const s = poofs[i];
    s.userData.life -= dt;
    s.scale.addScalar(dt * 2.4);
    s.material.opacity = Math.max(0, s.userData.life);
    if (s.userData.life <= 0) { scene.remove(s); poofs.splice(i, 1); }
  }
  composer.render();
}
updateHP(); updateAmmo(); updateScore();
tick();
