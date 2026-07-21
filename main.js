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
  diamond: 0x6ffcff, coal: 0x33373d, sand: 0xe2cf8a, gravel: 0x8a8d91,
  water: 0x3a7bd5, lava: 0xe05626, wood: 0x9c6b3f, leaf: 0x3f8f3f, snow: 0xeaf2f7
};
const FALL = new Set(['sand','gravel']);   // 参与重力掉落的方块笔刷（沙/砾石）
const CHUNK = 16;          // 区块边长（列数）
const VIEW = 4;            // 视野半径（区块数）
const DEPTH = 5;           // 地表往下挖几层
const WATER = 2;           // 水平面高度
let amp = 12;
let cavesOn = true;
let SNOW_LINE = Math.floor(amp * 0.7) + 4;   // 雪线（随起伏变化）
let edits = new Map();     // "x,y,z" -> 颜色值 或 null(挖空)
let falling = new Set();   // "x,y,z" -> 参与重力掉落的方块（仅用户放置的沙/砾石）
let chunks = new Map();    // "cx,cz" -> { mesh }
let waterCol = new Map();  // "x,z" -> 水面y(整数)：列状水状态（修复：此前漏声明，浏览器会崩溃）
let lavaCol = new Map();   // "x,z" -> 岩浆面y(整数)：列状岩浆状态

// ---------- 撤销/重做（快照式，作用于 edits 体素编辑） ----------
let undoStack = [], redoStack = [];
const UNDO_CAP = 64;
function snapshotEdits(){ return new Map(edits); }
function rebuildAll(){ for(const k of chunks.keys()){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); } }
function editsEqual(a, b){
  if(a.size !== b.size) return false;
  for(const [k,v] of a){ if(b.get(k) !== v) return false; }
  return true;
}
// 编辑前 snapshot，编辑后调用：若有变化则压入撤销栈、清空重做栈（并限长）
function recordUndo(prev){ if(prev && !editsEqual(prev, edits)){ undoStack.push(prev); if(undoStack.length > UNDO_CAP) undoStack.shift(); redoStack.length = 0; } }
function undoEdit(){ if(undoStack.length === 0) return false; redoStack.push(new Map(edits)); edits = undoStack.pop(); rebuildAll(); return true; }
function redoEdit(){ if(redoStack.length === 0) return false; undoStack.push(new Map(edits)); edits = redoStack.pop(); rebuildAll(); return true; }
let lavaOn = true;         // 岩浆模拟总开关
const key = (x,y,z) => x + ',' + y + ',' + z;
const ckey = (cx,cz) => cx+','+cz;
const wkey = (x,z) => x + ',' + z;                 // 水体/岩浆状态用「列」坐标

// ---------- 世界存读档（JSON 导入/导出）----------
// 将三种体素状态序列化为纯 JSON；deserializeWorld 反序列化回 Map。
// 纯函数：不依赖 THREE，便于 Node 测试与复用。
function serializeWorld(edits, waterCol, lavaCol){
  return {
    v: 1,
    edits: [...edits.entries()],
    water: [...waterCol.entries()],
    lava: [...lavaCol.entries()]
  };
}
function deserializeWorld(data){
  const d = (data && Array.isArray(data.edits)) ? data : { edits: [], water: [], lava: [] };
  const toMap = (arr) => { const m = new Map(); if(Array.isArray(arr)) for(const e of arr){ if(Array.isArray(e) && e.length >= 2) m.set(e[0], e[1]); } return m; };
  return { edits: toMap(d.edits), waterCol: toMap(d.water), lavaCol: toMap(d.lava) };
}

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

// ---------- 掉落方块（沙/砾石重力 CA）----------
// falling: Set<"x,y,z">（仅用户放置的沙/砾石参与重力）
// edits:   Map<"x,y,z", color|null>
// isSolid(x,y,z): 该坐标是否实心（建议 = voxelColor(x,y,z) !== null）
// keyFn(x,y,z):   生成坐标键；chunkKey(x,z): 返回受影响区块 key（可省略）
// 返回受影响区块 key 的 Set（供增量重建）。每步：悬空块向下掉一格、下方实心则停。
function stepFalling(falling, edits, isSolid, keyFn, chunkKey){
  const touched = new Set();
  const list = [...falling];
  list.sort((a,b)=> +a.split(',')[1] - +b.split(',')[1]);   // 按 y 升序：使同列堆叠可一次下移一格
  for(const k of list){
    const c = k.split(','); const x = +c[0], y = +c[1], z = +c[2];
    if(edits.get(k) == null){ falling.delete(k); continue; }  // 已被移走/挖空
    if(isSolid(x, y - 1, z)) continue;                       // 下方实心，停止
    const below = keyFn(x, y - 1, z);                        // 下方为空：下落一格
    edits.set(below, edits.get(k));
    edits.set(k, null);
    falling.delete(k);
    falling.add(below);
    if(chunkKey) touched.add(chunkKey(x, z));
  }
  return touched;
}

