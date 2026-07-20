// VoxelForge — 体素世界引擎 (无限区块流式加载 + 天空盒)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9fb6d4, 60, 220);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(28, 30, 38);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 6, 0);
controls.maxPolarAngle = Math.PI * 0.49;
controls.enableDamping = true;

// ---------- 天空盒（渐变穹顶 + 太阳）----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { uSun: { value: new THREE.Vector3(0.55, 0.72, -0.42).normalize() }, uDay: { value: 1.0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    varying vec3 vDir; uniform vec3 uSun; uniform float uDay;
    void main(){
      vec3 d = normalize(vDir);
      vec3 zenith = mix(vec3(0.02,0.03,0.07), vec3(0.20,0.42,0.78), uDay);
      vec3 horizon = mix(vec3(0.06,0.08,0.14), vec3(0.72,0.82,0.92), uDay);
      vec3 ground = mix(vec3(0.04,0.05,0.07), vec3(0.45,0.52,0.42), uDay);
      vec3 col;
      if(d.y>0.0) col = mix(horizon, zenith, pow(clamp(d.y,0.0,1.0),0.5));
      else col = mix(horizon, ground, pow(clamp(-d.y,0.0,1.0),0.5));
      float s = max(dot(d, uSun), 0.0);
      col += (vec3(1.0,0.95,0.8) * pow(s, 800.0) + vec3(0.5,0.45,0.35) * pow(s, 8.0)) * uDay;
      gl_FragColor = vec4(col, 1.0);
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat);
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x6b5a44, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d6, 1.3);
sun.position.set(0.55, 0.72, -0.42).multiplyScalar(100);
scene.add(sun);