// ---------- 岩浆流体（黏滞 + 冷却成石 + 点燃可燃物）----------
// lava:   Map<"x,z", 岩浆面y(整数)>（列状，类比 water）
// water:  Map<"x,z", 水面y>（用于冷却检测；邻接水 → 岩浆冷却为石头、水被消耗）
// t:      地形顶高度函数
// flammable: Set<"x,z"> 可燃物列（邻接 → 该列被点燃为焦黑）
// gap:    黏滞阈值（默认 2）——仅向「低 >= gap」的邻居横向流动，浅坡(落差<2)不铺开
// 返回 { lava, stone, waterConsumed, charred }；流动阶段体积严格守恒。
function stepLava(lava, water, t, flammable, maxDepth, gap){
  maxDepth = (maxDepth == null) ? MAX_WATER_DEPTH : maxDepth;
  gap = (gap == null) ? 2 : gap;                   // 黏滞阈值（独立可测，不依赖外部常量）
  const N4 = [[1,0],[-1,0],[0,1],[0,-1]];
  const next = new Map();
  const active = new Set();
  for(const k of lava.keys()){
    active.add(k);
    const c = k.split(','); const x = +c[0], z = +c[1];
    for(const [dx,dz] of N4) active.add((x+dx) + ',' + (z+dz));
  }
  const delta = new Map();
  const give = (k,v)=> delta.set(k, (delta.get(k)||0) + v);
  for(const k of active){
    if(!lava.has(k)) continue;                     // 干涸列只作接收方
    const c = k.split(','); const x = +c[0], z = +c[1];
    const S = lava.get(k);
    const lowers = [];
    for(const [dx,dz] of N4){
      const nk = (x+dx) + ',' + (z+dz);
      const Sn = lava.has(nk) ? lava.get(nk) : t(+nk.split(',')[0], +nk.split(',')[1]);
      if(S - Sn >= gap) lowers.push([nk, Sn]);      // 仅向明显更低处流（黏滞）
    }
    if(lowers.length === 0) continue;
    let sum = S, cnt = lowers.length + 1;
    for(const [,s] of lowers) sum += s;
    const avg = Math.floor(sum / cnt);
    const out = S - avg;
    if(out <= 0) continue;
    give(k, -out);
    const per = Math.floor(out / lowers.length), rem = out - per*lowers.length;
    for(let i=0;i<lowers.length;i++) give(lowers[i][0], per + (i < rem ? 1 : 0));
  }
  // 应用（体积守恒）
  for(const k of active){
    const c = k.split(','); const x = +c[0], z = +c[1]; const tn = t(x,z);
    const base = lava.has(k) ? lava.get(k) : tn;
    let s = base + (delta.get(k) || 0);
    if(s <= tn) continue;                          // 低于地形则清空
    if(s > tn + maxDepth) s = tn + maxDepth;
    next.set(k, s);
  }
  // 冷却：岩浆邻接水 → 冷却成石头（obsidian），水被消耗
  const stone = new Set(), waterConsumed = new Set();
  for(const k of [...next.keys()]){
    const c = k.split(','); const x = +c[0], z = +c[1];
    let cooled = false;
    for(const [dx,dz] of N4){
      const nk = (x+dx) + ',' + (z+dz);
      if(water.has(nk)){ cooled = true; waterConsumed.add(nk); }
    }
    if(cooled){ stone.add(k); next.delete(k); }
  }
  // 点燃：岩浆邻接可燃物 → 该邻居成焦黑
  const charred = new Set();
  for(const k of next.keys()){
    const c = k.split(','); const x = +c[0], z = +c[1];
    for(const [dx,dz] of N4){
      const nk = (x+dx) + ',' + (z+dz);
      if(flammable.has(nk)) charred.add(nk);
    }
  }
  return { lava: next, stone, waterConsumed, charred };
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
const lavaMat = new THREE.MeshLambertMaterial({ color: PALETTE.lava, emissive: 0x5a1500, emissiveIntensity: 0.9 });
const dummy = new THREE.Object3D();
const col = new THREE.Color();
const PER_CHUNK = CHUNK * CHUNK * (DEPTH + 20);  // 单区块容量上限（含树木）

function buildChunk(cx, cz, lod){
  const solid = new THREE.InstancedMesh(geo, mat, PER_CHUNK);
  solid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  solid.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PER_CHUNK*3), 3);
  const water = new THREE.InstancedMesh(geo, waterMat, PER_CHUNK);
  water.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const lava = new THREE.InstancedMesh(geo, lavaMat, PER_CHUNK);
  lava.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let si = 0, wi = 0, li = 0;
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
      // 岩浆渲染（用户放置的岩浆列，流动后更新）
      if(!lod && lavaCol.has(wk)){
        const top = lavaCol.get(wk);
        for(let y = h + 1; y <= top; y++){
          if(li >= PER_CHUNK) break;
          dummy.position.set(x, y, z); dummy.updateMatrix();
          lava.setMatrixAt(li, dummy.matrix); li++;
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
  lava.count = li;
  lava.instanceMatrix.needsUpdate = true;
  lava.frustumCulled = true;
  scene.add(solid);
  scene.add(water);
  scene.add(lava);
  return { solid, water, lava, count: si + wi + li };
}
function rebuildChunk(cx, cz){
  const k = ckey(cx, cz);
  const c = chunks.get(k);
  if(!c) return;
  const dist = Math.max(Math.abs(cx - Math.floor(controls.target.x / CHUNK)),
                        Math.abs(cz - Math.floor(controls.target.z / CHUNK)));
  scene.remove(c.mesh.solid); c.mesh.solid.dispose();
  scene.remove(c.mesh.water); c.mesh.water.dispose();
  scene.remove(c.mesh.lava); c.mesh.lava.dispose();
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
// 仅重建某区块的岩浆网格（增量更新）
function rebuildLava(cx, cz){
  const k = ckey(cx, cz); const c = chunks.get(k); if(!c) return;
  const lmesh = c.mesh.lava; let li = 0;
  for(let lx = 0; lx < CHUNK; lx++) for(let lz = 0; lz < CHUNK; lz++){
    const x = cx*CHUNK + lx, z = cz*CHUNK + lz, lk = wkey(x, z);
    if(lavaCol.has(lk)){
      const h = heightAt(x, z), top = lavaCol.get(lk);
      for(let y = h + 1; y <= top; y++){ if(li >= PER_CHUNK) break; dummy.position.set(x, y, z); dummy.updateMatrix(); lmesh.setMatrixAt(li, dummy.matrix); li++; }
    }
  }
  lmesh.count = li; lmesh.instanceMatrix.needsUpdate = true;
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
// 模拟步进：对视野内岩浆跑一次 CA（黏滞流动 + 冷却成石 + 点燃），更新并重绘
function simulateLava(){
  if(!lavaOn || lavaCol.size === 0) return;
  const cx0 = Math.floor(controls.target.x / CHUNK);
  const cz0 = Math.floor(controls.target.z / CHUNK);
  // 冷却前记录各岩浆列表面高度（用于生成石头方块的高度）
  const surfBefore = new Map();
  for(const [k,v] of lavaCol) surfBefore.set(k, v);
  // 可燃物集合：编辑过的树木/树叶所在列（邻接岩浆会被点燃）
  const flammable = new Set();
  for(const [ek, ev] of edits){
    if(ev === PALETTE.wood || ev === PALETTE.leaf){
      const p = ek.split(','); flammable.add(p[0] + ',' + p[2]);
    }
  }
  const r = stepLava(lavaCol, waterCol, (x,z)=> heightAt(x,z), flammable, MAX_WATER_DEPTH);
  lavaCol.clear(); for(const [k,v] of r.lava) lavaCol.set(k, v);
  // 冷却成石（obsidian）
  for(const k of r.stone){
    const [x,z] = k.split(',').map(Number);
    const sy = (surfBefore.get(k) != null) ? surfBefore.get(k) : heightAt(x, z);
    edits.set(key(x, sy, z), PALETTE.stone);
  }
  // 点燃成焦黑
  for(const k of r.charred){
    const [x,z] = k.split(',').map(Number);
    const sy = heightAt(x, z) + 1;
    edits.set(key(x, sy, z), 0x1a1a1a);
  }
  // 增量重建受影响区块（有石头/焦黑则重建实体，否则仅重建岩浆网格）
  for(const [k] of chunks){
    const [cx, cz] = k.split(',').map(Number);
    if(Math.max(Math.abs(cx-cx0), Math.abs(cz-cz0)) > VIEW) continue;
    if(r.stone.size || r.charred.size) rebuildChunk(cx, cz);
    else rebuildLava(cx, cz);
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
      scene.remove(c.mesh.lava); c.mesh.lava.dispose();
      chunks.delete(k);
    }
  }
  totalCount = 0; for(const c of chunks.values()) totalCount += c.mesh.count;
  document.getElementById('count').textContent = totalCount + ' / 区块 ' + chunks.size;
}

// ---------- 编辑 ----------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let mode = 'add', brush = 'grass', brushSize = 1, boomR = 3, brushShape = 'box';
let mirrorOn = false, mirrorAxis = 'x', mirrorCenter = 0;   // 镜像笔刷：沿某轴以 center 为镜面反射每次落笔
// ---------- 笔刷：纯函数（编辑与测试复用）----------
// 放置笔刷：从命中点外侧一格 (nx,ny,nz) 起，按 size³ 立方体填充。
// 流体(水/岩浆)按列记录表面高度(顶部空格 = ny+size)；实心方块写入 edits，沙/砾石加入掉落集。
// 关键修复：water 笔刷此前误走 else 分支写成“实心蓝块”，现独立成流体列。
function applyBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, size, FALL, key, wkey, PALETTE){
  size = size || 1;
  const top = ny + size;
  for(let di=0; di<size; di++) for(let dj=0; dj<size; dj++) for(let dk=0; dk<size; dk++){
    const x = nx+di, y = ny+dj, z = nz+dk;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, top); continue; }
    if(brush === 'water'){ waterCol.set(wk, top); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 擦除笔刷：仅当被擦格恰好是某流体列的表面时才清除该列，避免误删无关流体
function eraseBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, size, key, wkey){
  size = size || 1;
  for(let di=0; di<size; di++) for(let dj=0; dj<size; dj++) for(let dk=0; dk<size; dk++){
    const x = nx+di, y = ny+dj, z = nz+dk;
    const k = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(k, null);
    falling.delete(k);
  }
}
// 纯函数：球形笔刷——以 (nx,ny,nz) 为中心、半径 radius 的实心球内落笔（球外跳过），其余语义与 applyBrush 一致。
// 半径 1 => 单格；半径 2 => 3×3×3 内剔除角点；流体列顶面对齐球体顶 y = ny+2r-1。
function applySphereBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const top = ny + 2*r - 1;
  for(let dx=-r+1; dx<r; dx++) for(let dy=-r+1; dy<r; dy++) for(let dz=-r+1; dz<r; dz++){
    if(dx*dx + dy*dy + dz*dz > r*r) continue;       // 球外剔除
    const x = nx+dx, y = ny+dy, z = nz+dz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, top); continue; }
    if(brush === 'water'){ waterCol.set(wk, top); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：球形擦除——以 (nx,ny,nz) 为中心、半径 radius 的球内清除（与 applySphereBrush 同几何，仅置空/退掉落集）。
function eraseSphereBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const top = ny + 2*r - 1;
  for(let dx=-r+1; dx<r; dx++) for(let dy=-r+1; dy<r; dy++) for(let dz=-r+1; dz<r; dz++){
    if(dx*dx + dy*dy + dz*dz > r*r) continue;
    const x = nx+dx, y = ny+dy, z = nz+dz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === top) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === top) lavaCol.delete(wk);
    edits.set(k, null);
    falling.delete(k);
  }
}
// 纯函数：批量换方块——遍历 edits，把所有 PALETTE[fromType] 方块替换为 PALETTE[toType]，返回新 Map。
// 不参与掉落集/流体列处理（仅换色），故只映射 edits 一项；空值(null) 与 非 from 颜色原样保留。
function replaceType(edits, fromType, toType, PALETTE){
  const from = PALETTE[fromType], to = PALETTE[toType];
  const next = new Map();
  for(const [k, v] of edits){
    next.set(k, (v === from) ? to : v);
  }
  return next;
}
// 纯函数：矿脉富集——把正交相邻于 oreType 矿物的石头块就地变为矿物，返回新 Map。
// 仅扫描 edits 中矿物细胞的 6 邻域，命中石头则富集；空值/非石头/非邻域保持不变。
function enrichOre(edits, oreType, key, PALETTE){
  const ore = PALETTE[oreType], stone = PALETTE.stone;
  const next = new Map(edits);   // 浅复制，避免原地修改
  const N = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for(const [k, v] of edits){
    if(v !== ore) continue;
    const [x,y,z] = k.split(',').map(Number);
    for(const d of N){
      const nk = key(x + d[0], y + d[1], z + d[2]);
      if(next.get(nk) === stone) next.set(nk, ore);
    }
  }
  return next;
}
// 纯函数：球形挖掘(爆破)——删除中心 (cx,cy,cz) 欧氏半径 radius 内的所有方块，返回新 Map（不改原 Map）。
// 半径边界用 <= r² 判定（含球面），体积守恒于“被移除”语义；空值/球外方块原样保留。
function explode(edits, cx, cy, cz, radius){
  const r2 = radius * radius;
  const next = new Map(edits);
  for(const [k] of edits){
    const [x,y,z] = k.split(',').map(Number);
    const dx = x-cx, dy = y-cy, dz = z-cz;
    if(dx*dx + dy*dy + dz*dz <= r2) next.set(k, null);
  }
  return next;
}
// 纯函数：三维洪泛填充(flood fill)——从 (sx,sy,sz) 出发，将 6 连通、颜色与种子相同的所有方块替换为 newType，返回新 Map(不改原)。
// 仅填充“同色实心方块”连通域，空(空气/流体列)种子不操作；目标同色直接返回原图(无副作用)。
function floodFill(edits, sx, sy, sz, newType, key, PALETTE){
  const seed = edits.get(key(sx, sy, sz));
  if(seed == null) return edits;                 // 种子为空(空气/水)不填充
  const reach = PALETTE[newType];
  if(reach === seed) return edits;               // 目标同色无需操作
  const next = new Map(edits);
  const N = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const stack = [[sx, sy, sz]];
  while(stack.length){
    const [x, y, z] = stack.pop();
    if(next.get(key(x, y, z)) !== seed) continue;   // 已处理 / 非同色 / 边界
    next.set(key(x, y, z), reach);
    for(const d of N) stack.push([x + d[0], y + d[1], z + d[2]]);
  }
  return next;
}

// 纯函数：镜像笔刷——把 edits 沿 axis 轴、以 center 为镜面(坐标值)做三维镜像，返回新 Map(含原块+镜像块)。
// 镜像坐标 = 2*center - 原坐标；落在镜面上的方块(mirror key === 原 key)跳过避免重复；不修改入参。
function mirrorEdits(edits, axis, center, key){
  const next = new Map(edits);
  for(const [k, v] of edits){
    const [x,y,z] = k.split(',').map(Number);
    let mx = x, my = y, mz = z;
    if(axis === 'x') mx = 2*center - x;
    else if(axis === 'y') my = 2*center - y;
    else /* z */ mz = 2*center - z;
    const mk = key(mx, my, mz);
    if(mk === k) continue;            // 镜面自身不重复
    next.set(mk, v);
  }
  return next;
}
// 纯函数：将 edits 导出为 Wavefront OBJ 文本（每个非空 voxel 输出一个单位立方体，8 顶点 + 12 三角面）。
// 顶点从 1 开始编号；挖空(null)跳过。返回字符串，供下载或离线处理。不修改入参。
function exportOBJ(edits, key, PALETTE){
  const lines = ['# VoxelForge export'];
  let vi = 1;
  for(const [k, v] of edits){
    if(v == null) continue;                 // 挖空跳过
    const [x,y,z] = k.split(',').map(Number);
    const corners = [
      [x-0.5,y-0.5,z-0.5],[x+0.5,y-0.5,z-0.5],[x+0.5,y+0.5,z-0.5],[x-0.5,y+0.5,z-0.5],
      [x-0.5,y-0.5,z+0.5],[x+0.5,y-0.5,z+0.5],[x+0.5,y+0.5,z+0.5],[x-0.5,y+0.5,z+0.5]
    ];
    for(const c of corners) lines.push('v ' + c[0] + ' ' + c[1] + ' ' + c[2]);
    const faces = [[1,2,3,4],[5,6,7,8],[1,4,8,5],[2,3,7,6],[1,5,6,2],[4,3,7,8]];
    for(const f of faces){
      lines.push('f ' + (vi+f[0]-1) + ' ' + (vi+f[1]-1) + ' ' + (vi+f[2]-1));
      lines.push('f ' + (vi+f[0]-1) + ' ' + (vi+f[2]-1) + ' ' + (vi+f[3]-1));
    }
    vi += 8;
  }
  return lines.join('\n') + '\n';
}
// 纯函数：框选复制——返回 [x0..x1]×[y0..y1]×[z0..z1] 包围盒内的非空 voxel 子 Map（挖空跳过）。
function copySelection(edits, x0,y0,z0,x1,y1,z1){
  const a=[Math.min(x0,x1),Math.min(y0,y1),Math.min(z0,z1)], b=[Math.max(x0,x1),Math.max(y0,y1),Math.max(z0,z1)];
  const out = new Map();
  for(const [k,v] of edits){
    if(v == null) continue;
    const [x,y,z] = k.split(',').map(Number);
    if(x>=a[0]&&x<=b[0]&&y>=a[1]&&y<=b[1]&&z>=a[2]&&z<=b[2]) out.set(k, v);
  }
  return out;
}
// 纯函数：粘贴——把剪贴板 clip 整体平移 (dx,dy,dz) 后并入 target，返回新 Map（不修改入参；clip 覆盖同名键）。
function pasteSelection(edits, clip, dx, dy, dz){
  const out = new Map(edits);
  for(const [k, v] of clip){
    const [x,y,z] = k.split(',').map(Number);
    out.set(key(x+dx, y+dy, z+dz), v);
  }
  return out;
}
// 纯函数：区域填充——把以 (x0..x1, y0..y1, z0..z1) 为对角顶点的长方体全部置为指定类型
// （type 为 PALETTE 的键；type 为 null 或 'air' 时清空该区域）。返回新 Map（不修改入参）。
function fillBox(edits, x0,y0,z0,x1,y1,z1, type, PALETTE){
  const out = new Map(edits);
  const a = [Math.min(x0,x1), Math.min(y0,y1), Math.min(z0,z1)];
  const b = [Math.max(x0,x1), Math.max(y0,y1), Math.max(z0,z1)];
  const color = (type === null || type === 'air') ? null : PALETTE[type];
  for(let x=a[0]; x<=b[0]; x++)
    for(let y=a[1]; y<=b[1]; y++)
      for(let z=a[2]; z<=b[2]; z++)
        out.set(key(x,y,z), color);
  return out;
}
// 纯函数：线段笔刷——沿 (x0,y0,z0)→(x1,y1,z1) 用参数化取整生成连续 3D 体素线，
// 全部置为指定类型（null/air 清空）。返回新 Map（不修改入参）。
function lineFill(edits, x0,y0,z0,x1,y1,z1, type, PALETTE){
  const out = new Map(edits);
  const color = (type === null || type === 'air') ? null : PALETTE[type];
  const dx=x1-x0, dy=y1-y0, dz=z1-z0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  if(steps === 0){ out.set(key(x0,y0,z0), color); return out; }
  for(let i=0;i<=steps;i++){
    const t = i/steps;
    out.set(key(Math.round(x0+dx*t), Math.round(y0+dy*t), Math.round(z0+dz*t)), color);
  }
  return out;
}