// ---------- 噪声 ----------
function hash(x, z){
  let n = (x | 0) * 374761393 + (z | 0) * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
function vnoise(x, z){
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = smooth(xf), w = smooth(zf);
  return lerp(lerp(hash(xi,zi), hash(xi+1,zi), u),
              lerp(hash(xi,zi+1), hash(xi+1,zi+1), u), w);
}
function fbm(x, z){
  let a = 0, amp = 0.5, f = 1;
  for(let o = 0; o < 4; o++){ a += amp * vnoise(x*f, z*f); f *= 2; amp *= 0.5; }
  return a;
}
// ---- 3D 噪声（洞穴雕刻用）----
function hash3(x, y, z){
  let n = (x|0)*374761393 + (y|0)*668265263 + (z|0)*1274126177;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}
function vnoise3(x, y, z){
  const xi=Math.floor(x), yi=Math.floor(y), zi=Math.floor(z);
  const xf=x-xi, yf=y-yi, zf=z-zi;
  const u=smooth(xf), v=smooth(yf), w=smooth(zf);
  const l = (a,b,t)=> a+(b-a)*t;
  return l(
    l(l(hash3(xi,yi,zi),   hash3(xi+1,yi,zi),   u), l(hash3(xi,yi+1,zi),   hash3(xi+1,yi+1,zi),   u), v),
    l(l(hash3(xi,yi,zi+1), hash3(xi+1,yi,zi+1), u), l(hash3(xi,yi+1,zi+1), hash3(xi+1,yi+1,zi+1), u), v),
    w);
}
function fbm3(x, y, z){
  let a = 0, amp = 0.5, f = 1;
  for(let o = 0; o < 3; o++){ a += amp * vnoise3(x*f, y*f, z*f); f *= 2; amp *= 0.5; }
  return a;
}
function caveAt(x, y, z){
  return fbm3(x*0.13 + 5.0, y*0.13 + 9.0, z*0.13 + 2.0) > 0.3;
}

// ---------- 体素存储（无限世界） ----------
const PALETTE = {
  grass: 0x6ab04c, dirt: 0x8a5a2b, stone: 0x8d949c, iron: 0xb0b8c0, gold: 0xffd24a,
  diamond: 0x6ffcff, coal: 0x33373d, sand: 0xe2cf8a,
  water: 0x3a7bd5, lava: 0xe05626, wood: 0x9c6b3f, leaf: 0x3f8f3f, snow: 0xeaf2f7
};
const CHUNK = 16;          // 区块边长（列数）
const VIEW = 4;            // 视野半径（区块数）
const DEPTH = 5;           // 地表往下挖几层
const WATER = 2;           // 水平面高度
let amp = 12;
let cavesOn = true;
let SNOW_LINE = Math.floor(amp * 0.7) + 4;   // 雪线（随起伏变化）
let edits = new Map();     // "x,y,z" -> 颜色值 或 null(挖空)
let chunks = new Map();    // "cx,cz" -> { mesh }
const key = (x,y,z) => x + ',' + y + ',' + z;
const ckey = (cx,cz) => cx+','+cz;
const wkey = (x,z) => x + ',' + z;                 // 水体状态用「列」坐标

// ---------- 水体流动（简单元胞流体：表面均衡 + 体积守恒）----------
// water: Map<"x,z", 水面y(整数)>；t(x,z): 返回该列地形顶高度。
// 每步：有水格把水分给「更低」的 4 邻（含干涸但更低的地面），直到相邻表面趋于一致；体积严格守恒。
const MAX_WATER_DEPTH = 16;
function stepWater(water, t, maxDepth){
  maxDepth = (maxDepth == null) ? MAX_WATER_DEPTH : maxDepth;
  const N4 = [[1,0],[-1,0],[0,1],[0,-1]];
  const next = new Map();
  const active = new Set();
  for(const k of water.keys()){
    active.add(k);
    const c = k.split(','); const x = +c[0], z = +c[1];
    for(const [dx,dz] of N4) active.add((x+dx) + ',' + (z+dz));
  }
  const delta = new Map();
  const give = (k,v)=> delta.set(k, (delta.get(k)||0) + v);
  for(const k of active){
    if(!water.has(k)) continue;                   // 干涸列只作为接收方
    const c = k.split(','); const x = +c[0], z = +c[1];
    const S = water.get(k);
    const lowers = [];
    for(const [dx,dz] of N4){
      const nk = (x+dx) + ',' + (z+dz);
      const Sn = water.has(nk) ? water.get(nk) : t(+nk.split(',')[0], +nk.split(',')[1]);
      if(Sn < S) lowers.push([nk, Sn]);            // 仅向更低处流
    }
    if(lowers.length === 0) continue;
    let sum = S, cnt = lowers.length + 1;
    for(const [,s] of lowers) sum += s;
    const avg = Math.floor(sum / cnt);
    const out = S - avg;                           // 本格应下降的体积
    if(out <= 0) continue;
    give(k, -out);
    const per = Math.floor(out / lowers.length), rem = out - per*lowers.length;
    for(let i=0;i<lowers.length;i++) give(lowers[i][0], per + (i < rem ? 1 : 0));
  }
  // 应用（体积守恒：所有 delta 之和为 0）
  for(const k of active){
    const c = k.split(','); const x = +c[0], z = +c[1]; const tn = t(x,z);
    const base = water.has(k) ? water.get(k) : tn;
    let s = base + (delta.get(k) || 0);
    if(s <= tn) continue;                          // 无水/低于地形则清空
    if(s > tn + maxDepth) s = tn + maxDepth;
    next.set(k, s);
  }
  return next;
}

function heightAt(x, z){ return Math.floor(fbm(x*0.08 + 10, z*0.08 + 10) * amp) + 4; }
function voxelColor(x, y, z){
  const k = key(x,y,z);
  if(edits.has(k)) return edits.get(k);          // 编辑优先
  const h = heightAt(x, z);
  if(y > h) return null;
  if(y === h){
    if(h >= SNOW_LINE) return PALETTE.snow;       // 雪顶
    if(h <= WATER + 1) return PALETTE.sand;       // 水岸沙地
    return PALETTE.grass;
  }
  if(y >= h - 2) return (h <= WATER + 1) ? PALETTE.sand : PALETTE.dirt;
  if(cavesOn && y < h - 1 && caveAt(x, y, z)) return null;   // 石层中用 3D 噪声雕刻洞穴
  // 矿石：石层中按深度 + 3D 噪声生成（越深越稀有/贵重），与洞穴不冲突
  const n = fbm3(x * 0.6 + 2.3, y * 0.6 + 4.1, z * 0.6 + 7.7);
  if(y < h - 5 && n > 0.6) return PALETTE.diamond;   // 最深：钻石（最稀）
  if(y < h - 3 && n > 0.45) return PALETTE.gold;     // 较深：金（少）
  if(n > 0.35) return PALETTE.iron;                  // 普遍：铁（约 15%）
  if(n < -0.7) return PALETTE.coal;                 // 煤炭（约 3%）
  return PALETTE.stone;
}

// ---------- 实例化渲染（每区块一个 InstancedMesh）----------
const geo = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshLambertMaterial();
const waterMat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55, color: PALETTE.water, depthWrite: false });
const dummy = new THREE.Object3D();
const col = new THREE.Color();
const PER_CHUNK = CHUNK * CHUNK * (DEPTH + 20);  // 单区块容量上限（含树木）