// 纯函数：统计 edits 中各类型方块数量（颜色反查 PALETTE）。可选 waterCol/lavaCol 计入流体列数。
// 返回 { counts:{类型:数量}, total:实心方块总数, removed:edits 中 null(挖空)数 }；不修改入参。
function blockStats(edits, PALETTE, waterCol, lavaCol){
  const colorToType = {};
  for(const t in PALETTE) colorToType[PALETTE[t]] = t;
  const counts = {};
  for(const t in PALETTE) counts[t] = 0;
  let total = 0, removed = 0;
  for(const [, v] of edits){
    if(v == null){ removed++; continue; }
    const t = colorToType[v];
    if(t !== undefined){ counts[t]++; total++; }
  }
  if(waterCol) counts.water = waterCol.size;
  if(lavaCol) counts.lava = lavaCol.size;
  return { counts, total, removed };
}

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
  const nx = x + Math.round(n.x), ny = y + Math.round(n.y), nz = z + Math.round(n.z);
  if(remove){
    if(brushShape === 'sphere') eraseSphereBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else eraseBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
  } else {
    if(brushShape === 'sphere') applySphereBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else applyBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
  }
  if(mirrorOn){
    edits = mirrorEdits(edits, mirrorAxis, mirrorCenter, key);
    rebuildAll();                 // 镜像可能落在其他区块，整世界重建以确保可见
  } else {
    rebuildChunk(Math.floor(x/CHUNK), Math.floor(z/CHUNK));
  }
}
// 球形挖掘：在命中方块处引爆半径 boomR 的球形空腔，删除范围内方块并重建受影响区块
function boomAt(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const meshes = [...chunks.values()].map(c => c.mesh.solid);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if(!hit) return;
  const m = hit.object, id = hit.instanceId;
  m.getMatrixAt(id, dummy.matrix); dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
  const cx = Math.round(dummy.position.x), cy = Math.round(dummy.position.y), cz = Math.round(dummy.position.z);
  const R = boomR, r2 = R * R;
  edits = explode(edits, cx, cy, cz, R);
  for(const k of [...falling]){   // 清理被挖掉的掉落集方块
    const [x,y,z] = k.split(',').map(Number);
    const dx = x-cx, dy = y-cy, dz = z-cz;
    if(dx*dx + dy*dy + dz*dz <= r2) falling.delete(k);
  }
  const minCX = Math.floor((cx-R)/CHUNK), maxCX = Math.floor((cx+R)/CHUNK);
  const minCZ = Math.floor((cz-R)/CHUNK), maxCZ = Math.floor((cz+R)/CHUNK);
  for(let cxi=minCX; cxi<=maxCX; cxi++) for(let czi=minCZ; czi<=maxCZ; czi++) rebuildChunk(cxi, czi);
  flash('已爆破 ('+cx+','+cy+','+cz+') 半径 '+R);
}
// 洪泛填充：在命中方块处填充其相连的同色区域为当前选中笔刷类型(可能跨多区块)
function fillAt(clientX, clientY){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const meshes = [...chunks.values()].map(c => c.mesh.solid);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if(!hit) return;
  const m = hit.object, id = hit.instanceId;
  m.getMatrixAt(id, dummy.matrix); dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
  const x = Math.round(dummy.position.x), y = Math.round(dummy.position.y), z = Math.round(dummy.position.z);
  if(edits.get(key(x, y, z)) == null) return;   // 点空气/流体不填充
  edits = floodFill(edits, x, y, z, brush, key, PALETTE);
  for(const c of chunks.keys()){ const [cx, cz] = c.split(',').map(Number); rebuildChunk(cx, cz); }  // 跨区块重建
  let n = 0; for(const v of edits.values()) if(v !== null && v !== undefined) n++;
  flash('已填充相连区域 (当前 ' + n + ' 块)');
}
// 区域填充：第一角点选锚点，第二角点按当前笔刷类型填充整个长方体（点击命中空白则忽略）
function fillBoxAt(clientX, clientY){
  const p = pickCoord(clientX, clientY);
  if(!p) return;
  if(!fillAnchor){
    fillAnchor = { x: p.x, y: p.y, z: p.z };
    flash('填充：已选第一角 ('+p.x+','+p.y+','+p.z+')，点第二角完成');
    return;
  }
  edits = fillBox(edits, fillAnchor.x, fillAnchor.y, fillAnchor.z, p.x, p.y, p.z, brush, PALETTE);
  rebuildAll();
  flash('已填充区域 ('+brush+')，点一下重新选第一角');
  fillAnchor = null;
}
// 线段笔刷：第一角点选起点，第二角点按当前笔刷类型沿 3D 体素线连线（点命中空白则忽略）
function lineFillAt(clientX, clientY){
  const p = pickCoord(clientX, clientY);
  if(!p) return;
  if(!lineAnchor){
    lineAnchor = { x: p.x, y: p.y, z: p.z };
    flash('连线：已选起点 ('+p.x+','+p.y+','+p.z+')，点终点完成');
    return;
  }
  edits = lineFill(edits, lineAnchor.x, lineAnchor.y, lineAnchor.z, p.x, p.y, p.z, brush, PALETTE);
  rebuildAll();
  flash('已连线 ('+brush+')，点一下重新选起点');
  lineAnchor = null;
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
let clipboard = null;           // 复制选区（Map<"x,y,z", color>）
let fillAnchor = null;          // 区域填充第一角 {x,y,z}
let lineAnchor = null;          // 线段笔刷起点 {x,y,z}
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
    falling.delete(key(selected.x, selected.y, selected.z));           // 源块(已置空)退出掉落集
    if([...FALL].some(b => PALETTE[b] === selectedColor)) falling.add(key(d.x, d.y, d.z)); // 移动的是沙/砾石则继续受重力
    rebuildChunk(Math.floor(d.x/CHUNK), Math.floor(d.z/CHUNK));
    rebuildChunk(Math.floor(selected.x/CHUNK), Math.floor(selected.z/CHUNK));
    selected = null; selBox.visible = false;
    flash('已移动到 ('+d.x+','+d.y+','+d.z+')');
  }
}
renderer.domElement.addEventListener('pointerdown', e=>{
  const prev = snapshotEdits();   // 编辑前快照，供撤销
  if(e.button === 2) { editAt(e.clientX, e.clientY, true); }
  else if(mode === 'add') editAt(e.clientX, e.clientY, false);
  else if(mode === 'del') editAt(e.clientX, e.clientY, true);
  else if(mode === 'move') movePick(e.clientX, e.clientY);
  else if(mode === 'boom') boomAt(e.clientX, e.clientY);
  else if(mode === 'fill') fillAt(e.clientX, e.clientY);
  else if(mode === 'fillbox') fillBoxAt(e.clientX, e.clientY);
  else if(mode === 'line') lineFillAt(e.clientX, e.clientY);
  recordUndo(prev);
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
$('moveBtn').onclick = ()=>{ mode='move'; $('moveBtn').classList.add('on'); $('addBtn').classList.remove('on'); $('delBtn').classList.remove('on'); $('boomBtn').classList.remove('on'); $('mode').textContent='模式: 拾取并移动(先选后放)'; };
$('boomBtn').onclick = ()=>{ mode='boom'; $('boomBtn').classList.add('on'); $('addBtn').classList.remove('on'); $('delBtn').classList.remove('on'); $('moveBtn').classList.remove('on'); $('fillBtn').classList.remove('on'); $('mode').textContent='模式: 爆破挖掘(球形空腔, 半径可调)'; };
$('fillBtn').onclick = ()=>{ mode='fill'; $('fillBtn').classList.add('on'); $('addBtn').classList.remove('on'); $('delBtn').classList.remove('on'); $('moveBtn').classList.remove('on'); $('boomBtn').classList.remove('on'); $('fillBoxBtn').classList.remove('on'); $('mode').textContent='模式: 填充(洪泛相连同色区域)'; };
$('fillBoxBtn').onclick = ()=>{ mode='fillbox'; $('fillBoxBtn').classList.add('on'); $('addBtn').classList.remove('on'); $('delBtn').classList.remove('on'); $('moveBtn').classList.remove('on'); $('boomBtn').classList.remove('on'); $('fillBtn').classList.remove('on'); $('lineBtn').classList.remove('on'); $('mode').textContent='模式: 区域填充(点两对角, 填满长方体)'; fillAnchor=null; };
$('lineBtn').onclick = ()=>{ mode='line'; $('lineBtn').classList.add('on'); $('addBtn').classList.remove('on'); $('delBtn').classList.remove('on'); $('moveBtn').classList.remove('on'); $('boomBtn').classList.remove('on'); $('fillBtn').classList.remove('on'); $('fillBoxBtn').classList.remove('on'); $('mode').textContent='模式: 连线(点起点与终点, 3D 体素直线)'; lineAnchor=null; };
$('brush').onchange = e=> brush = e.target.value;
$('brushSize').onchange = e=>{ brushSize = +e.target.value; $('bsVal').textContent = brushSize; };
$('mirrorOn').onchange = e=>{ mirrorOn = e.target.checked; flash(mirrorOn ? '镜像笔刷：开' : '镜像笔刷：关'); };
$('mirrorAxis').onchange = e=>{ mirrorAxis = e.target.value; };
$('mirrorCenter').oninput = e=>{ mirrorCenter = +e.target.value || 0; };
$('brushShape').onchange = e=>{ brushShape = e.target.value; flash(brushShape === 'sphere' ? '笔刷形状：球形' : '笔刷形状：立方体'); };
$('boomR').onchange = e=>{ boomR = +e.target.value; $('boomRVal').textContent = boomR; };
// 批量换方块：替换所有指定类型后，重建所有已加载区块以反映新色
$('replaceBtn').onclick = ()=>{
  const from = $('fromType').value, to = $('toType').value;
  if(from === to) return;   // 同类型无需操作
  const prev = snapshotEdits();
  edits = replaceType(edits, from, to, PALETTE);
  recordUndo(prev);
  for(const [k] of chunks){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); }
};
// 矿脉富集：把与矿物正交相邻的石头变为矿物，重建所有已加载区块
$('enrichBtn').onclick = ()=>{
  const ore = $('enrichType').value;
  if(ore === 'stone') return;   // 选石无意义
  const prev = snapshotEdits();
  edits = enrichOre(edits, ore, key, PALETTE);
  recordUndo(prev);
  for(const [k] of chunks){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); }
};
// 撤销/重做：按钮 + 快捷键 Ctrl/Cmd+Z（撤销）、Ctrl/Cmd+Y 或 Ctrl/Cmd+Shift+Z（重做）
$('undoBtn').onclick = ()=>{ if(undoEdit()) flash('已撤销'); else flash('无可撤销'); };
$('redoBtn').onclick = ()=>{ if(redoEdit()) flash('已重做'); else flash('无可重做'); };
window.addEventListener('keydown', e=>{
  const k = e.key.toLowerCase();
  if((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey){ e.preventDefault(); if(undoEdit()) flash('已撤销'); else flash('无可撤销'); }
  else if((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))){ e.preventDefault(); if(redoEdit()) flash('已重做'); else flash('无可重做'); }
});
$('amp').oninput = e=>{ amp=+e.target.value; SNOW_LINE = Math.floor(amp*0.7)+4; $('ampVal').textContent=amp;
  for(const [k] of chunks){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); } };