function buildChunk(cx, cz, lod){
  const solid = new THREE.InstancedMesh(geo, mat, PER_CHUNK);
  solid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  solid.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PER_CHUNK*3), 3);
  const water = new THREE.InstancedMesh(geo, waterMat, PER_CHUNK);
  water.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let si = 0, wi = 0;
  const place = (x,y,z,color)=>{
    if(si >= PER_CHUNK) return;
    dummy.position.set(x, y, z); dummy.updateMatrix();
    solid.setMatrixAt(si, dummy.matrix); col.setHex(color); solid.setColorAt(si, col); si++;
  };
  for(let lx = 0; lx < CHUNK; lx++){
    for(let lz = 0; lz < CHUNK; lz++){
      const x = cx*CHUNK + lx, z = cz*CHUNK + lz;
      const h = heightAt(x, z);
      const yTop = h + 8;                       // 留出建造缓冲
      for(let y = h - DEPTH + 1; y <= yTop; y++){
        const c = voxelColor(x, y, z);
        if(c === null) continue;
        place(x, y, z, c);
      }
      // 低洼列初始化为海平面（仅注入一次），并用水体状态渲染流动后的水面
      const wk = wkey(x, z);
      if(!lod && h < WATER && !waterCol.has(wk)) waterCol.set(wk, WATER);
      if(!lod && waterCol.has(wk)){
        const top = waterCol.get(wk);
        for(let y = h + 1; y <= top; y++){
          if(wi >= PER_CHUNK) break;
          dummy.position.set(x, y, z); dummy.updateMatrix();
          water.setMatrixAt(wi, dummy.matrix); wi++;
        }
      }
    }
  }
  // 程序化树木：仅在草坡（非雪/沙/水）以低概率生成（远处 LOD 省略）
  if(!lod){
  for(let lx = 0; lx < CHUNK; lx++){
    for(let lz = 0; lz < CHUNK; lz++){
      const x = cx*CHUNK + lx, z = cz*CHUNK + lz;
      const h = heightAt(x, z);
      if(h < WATER + 2 || h >= SNOW_LINE) continue;
      if(hash(x, z) > 0.06) continue;
      const trunkH = 3 + Math.floor(hash(z, x) * 3);
      const baseY = h + 1, topY = baseY + trunkH - 1;
      for(let y = baseY; y <= topY; y++) place(x, y, z, PALETTE.wood);
      for(let dy = -2; dy <= 1; dy++){
        const ly = topY + dy, rad = dy < 0 ? 2 : 1;
        for(let dx = -rad; dx <= rad; dx++) for(let dz = -rad; dz <= rad; dz++){
          if(dx === 0 && dz === 0 && dy < 1) continue;
          if(dx*dx + dz*dz > rad*rad + 1) continue;
          place(x+dx, ly, z+dz, PALETTE.leaf);
        }
      }
    }
  }
  }
  solid.count = si;
  solid.instanceMatrix.needsUpdate = true;
  solid.instanceColor.needsUpdate = true;
  solid.frustumCulled = true;
  water.count = wi;
  water.instanceMatrix.needsUpdate = true;
  water.frustumCulled = true;
  scene.add(solid);
  scene.add(water);
  return { solid, water, count: si + wi };
}
function rebuildChunk(cx, cz){
  const k = ckey(cx, cz);
  const c = chunks.get(k);
  if(!c) return;
  const dist = Math.max(Math.abs(cx - Math.floor(controls.target.x / CHUNK)),
                        Math.abs(cz - Math.floor(controls.target.z / CHUNK)));
  scene.remove(c.mesh.solid); c.mesh.solid.dispose();
  scene.remove(c.mesh.water); c.mesh.water.dispose();
  chunks.set(k, { mesh: buildChunk(cx, cz, dist > 2) });
}
// 仅重建某区块的水网格（模拟步进后增量更新，避免重建整块实体）
function rebuildWater(cx, cz){
  const k = ckey(cx, cz); const c = chunks.get(k); if(!c) return;
  const wmesh = c.mesh.water; let wi = 0;
  for(let lx = 0; lx < CHUNK; lx++) for(let lz = 0; lz < CHUNK; lz++){
    const x = cx*CHUNK + lx, z = cz*CHUNK + lz, wk = wkey(x, z);
    if(waterCol.has(wk)){
      const h = heightAt(x, z), top = waterCol.get(wk);
      for(let y = h + 1; y <= top; y++){ if(wi >= PER_CHUNK) break; dummy.position.set(x, y, z); dummy.updateMatrix(); wmesh.setMatrixAt(wi, dummy.matrix); wi++; }
    }
  }
  wmesh.count = wi; wmesh.instanceMatrix.needsUpdate = true;
}
// 模拟步进：对视野内水体跑一次 CA，更新状态并重绘受影响区块
function simulateWater(){
  if(waterCol.size === 0) return;
  const cx0 = Math.floor(controls.target.x / CHUNK);
  const cz0 = Math.floor(controls.target.z / CHUNK);
  const next = stepWater(waterCol, (x,z)=> heightAt(x,z), MAX_WATER_DEPTH);
  waterCol.clear(); for(const [k,v] of next) waterCol.set(k, v);
  for(const [k] of chunks){
    const [cx, cz] = k.split(',').map(Number);
    if(Math.max(Math.abs(cx-cx0), Math.abs(cz-cz0)) <= VIEW) rebuildWater(cx, cz);
  }
}

let totalCount = 0;
function ensureChunks(){
  const cx0 = Math.floor(controls.target.x / CHUNK);
  const cz0 = Math.floor(controls.target.z / CHUNK);
  // 新增视野内区块
  for(let dx = -VIEW; dx <= VIEW; dx++){
    for(let dz = -VIEW; dz <= VIEW; dz++){
      const cx = cx0+dx, cz = cz0+dz, k = ckey(cx,cz);
      if(!chunks.has(k)) chunks.set(k, { mesh: buildChunk(cx, cz, Math.max(Math.abs(dx), Math.abs(dz)) > 2) });
    }
  }
  // 回收视野外区块
  for(const [k, c] of chunks){
    const [cx, cz] = k.split(',').map(Number);
    if(Math.max(Math.abs(cx-cx0), Math.abs(cz-cz0)) > VIEW+1){
      scene.remove(c.mesh.solid); c.mesh.solid.dispose();
      scene.remove(c.mesh.water); c.mesh.water.dispose();
      chunks.delete(k);
    }
  }
  totalCount = 0; for(const c of chunks.values()) totalCount += c.mesh.count;
  document.getElementById('count').textContent = totalCount + ' / 区块 ' + chunks.size;
}

// ---------- 编辑 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let mode = 'add', brush = 'grass';
function editAt(clientX, clientY, remove){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  // 找一个命中（任一区块 mesh）
  const meshes = [...chunks.values()].map(c => c.mesh.solid);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if(!hit) return;
  const m = hit.object, id = hit.instanceId;
  // 还原该实例的世界坐标
  m.getMatrixAt(id, dummy.matrix); dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
  const x = Math.round(dummy.position.x), y = Math.round(dummy.position.y), z = Math.round(dummy.position.z);
  const n = hit.face.normal;
  if(remove){ edits.set(key(x,y,z), null); }
  else {
    const nx = x + Math.round(n.x), ny = y + Math.round(n.y), nz = z + Math.round(n.z);
    edits.set(key(nx,ny,nz), PALETTE[brush]);
  }
  rebuildChunk(Math.floor(x/CHUNK), Math.floor(z/CHUNK));
}