$('regen').onclick = ()=>{ edits.clear(); falling.clear(); lavaCol.clear(); for(const [k] of chunks){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); } };
$('exportObj').onclick = ()=>{ const obj = exportOBJ(edits, key, PALETTE); downloadBlob('voxel-world.obj', new Blob([obj], { type: 'text/plain' })); flash('已导出 OBJ（'+edits.size+' 个方块）'); };
$('copyBtn').onclick = ()=>{ if(!selected){ flash('先选中一个方块再复制'); return; } clipboard = copySelection(edits, selected.x, selected.y, selected.z, selected.x, selected.y, selected.z); flash('已复制 ' + clipboard.size + ' 个方块'); };
$('pasteBtn').onclick = ()=>{ if(!clipboard || clipboard.size === 0){ flash('剪贴板为空'); return; } const prev = snapshotEdits(); edits = pasteSelection(edits, clipboard, 1, 1, 1); rebuildAll(); recordUndo(prev); flash('已粘贴（偏移 +1,+1,+1）'); };
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
$('fall').onchange = e=>{ fallOn = e.target.checked; };
$('lava').onchange = e=>{ lavaOn = e.target.checked; };
// ---------- 世界存档（localStorage：地形种子 + 洞穴开关 + 编辑）----------
function flash(msg){ const m = $('mode'); const old = m.textContent; m.textContent = msg; setTimeout(()=>{ m.textContent = walkMode ? '模式: 行走(重力)' : '模式: 添加'; }, 1500); }
$('saveW').onclick = ()=>{
  try{
    const data = Object.assign(serializeWorld(edits, waterCol, lavaCol), { amp, cavesOn });
    localStorage.setItem('voxelforge_world', JSON.stringify(data));
    flash('已保存世界 ✓');
  }catch(e){ flash('保存失败'); }
};
$('loadW').onclick = ()=>{
  try{
    const s = localStorage.getItem('voxelforge_world'); if(!s){ flash('无存档'); return; }
    const d = JSON.parse(s);
    const w = deserializeWorld(d);
    amp = (typeof d.amp === 'number') ? d.amp : amp;
    cavesOn = (typeof d.cavesOn === 'boolean') ? d.cavesOn : cavesOn;
    edits = w.edits; waterCol = w.waterCol; lavaCol = w.lavaCol;
    falling.clear();          // 加载后掉落集重置（不持久化瞬态物理）
    SNOW_LINE = Math.floor(amp * 0.7) + 4;
    $('amp').value = amp; $('ampVal').textContent = amp;
    $('caves').checked = cavesOn;
    for(const [k] of chunks){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); }
    flash('已读取世界 ✓');
  }catch(e){ flash('读取失败'); }
};
// 文件级导入/导出（便于分享与备份）
function downloadBlob(name, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('exportW').onclick = ()=>{
  const data = Object.assign(serializeWorld(edits, waterCol, lavaCol), { amp, cavesOn });
  downloadBlob('voxel-world.json', new Blob([JSON.stringify(data)], { type: 'application/json' }));
  flash('已导出 voxel-world.json ✓');
};
$('importW').onclick = ()=> $('worldFile').click();
function updateStats(){
  const out = document.getElementById('statsOut'); if(!out) return;
  const s = blockStats(edits, PALETTE, waterCol, lavaCol);
  const order = ['grass','dirt','stone','sand','gravel','wood','leaf','snow','iron','gold','diamond','coal','water','lava'];
  let html = '实心 <b>' + s.total + '</b> · 挖空 ' + s.removed + '<br>';
  for(const t of order){
    const n = s.counts[t] || 0;
    if(n > 0){ const hex = (PALETTE[t]||0).toString(16).padStart(6,'0'); html += '<span style="color:#'+hex+'">■</span> '+t+': '+n+'　'; }
  }
  out.innerHTML = html;
}
if($('statsBtn')) $('statsBtn').onclick = updateStats;
setInterval(updateStats, 1000);
$('worldFile').onchange = e=>{
  const f = e.target.files && e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const d = JSON.parse(r.result);
      const w = deserializeWorld(d);
      amp = (typeof d.amp === 'number') ? d.amp : amp;
      cavesOn = (typeof d.cavesOn === 'boolean') ? d.cavesOn : cavesOn;
      edits = w.edits; waterCol = w.waterCol; lavaCol = w.lavaCol;
      falling.clear();
      SNOW_LINE = Math.floor(amp * 0.7) + 4;
      $('amp').value = amp; $('ampVal').textContent = amp;
      $('caves').checked = cavesOn;
      for(const [k] of chunks){ const [cx,cz]=k.split(',').map(Number); rebuildChunk(cx,cz); }
      flash('已导入世界 ✓');
    }catch(err){ flash('导入失败'); }
  };
  r.readAsText(f); e.target.value = '';
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
// 掉落方块模拟：悬空的沙/砾石每隔一段时间下落一格（若下方被占则停）
function simulateFalling(){
  if(!fallOn || falling.size === 0) return;
  const touched = stepFalling(falling, edits, (x,y,z)=> voxelColor(x,y,z) !== null, key,
                               (x,z)=> Math.floor(x/CHUNK) + ',' + Math.floor(z/CHUNK));
  for(const ck of touched){ if(chunks.has(ck)){ const [cx,cz] = ck.split(',').map(Number); rebuildChunk(cx, cz); } }
}
let fallOn = true;          // 掉落物理总开关
setInterval(simulateWater, 700);     // 水体流动模拟（每 0.7s 步进一次）
setInterval(simulateFalling, 350);   // 掉落方块模拟（每 0.35s 步进一次，手感更顺滑）
setInterval(simulateLava, 700);      // 岩浆流动模拟（每 0.7s 步进一次：黏滞流动 + 冷却成石 + 点燃）
document.getElementById('mode').textContent='模式: 添加';
tick();