// ---------- 方块拾取与移动 ----------
// 纯函数：根据命中面法线，返回方块应放置的目标整数坐标（面外侧一格）
function destFromFace(x, y, z, nx, ny, nz){
  return { x: x + Math.round(nx), y: y + Math.round(ny), z: z + Math.round(nz) };
}
// 纯函数：把 src 的方块(颜色 color)移动到 dst，更新 edits（旧位置置空、新位置着色）
function commitMove(edits, src, dst, color, keyFn){
  edits.set(keyFn(dst.x, dst.y, dst.z), color);
  edits.set(keyFn(src.x, src.y, src.z), null);
  return edits;
}
let selected = null;            // {x,y,z}
let selectedColor = null;
const selBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)),
  new THREE.LineBasicMaterial({ color: 0xffee00 })
);
selBox.visible = false;
scene.add(selBox);
function pickCoord(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const meshes = [...chunks.values()].map(c => c.mesh.solid);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if(!hit) return null;
  const m = hit.object, id = hit.instanceId;
  m.getMatrixAt(id, dummy.matrix); dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
  const x = Math.round(dummy.position.x), y = Math.round(dummy.position.y), z = Math.round(dummy.position.z);
  const n = hit.face.normal;
  return { x, y, z, nx: n.x, ny: n.y, nz: n.z };
}
function movePick(clientX, clientY){
  const p = pickCoord(clientX, clientY);
  if(!p) return;
  if(!selected){
    const c = voxelColor(p.x, p.y, p.z);
    if(c === null) return;            // 空/水不可选
    selected = { x: p.x, y: p.y, z: p.z };
    selectedColor = c;
    selBox.position.set(p.x, p.y, p.z);
    selBox.visible = true;
    flash('已选中方块，点击目标面放置');
  } else {
    const d = destFromFace(p.x, p.y, p.z, p.nx, p.ny, p.nz);
    if(d.x === selected.x && d.y === selected.y && d.z === selected.z){
      selected = null; selBox.visible = false; flash('已取消选择'); return;
    }
    commitMove(edits, selected, d, selectedColor, key);
    rebuildChunk(Math.floor(d.x/CHUNK), Math.floor(d.z/CHUNK));
    rebuildChunk(Math.floor(selected.x/CHUNK), Math.floor(selected.z/CHUNK));
    selected = null; selBox.visible = false;
    flash('已移动到 ('+d.x+','+d.y+','+d.z+')');
  }
}
renderer.domElement.addEventListener('pointerdown', e=>{
  if(e.button === 2) { editAt(e.clientX, e.clientY, true); return; }
  if(mode === 'add') editAt(e.clientX, e.clientY, false);
  else if(mode === 'del') editAt(e.clientX, e.clientY, true);
  else if(mode === 'move') movePick(e.clientX, e.clientY);
});
renderer.domElement.addEventListener('contextmenu', e=> e.preventDefault());

// ---------- 键盘漫游 (WASD) ----------
const keys = {};
window.addEventListener('keydown', e=>{ if(walkMode && e.key === ' ') e.preventDefault(); keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()] = false; });
function moveStep(){
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0,1,0)).normalize();
  const d = new THREE.Vector3();
  if(keys['w']) d.add(fwd); if(keys['s']) d.addScaledVector(fwd,-1);
  if(keys['a']) d.addScaledVector(right,-1); if(keys['d']) d.add(right);
  if(d.lengthSq() > 0){
    d.multiplyScalar(2.5);
    if(!walkMode){ camera.position.add(d); controls.target.add(d); }   // 行走模式由 tick 取用做碰撞
  }
  return d;
}

// ---------- 行走模式（重力 / 落地碰撞 / 跳跃）----------
let walkMode = false, velY = 0, onGround = false;
const GRAV = 22, EYE = 1.8, JUMP = 8.5;
// 某整数坐标是否为实心方块（用于碰撞判定）
function solidAt(x, y, z){ return voxelColor(Math.round(x), Math.round(y), Math.round(z)) !== null; }
function surfaceY(x, z){
  const h = heightAt(Math.round(x), Math.round(z));
  return h + 8 + EYE;   // 顶部方块(h+8)之上 + 视高
}

// ---------- 昼夜循环 ----------
let dayNight = false, dayT = 0;
const DAY_SPEED = 0.06;

// ---------- 控件 ----------
const $ = id => document.getElementById(id);
$('addBtn').onclick = ()=>{ mode='add'; $('addBtn').classList.add('on'); $('delBtn').classList.remove('on'); $('moveBtn').classList.remove('on'); $('mode').textContent='模式: 添加'; };
$('delBtn').onclick = ()=>{ mode='del'; $('delBtn').classList.add('on'); $('addBtn').classList.remove('on'); $('moveBtn').classList.remove('on'); $('mode').textContent='模式: 删除'; };
$('moveBtn').onclick = ()=>{ mode='move'; $('moveBtn').classList.add('on'); $('addBtn').classList.remove('on'); $('delBtn').classList.remove('on'); $('mode').textContent='模式: 拾取并移动(先选后放)'; };
$('brush').onchange = e=> brush = e.target.value;
$('amp').oninput = e=>{ amp=+e.target.value; SNOW_LINE = Math.floor(amp*0.7)+4; $('ampVal').textContent=amp;
  for(const [k] of chunks){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); } };
$('regen').onclick = ()=>{ edits.clear(); for(const [k] of chunks){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); } };
$('walkBtn').onclick = ()=>{
  walkMode = !walkMode;
  controls.enabled = !walkMode;
  $('walkBtn').classList.toggle('on', walkMode);
  document.getElementById('mode').textContent = walkMode ? '模式: 行走(重力)' : '模式: 添加';
  if(walkMode){ velY = 0; onGround = true; camera.position.y = surfaceY(camera.position.x, camera.position.z); }
};
$('dayBtn').onclick = ()=>{
  dayNight = !dayNight;
  $('dayBtn').classList.toggle('on', dayNight);
};
$('caves').onchange = e=>{
  cavesOn = e.target.checked;
  for(const [k] of chunks){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); }
};
// ---------- 世界存档（localStorage：地形种子 + 洞穴开关 + 编辑）----------
function flash(msg){ const m = $('mode'); const old = m.textContent; m.textContent = msg; setTimeout(()=>{ m.textContent = walkMode ? '模式: 行走(重力)' : '模式: 添加'; }, 1500); }
$('saveW').onclick = ()=>{
  try{
    const data = { amp, cavesOn, edits: [...edits.entries()] };
    localStorage.setItem('voxelforge_world', JSON.stringify(data));
    flash('已保存世界 ✓');
  }catch(e){ flash('保存失败'); }
};
$('loadW').onclick = ()=>{
  try{
    const s = localStorage.getItem('voxelforge_world'); if(!s){ flash('无存档'); return; }
    const d = JSON.parse(s);
    amp = (typeof d.amp === 'number') ? d.amp : amp;
    cavesOn = (typeof d.cavesOn === 'boolean') ? d.cavesOn : cavesOn;
    edits = new Map(Array.isArray(d.edits) ? d.edits : []);
    SNOW_LINE = Math.floor(amp * 0.7) + 4;
    $('amp').value = amp; $('ampVal').textContent = amp;
    $('caves').checked = cavesOn;
    for(const [k] of chunks){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); }
    flash('已读取世界 ✓');
  }catch(e){ flash('读取失败'); }
};

// ---------- 循环 ----------
function resize(){
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h); camera.aspect = w/h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
let lastCx = 1e9, lastCz = 1e9;
let lastTick = performance.now();
function tick(){
  requestAnimationFrame(tick);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTick) / 1000); lastTick = now;
  const move = moveStep();
  if(walkMode){
    // 水平碰撞：逐轴判定，遇实心方块则该轴不前进（不能穿墙）
    if(move.lengthSq() > 0){
      const r = 0.35;
      const dirX = Math.sign(move.x), dirZ = Math.sign(move.z);
      const tryX = camera.position.x + move.x;
      if(!solidAt(tryX + dirX*r, camera.position.y - 1.0, camera.position.z) &&
         !solidAt(tryX + dirX*r, camera.position.y,       camera.position.z))
        camera.position.x = tryX;
      const tryZ = camera.position.z + move.z;
      if(!solidAt(camera.position.x, camera.position.y - 1.0, tryZ + dirZ*r) &&
         !solidAt(camera.position.x, camera.position.y,       tryZ + dirZ*r))
        camera.position.z = tryZ;
    }
    // 跳跃
    if(keys[' '] && onGround){ velY = JUMP; onGround = false; }
    // 重力 + 落地
    velY -= GRAV * dt;
    camera.position.y += velY * dt;
    const gy = surfaceY(camera.position.x, camera.position.z);
    if(camera.position.y <= gy){ camera.position.y = gy; velY = 0; onGround = true; }
    controls.target.set(camera.position.x, camera.position.y - 0.3, camera.position.z + 1);
    camera.lookAt(controls.target);
  } else {
    controls.update();
  }
  if(dayNight){
    dayT += dt * DAY_SPEED;
    const ang = dayT * Math.PI * 2;
    const sy = Math.sin(ang), sx = Math.cos(ang);
    const dir = new THREE.Vector3(sx, sy, -0.42).normalize();
    sun.position.copy(dir.clone().multiplyScalar(100));
    skyMat.uniforms.uSun.value.copy(dir);
    const dayFactor = Math.max(0, Math.min(1, sy * 0.5 + 0.5));
    skyMat.uniforms.uDay.value = dayFactor;
    sun.intensity = 0.15 + dayFactor * 1.3;
    hemi.intensity = 0.25 + dayFactor * 0.8;
  }
  const cx = Math.floor(controls.target.x / CHUNK), cz = Math.floor(controls.target.z / CHUNK);
  if(cx !== lastCx || cz !== lastCz){ lastCx = cx; lastCz = cz; ensureChunks(); }
  renderer.render(scene, camera);
}
resize();
ensureChunks();
setInterval(simulateWater, 700);     // 水体流动模拟（每 0.7s 步进一次）
document.getElementById('mode').textContent='模式: 添加';
tick();
