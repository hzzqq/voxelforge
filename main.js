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
  water: 0x3a7bd5, lava: 0xe05626, wood: 0x9c6b3f, leaf: 0x3f8f3f, snow: 0xeaf2f7, glowstone: 0xfff2a8
};
const FALL = new Set(['sand','gravel']);   // 参与重力掉落的方块笔刷（沙/砾石）
const GLOW = new Set(['glowstone']);       // 自发光方块（独立 InstancedMesh + emissive 材质渲染）
function isGlowBlock(name){ return GLOW.has(name); }
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

// 确定性伪随机：由世界坐标映射到 [0,1)，用于随机散布笔刷(无需外部 RNG 即可复现)
function hash01(x, y, z){
  let h = (Math.imul(x|0, 374761393) ^ Math.imul(y|0, 668265263) ^ Math.imul(z|0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}

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
const glowMat = new THREE.MeshLambertMaterial({ color: PALETTE.glowstone, emissive: PALETTE.glowstone, emissiveIntensity: 0.85 });
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
  const glow = new THREE.InstancedMesh(geo, glowMat, PER_CHUNK);
  glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let si = 0, wi = 0, li = 0, gi = 0;
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
      if(c === PALETTE.glowstone){                       // 自发光方块单独走 glow 网格
        if(gi < PER_CHUNK){ dummy.position.set(x, y, z); dummy.updateMatrix(); glow.setMatrixAt(gi, dummy.matrix); gi++; }
        continue;
      }
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
  glow.count = gi;
  glow.instanceMatrix.needsUpdate = true;
  glow.frustumCulled = true;
  scene.add(solid);
  scene.add(water);
  scene.add(lava);
  scene.add(glow);
  return { solid, water, lava, glow, count: si + wi + li + gi };
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
  scene.remove(c.mesh.glow); c.mesh.glow.dispose();
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
let mode = 'add', brush = 'grass', brushSize = 1, boomR = 3, brushShape = 'box', scatterDensity = 0.35;
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
// 共享体素写入/擦除原语：统一处理流体列(顶面对齐 y+1)、掉落集与挖空，消除各笔刷重复的脆弱样板(fragile boilerplate)。
// 既往 70+ 笔刷把这段逻辑手抄多遍，易在多笔刷间出现流体/掉落不一致；新增笔刷统一调用这两个原语。
function writeVoxel(edits, waterCol, lavaCol, falling, x, y, z, brush, FALLv, key, wkey, PALETTEv){
  const k = key(x,y,z), wk = wkey(x,z);
  if(brush === 'lava'){ lavaCol.set(wk, y+1); return; }
  if(brush === 'water'){ waterCol.set(wk, y+1); return; }
  edits.set(k, PALETTEv[brush]);
  if(FALLv.has(brush)) falling.add(k);
}
function clearVoxel(edits, waterCol, lavaCol, falling, x, y, z, key, wkey){
  const k = key(x,y,z), wk = wkey(x,z);
  if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
  if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
  edits.set(k, null);
  falling.delete(k);
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
// 纯函数：墙壁笔刷——以命中方块 (nx,ny,nz) 为墙心，在 XY 平面填充 (2r+1)×(2r+1) 的竖直薄板(沿 Z 仅 z=nz 一层，厚 1)，
// 与立方体(实心立方体)区分：墙体是单层的「墙/地板」，而非立体块。流体/掉落语义与 applyBrush 一致。
function applyWallBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  for(let dx=-r; dx<=r; dx++) for(let dy=-r; dy<=r; dy++){
    const x = nx+dx, y = ny+dy, z = nz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：墙壁擦除——与 applyWallBrush 同几何(竖直薄板)，仅置空/退掉落集。
function eraseWallBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let dx=-r; dx<=r; dx++) for(let dy=-r; dy<=r; dy++){
    const x = nx+dx, y = ny+dy, z = nz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(k, null);
    falling.delete(k);
  }
}
// 纯函数：菱形(八面体)笔刷——以命中方块外侧 (nx,ny,nz) 为中心，曼哈顿距离 |dx|+|dy|+|dz| <= radius 的体素置为笔刷色。
// 与球形(欧氏距离)互补：菱形是「尖角八面体」，适合宝石/水晶/装饰尖顶；z 轴同样参与判定(非薄板)。流体/掉落语义与 applyBrush 一致。
function applyDiamondBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const top = ny + 2*r - 1;
  for(let dx=-r; dx<=r; dx++) for(let dy=-r; dy<=r; dy++) for(let dz=-r; dz<=r; dz++){
    if(Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > r) continue;   // 八面体外剔除
    const x = nx+dx, y = ny+dy, z = nz+dz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, top); continue; }
    if(brush === 'water'){ waterCol.set(wk, top); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：菱形(八面体)擦除——与 applyDiamondBrush 同几何，仅置空/退掉落集。
function eraseDiamondBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const top = ny + 2*r - 1;
  for(let dx=-r; dx<=r; dx++) for(let dy=-r; dy<=r; dy++) for(let dz=-r; dz<=r; dz++){
    if(Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > r) continue;
    const x = nx+dx, y = ny+dy, z = nz+dz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === top) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === top) lavaCol.delete(wk);
    edits.set(k, null);
    falling.delete(k);
  }
}
// 纯函数：立柱(柱形)笔刷——在 (nx,nz) 处生成 1×1 垂直立柱，从 ny 起向上填充 height 格(=brushSize)。
// 与圆柱(3×3 圆盘堆叠)区分：立柱是单格宽度的「柱子/塔」，height 由 brushSize 提供。流体/掉落语义与 applyBrush 一致。
function applyColumnBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, height, FALL, key, wkey, PALETTE){
  const h = Math.max(1, height|0);
  for(let dy=0; dy<h; dy++){
    const x = nx, y = ny+dy, z = nz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：立柱擦除——与 applyColumnBrush 同几何(单格宽竖直柱)，仅置空/退掉落集。
function eraseColumnBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, height, key, wkey){
  const h = Math.max(1, height|0);
  for(let dy=0; dy<h; dy++){
    const x = nx, y = ny+dy, z = nz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(k, null);
    falling.delete(k);
  }
}
// 纯函数：圆锥笔刷——以命中方块外侧 (nx,ny,nz) 为锥底中心，底面半径 radius，向上逐层收尖(锥顶一点在 y=ny+radius)。
// 每层水平圆盘半径 = radius - 层高k(底 0 → 顶 radius)，即 dx²+dz² <= (radius-k)²。与圆柱(等径)区分：圆锥是收尖的。
function applyConeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  for(let k=0; k<=r; k++){
    const rh = r - k;                                  // 该层水平半径(自底向顶递减)
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(dx*dx + dz*dz > rh*rh) continue;
      const x = nx+dx, y = ny+k, z = nz+dz;
      const kk = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(kk, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(kk);
    }
  }
}
// 纯函数：圆锥擦除——与 applyConeBrush 同几何(收尖圆锥)，仅置空/退掉落集。
function eraseConeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let k=0; k<=r; k++){
    const rh = r - k;
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(dx*dx + dz*dz > rh*rh) continue;
      const x = nx+dx, y = ny+k, z = nz+dz;
      const kk = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}
// 纯函数：阶梯笔刷——从命中点 (nx,ny,nz) 沿 +x 与 +y 同步上升，每个台阶 k 在 x=nx+k 处立一根
// 从 ny 到 ny+k 的实心柱，整体形成可攀登的楼梯。半径 radius 控制台阶数(0..radius 共 radius+1 级)。
function applyStairsBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  for(let k=0; k<=r; k++){
    const x = nx + k;
    const z = nz;
    for(let y=ny; y<=ny+k; y++){
      const kk = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(kk, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(kk);
    }
  }
}
// 纯函数：阶梯擦除——与 applyStairsBrush 同几何，仅置空/退掉落集。
function eraseStairsBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let k=0; k<=r; k++){
    const x = nx + k;
    const z = nz;
    for(let y=ny; y<=ny+k; y++){
      const kk = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}
// 纯函数：半球(穹顶)笔刷——以命中 (nx,ny,nz) 为底面中心，XZ 半径 radius 圆盘内按
// h = round(sqrt(r²-dx²-dz²)) 形成穹顶高度剖面，从 ny 向上实心填充，构成可栖居的圆顶。
function applyDomeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    const d2 = dx*dx + dz*dz;
    if(d2 > r*r) continue;                       // 圆盘外剔除
    const h = Math.round(Math.sqrt(r*r - d2));   // 0..r 的圆顶高度
    for(let y=ny; y<=ny+h; y++){
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：半球(穹顶)擦除——与 applyDomeBrush 同几何，仅置空/退掉落集。
function eraseDomeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    const d2 = dx*dx + dz*dz;
    if(d2 > r*r) continue;
    const h = Math.round(Math.sqrt(r*r - d2));
    for(let y=ny; y<=ny+h; y++){
      const x = nx+dx, z = nz+dz;
      const kk = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}
// 纯函数：三棱柱(prism)笔刷——以命中 (nx,ny,nz) 为底面中心，XZ 平面取以 r 为外接半径的等边三角形截面，
// 沿 y 向上填充 height(默认 r) 格，形成三角塔。判定用同号法(三边的叉积符号一致即在三角形内)。
function applyPrismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const ax = 0, az = r;                                   // 顶点(朝上)
  const bx = -r * Math.sqrt(3) / 2, bz = -r / 2;           // 左下
  const cx = r * Math.sqrt(3) / 2, cz = -r / 2;            // 右下
  const sign = (px, pz, qx, qz, rx, rz)=> (px - rx) * (qz - rz) - (qx - rx) * (pz - rz);
  const h = r;
  for(let dy = 0; dy < h; dy++){
    const y = ny + dy;
    for(let dx = -r; dx <= r; dx++) for(let dz = -r; dz <= r; dz++){
      const d1 = sign(dx, dz, ax, az, bx, bz), d2 = sign(dx, dz, bx, bz, cx, cz), d3 = sign(dx, dz, cx, cz, ax, az);
      if((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;  // 三角形外
      const x = nx + dx, z = nz + dz;
      const k = key(x, y, z), wk = wkey(x, z);
      if(brush === 'lava'){ lavaCol.set(wk, y + 1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y + 1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：三棱柱擦除——与 applyPrismBrush 同几何，仅置空/退掉落集。
function erasePrismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const ax = 0, az = r, bx = -r * Math.sqrt(3) / 2, bz = -r / 2, cx = r * Math.sqrt(3) / 2, cz = -r / 2;
  const sign = (px, pz, qx, qz, rx, rz)=> (px - rx) * (qz - rz) - (qx - rx) * (pz - rz);
  const h = r;
  for(let dy = 0; dy < h; dy++){
    const y = ny + dy;
    for(let dx = -r; dx <= r; dx++) for(let dz = -r; dz <= r; dz++){
      const d1 = sign(dx, dz, ax, az, bx, bz), d2 = sign(dx, dz, bx, bz, cx, cz), d3 = sign(dx, dz, cx, cz, ax, az);
      if((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)) continue;
      const x = nx + dx, z = nz + dz;
      const kk = key(x, y, z), wk = wkey(x, z);
      if(waterCol.has(wk) && waterCol.get(wk) === y + 1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y + 1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}
// 纯函数：空心圆柱(tube/管道)笔刷——以命中 (nx,ny,nz) 为底面中心，XZ 圆盘半径 radius，仅填充
// 距中心 (r-wt, r] 的环形外壳(壁厚 wt ≈ 0.35r)，沿 y 向上填充 height(默认 r) 格，形成可穿行的管道。
function applyTubeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const wt = Math.max(1, Math.round(r * 0.35));        // 壁厚
  const rin = r - wt;
  const h = r;
  for(let dy = 0; dy < h; dy++){
    const y = ny + dy;
    for(let dx = -r; dx <= r; dx++) for(let dz = -r; dz <= r; dz++){
      const d2 = dx*dx + dz*dz;
      if(d2 > r*r || d2 < rin*rin) continue;           // 仅保留环形外壳
      const x = nx + dx, z = nz + dz;
      const k = key(x, y, z), wk = wkey(x, z);
      if(brush === 'lava'){ lavaCol.set(wk, y + 1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y + 1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：空心圆柱擦除——与 applyTubeBrush 同几何，仅置空/退掉落集。
function eraseTubeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const wt = Math.max(1, Math.round(r * 0.35));
  const rin = r - wt;
  const h = r;
  for(let dy = 0; dy < h; dy++){
    const y = ny + dy;
    for(let dx = -r; dx <= r; dx++) for(let dz = -r; dz <= r; dz++){
      const d2 = dx*dx + dz*dz;
      if(d2 > r*r || d2 < rin*rin) continue;
      const x = nx + dx, z = nz + dz;
      const kk = key(x, y, z), wk = wkey(x, z);
      if(waterCol.has(wk) && waterCol.get(wk) === y + 1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y + 1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}
// 纯函数：楔形(wedge)笔刷——以命中 (nx,ny,nz) 为底面角点，XZ 平面取 dx∈[0,r]、dz∈[0,r] 内满足
// dx+dz<=r 的直角三角形截面(坡面沿 +x/+z 抬升)，沿 y 向上填充 height(默认 r) 格，形成可踩踏的坡道。
function applyWedgeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const h = r;
  for(let dy = 0; dy < h; dy++){
    const y = ny + dy;
    for(let dx = 0; dx <= r; dx++) for(let dz = 0; dz <= r; dz++){
      if(dx + dz > r) continue;                       // 直角三角形截面
      const x = nx + dx, z = nz + dz;
      const k = key(x, y, z), wk = wkey(x, z);
      if(brush === 'lava'){ lavaCol.set(wk, y + 1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y + 1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：楔形擦除——与 applyWedgeBrush 同几何，仅置空/退掉落集。
function eraseWedgeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const h = r;
  for(let dy = 0; dy < h; dy++){
    const y = ny + dy;
    for(let dx = 0; dx <= r; dx++) for(let dz = 0; dz <= r; dz++){
      if(dx + dz > r) continue;
      const x = nx + dx, z = nz + dz;
      const kk = key(x, y, z), wk = wkey(x, z);
      if(waterCol.has(wk) && waterCol.get(wk) === y + 1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y + 1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}
// 纯函数：回字(空心方框)笔刷——以命中 (nx,ny,nz) 为底面中心，XZ 平面半径 radius 的方形外框(仅 |dx|==r 或 |dz|==r 的边框格)，
// 仅填充打击面这一层(y=ny)，构成可平铺的方形环。流体/掉落语义与 applyBrush 一致。
function applyFrameBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    if(Math.abs(dx) !== r && Math.abs(dz) !== r) continue;   // 仅保留外框
    const x = nx+dx, z = nz+dz, y = ny;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：回字(空心方框)擦除——与 applyFrameBrush 同几何，仅置空/退掉落集。
function eraseFrameBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    if(Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
    const x = nx+dx, z = nz+dz, y = ny;
    const kk = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(kk, null);
    falling.delete(kk);
  }
}
// 纯函数：十字(cross)笔刷——以命中 (nx,ny,nz) 为底面中心，XZ 平面半径 radius 的十字形(中心行与中心列各延伸 r、单格宽)，沿 y 向上填充 r 格。流体/掉落语义与 applyBrush 一致。
function applyCrossBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  for(let dy=0; dy<r; dy++){
    const y = ny+dy;
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(dx !== 0 && dz !== 0) continue;            // 仅保留中心行与中心列
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：十字(cross)擦除——与 applyCrossBrush 同几何，仅置空/退掉落集。
function eraseCrossBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let dy=0; dy<r; dy++){
    const y = ny+dy;
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(dx !== 0 && dz !== 0) continue;
      const x = nx+dx, z = nz+dz;
      const kk = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}
// 纯函数：3D 加号(plus)笔刷——以命中 (nx,ny,nz) 为中心，沿 X/Y/Z 三条正交轴各延伸 radius 一格厚，构成立体十字。流体/掉落语义一致。
function applyPlusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const cells = [];
  for(let d=-r; d<=r; d++){ cells.push([nx+d, ny, nz]); cells.push([nx, ny+d, nz]); cells.push([nx, ny, nz+d]); }
  for(const [x,y,z] of cells){
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：3D 加号(plus)擦除——与 applyPlusBrush 同几何，仅置空/退掉落集。
function erasePlusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const cells = [];
  for(let d=-r; d<=r; d++){ cells.push([nx+d, ny, nz]); cells.push([nx, ny+d, nz]); cells.push([nx, ny, nz+d]); }
  for(const [x,y,z] of cells){
    const kk = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(kk, null);
    falling.delete(kk);
  }
}
// 纯函数：棋盘(checker)笔刷——以命中 (nx,ny,nz) 为底面中心，XZ 半径 radius 的方块内按 (dx+dz) 偶校验填充棋盘格，沿 y 填 r 格；格数 = r × ((2r+1)²+1)/2。
function applyCheckerBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  for(let dy=0; dy<r; dy++){
    const y = ny+dy;
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(((dx + dz) & 1) !== 0) continue;            // 棋盘：仅取偶校验格
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：棋盘(checker)擦除——与 applyCheckerBrush 同几何，仅置空/退掉落集。
function eraseCheckerBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let dy=0; dy<r; dy++){
    const y = ny+dy;
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(((dx + dz) & 1) !== 0) continue;
      const x = nx+dx, z = nz+dz;
      const kk = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}
// 纯函数：晶格(lattice)笔刷——以命中 (nx,ny,nz) 为中心，XYZ 三轴各以步长 2 取 [-r,r] 内
// 偶数偏移位置，形成间隔一格空隙的 3D 立方体网格；格数 = (1+2⌊r/2⌋)³。流体/掉落语义一致。
function applyLatticeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const f = Math.floor(r/2);
  for(let dy=-2*f; dy<=2*f; dy+=2){
    const y = ny+dy;
    for(let dx=-2*f; dx<=2*f; dx+=2) for(let dz=-2*f; dz<=2*f; dz+=2){
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：晶格(lattice)擦除——与 applyLatticeBrush 同几何，仅置空/退掉落集。
function eraseLatticeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const f = Math.floor(r/2);
  for(let dy=-2*f; dy<=2*f; dy+=2){
    const y = ny+dy;
    for(let dx=-2*f; dx<=2*f; dx+=2) for(let dz=-2*f; dz<=2*f; dz+=2){
      const x = nx+dx, z = nz+dz;
      const kk = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}
// 纯函数：整平(flatten)笔刷——以命中 (nx,ny,nz) 为基准高度，在 [-r,r]² 方形底面上
// 把每个 (x,z) 列的该高度格置为所选方块，形成一层水平平台；格数 = (2r+1)²。
function applyFlattenBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    const x = nx+dx, z = nz+dz, y = ny;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：整平(flatten)擦除——与 applyFlattenBrush 同几何，仅置空/退掉落集。
function eraseFlattenBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    const x = nx+dx, z = nz+dz, y = ny;
    const kk = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(kk, null);
    falling.delete(kk);
  }
}
// 纯函数：波形(wave)笔刷——以命中 (nx,ny,nz) 为基准，在 [-r,r]² 方形底面上
// 按 (dx+dz) 正弦起伏决定每根列的高度：y = ny + round(amp·sin((dx+dz)·0.6))，
// 形成一层波浪状平台；每根列恰好 1 格，总格数 = (2r+1)²。
function applyWaveBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const amp = Math.max(1, Math.round(r/2));
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    const x = nx+dx, z = nz+dz;
    const y = ny + Math.round(amp * Math.sin((dx+dz) * 0.6));
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：波形(wave)擦除——与 applyWaveBrush 同几何，仅置空/退掉落集。
function eraseWaveBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const amp = Math.max(1, Math.round(r/2));
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    const x = nx+dx, z = nz+dz;
    const y = ny + Math.round(amp * Math.sin((dx+dz) * 0.6));
    const kk = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(kk, null);
    falling.delete(kk);
  }
}
// 纯函数：螺旋(helix)笔刷——以命中方块为基准，沿 (2r+1) 步螺旋上升：
// 角度按 turns 圈递增、XZ 平面半径 r、y 从 ny-r 升至 ny+r，形成 3D 螺旋楼梯。
function applyHelixBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const N = 2*r + 1;
  const turns = Math.max(1, Math.round(r/2));
  const height = 2*r + 1;
  for(let i=0; i<N; i++){
    const ang = (i / N) * turns * 2 * Math.PI;
    const x = nx + Math.round(r * Math.cos(ang));
    const z = nz + Math.round(r * Math.sin(ang));
    const y = ny + Math.floor((i / N) * height) - r;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：螺旋(helix)擦除——与 applyHelixBrush 同几何，仅置空/退掉落集。
function eraseHelixBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const N = 2*r + 1;
  const turns = Math.max(1, Math.round(r/2));
  const height = 2*r + 1;
  for(let i=0; i<N; i++){
    const ang = (i / N) * turns * 2 * Math.PI;
    const x = nx + Math.round(r * Math.cos(ang));
    const z = nz + Math.round(r * Math.sin(ang));
    const y = ny + Math.floor((i / N) * height) - r;
    const kk = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(kk, null);
    falling.delete(kk);
  }
}
// 纯函数：圆柱形笔刷——以命中方块外侧 (nx,ny,nz) 为底面中心，XZ 平面半径 radius（整数圆盘，
// 判定 dx²+dz² <= r²，与球形笔刷同几何），沿 y 从 ny 起填充 height 格。流体/掉落语义与 applyBrush 一致。
// ci374 纯函数：圆柱形笔刷——以 (nx,ny,nz) 为中心、XZ 圆盘半径 radius、竖直高 height。
// cylinderPoints(R) 生成底面圆盘点表(历史循环边界 dx,dz∈[-(R-1),R-1]，保持既有行为)；
// cylinderInside(dx,dz,dy,R,H) 为单一真相源(点是否落在笔刷内)。apply/erase 共用，消除几何重复。
function cylinderPoints(R){
  R = Math.max(1, R|0);
  const pts = [], seen = new Set();
  const add = (dx,dz)=>{ const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx,dz]); } };
  for(let dx=-(R-1); dx<=R-1; dx++) for(let dz=-(R-1); dz<=R-1; dz++){
    if(dx*dx + dz*dz <= R*R) add(dx, dz);
  }
  return pts;
}
function cylinderInside(dx, dz, dy, R, H){
  R = Math.max(1, R|0); H = Math.max(1, H|0);
  if(dy < 0 || dy >= H) return false;
  if(Math.abs(dx) > R-1 || Math.abs(dz) > R-1) return false;   // 与既有循环边界一致
  return dx*dx + dz*dz <= R*R;
}
function applyCylinderBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0);
  const H = (height == null) ? R : Math.max(1, height|0);
  const pts = cylinderPoints(R);                       // XZ 足迹；每格形状由 cylinderInside 单一真相源门控
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts){
      if(!cylinderInside(dx, dz, dy, R, H)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALL, key, wkey, PALETTE);
    }
  }
}
// 纯函数：圆柱形擦除——与 applyCylinderBrush 同几何(cylinderPoints 足迹 + cylinderInside 单一真相源)，仅置空/退掉落集。
function eraseCylinderBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = (height == null) ? R : Math.max(1, height|0);
  const pts = cylinderPoints(R);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts){
      if(!cylinderInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// 纯函数：正六边形判定——以 circumradius 思路：夹在三条法线带内（法线 0°/60°/120°），apothem = R。
// 返回 (dx,dz) 是否落在点尖朝上(顶点沿 ±z)的正六边形内。
function hexInside(dx, dz, R){
  const a = R;
  const n1 = Math.abs(dx);
  const n2 = Math.abs(0.5 * dx + Math.sqrt(3)/2 * dz);
  const n3 = Math.abs(-0.5 * dx + Math.sqrt(3)/2 * dz);
  return Math.max(n1, n2, n3) <= a + 1e-9;
}
// 纯函数：六棱柱(hexPrism)笔刷——以命中方块 (nx,ny,nz) 为底面中心，XZ 正六边形截面(半径 radius)、竖直高 height。
function applyHexPrismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0);
  const h = (height == null) ? R : Math.max(1, height|0);
  for(let dy=0; dy<h; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(!hexInside(dx, dz, R)) continue;            // 六边形外剔除
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：六棱柱擦除——与 applyHexPrismBrush 同几何，仅置空/退掉落集。
function eraseHexPrismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const h = (height == null) ? R : Math.max(1, height|0);
  for(let dy=0; dy<h; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(!hexInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null);
      falling.delete(k);
    }
  }
}
// 纯函数：球壳(shell)笔刷——以命中方块为球心，半径 radius 的实心球掏去内层 innerR=radius - max(1,round(radius/3))，剩余为薄壁球壳。
function applyShellBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0);
  const innerR = Math.max(1, R - Math.max(1, Math.round(R/3)));
  for(let dy=-R+1; dy<R; dy++) for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
    const d2 = dx*dx + dy*dy + dz*dz;
    if(d2 > R*R || d2 <= innerR*innerR) continue;        // 仅保留球壳(外球内、内球外)
    const x = nx+dx, y = ny+dy, z = nz+dz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：球壳擦除——与 applyShellBrush 同几何，仅置空/退掉落集。
function eraseShellBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const innerR = Math.max(1, R - Math.max(1, Math.round(R/3)));
  for(let dy=-R+1; dy<R; dy++) for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
    const d2 = dx*dx + dy*dy + dz*dz;
    if(d2 > R*R || d2 <= innerR*innerR) continue;
    const x = nx+dx, y = ny+dy, z = nz+dz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(k, null);
    falling.delete(k);
  }
}
// 纯函数：四面体(tetrahedron)笔刷——以命中方块为底面中心，XZ 平面等边三角形截面(中心在 dx=dz=0，顶点朝上)，
// 自底(满宽 R)向上线性收尖至顶部中心一点，形成三角锥。流体/掉落语义与 applyBrush 一致。
function tetraInTri(dx, dz, w){
  if(w <= 0) return dx === 0 && dz === 0;        // 顶端收为单点(中心体素)
  const ax = 0, ay = w, bx = -w*0.866, by = -w*0.5, cx = w*0.866, cy = -w*0.5;
  const s1 = (bx-ax)*(dz-ay) - (by-ay)*(dx-ax);
  const s2 = (cx-bx)*(dz-by) - (cy-by)*(dx-bx);
  const s3 = (ax-cx)*(dz-cy) - (ay-cy)*(dx-cx);
  return (s1>=0 && s2>=0 && s3>=0) || (s1<=0 && s2<=0 && s3<=0);
}
function applyTetrahedronBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const w = H > 1 ? R * (1 - dy/(H-1)) : R;     // 截面三角形半宽：底满 R，顶收为 0(尖端)
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(!tetraInTri(dx, dz, w)) continue;
      const x = nx+dx, y = ny+dy, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：四面体擦除——与 applyTetrahedronBrush 同几何，仅置空/退掉落集。
function eraseTetrahedronBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const w = H > 1 ? R * (1 - dy/(H-1)) : R;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(!tetraInTri(dx, dz, w)) continue;
      const x = nx+dx, y = ny+dy, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null);
      falling.delete(k);
    }
  }
}
// 纯函数：椭球(ellipsoid)笔刷——以命中方块 (nx,ny,nz) 为底面中心，XZ 半轴 radius，竖直半轴 (height-1)/2；
// 按归一化椭球方程 dx²/R² + ((dy-b)/b)² + dz²/R² <= 1 选取体素，整体呈对称椭球。
function applyEllipsoidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const b = (H - 1) / 2;
  for(let dy=0; dy<H; dy++){
    const cy = b > 0 ? (dy - b) / b : 0;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      const norm = b > 0 ? (dx*dx)/(R*R) + cy*cy + (dz*dz)/(R*R) : (dx*dx + dz*dz)/(R*R);
      if(norm > 1) continue;
      const x = nx+dx, y = ny+dy, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：椭球擦除——与 applyEllipsoidBrush 同几何，仅置空/退掉落集。
function eraseEllipsoidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const b = (H - 1) / 2;
  for(let dy=0; dy<H; dy++){
    const cy = b > 0 ? (dy - b) / b : 0;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      const norm = b > 0 ? (dx*dx)/(R*R) + cy*cy + (dz*dz)/(R*R) : (dx*dx + dz*dz)/(R*R);
      if(norm > 1) continue;
      const x = nx+dx, y = ny+dy, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null);
      falling.delete(k);
    }
  }
}
// ===== 新增笔刷（ci246 pentprism / ci250 octprism / ci254 gear / ci258 arch / ci262 frustum / ci266 fence / ci270 honeycomb / ci274 zigzag） =====
// 通用：正 n 边形内判定（外接圆半径 R，中心在原点，rot 为旋转角）。凸多边形逐边法向一致性判定。
function polyInside(dx, dz, R, n, rot){
  const vx = [], vz = [];
  for(let i=0;i<n;i++){ const a = rot + i*2*Math.PI/n; vx.push(Math.cos(a)*R); vz.push(Math.sin(a)*R); }
  for(let i=0;i<n;i++){
    const x1=vx[i], y1=vz[i], x2=vx[(i+1)%n], y2=vz[(i+1)%n];
    const e = (x2-x1)*(dz-y1) - (y2-y1)*(dx-x1);
    const c = (x2-x1)*(0-y1) - (y2-y1)*(0-x1);
    if(e*c < 0) return false;
  }
  return true;
}
// 齿轮 XZ 判定：半径落在 [R*0.7, R] 且角度落在齿扇区(齿数 10，占空比 0.5) 才填充。
function gearInside(dx, dz, R){
  const dist = Math.hypot(dx, dz);
  const innerR = R*0.7;
  if(dist < innerR || dist > R) return false;
  const N = 10, period = 2*Math.PI/N, f = 0.5;
  const ang = Math.atan2(dz, dx);
  const a = ((ang % period) + period) % period;
  return a <= period*f;
}
// 拱门 XZ 判定：下半(dz<=0)实心半圆盘(拱座)，上半(dz>0)半圆环(拱)。
function archInside(dx, dz, R){
  const dist = Math.hypot(dx, dz);
  const innerR = R*0.6;
  if(dz <= 0) return dist <= R;
  return dist >= innerR && dist <= R;
}
// 蜂窝 XZ 判定：外接半径 R 的实心盘，按六角网格挖去圆形孔。
function honeycombInside(dx, dz, R){
  const dist = Math.hypot(dx, dz);
  if(dist > R) return false;
  const g = Math.max(2, Math.round(R/2)), hr = g*0.42;
  for(let j=-(R+2); j<=(R+2); j++){
    const off = (j & 1) ? g/2 : 0, cy = j*g*0.866;
    for(let i=-(R+2); i<=(R+2); i++){
      if(Math.hypot(dx-(i*g+off), dz-cy) < hr) return false;
    }
  }
  return true;
}
// 之字 XZ 判定：沿 dx 延伸、dz 随三角波振荡的带状路径(带宽 3)。
function zigzagInside(dx, dz, R){
  if(dx < -R || dx > R) return false;
  const A = R, period = Math.max(2, R);
  const t = (((dx + R) % (2*period)) + 2*period) % (2*period);
  const tri = t < period ? (t/period) : (2 - t/period);
  const zc = Math.round(tri*A - A/2);
  return Math.abs(dz - zc) <= 1;
}
// 纯函数：五棱柱(pentprism)笔刷——XZ 正五边形截面(外接半径 R)，竖直高度 H。
function applyPentprismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0), rot = -Math.PI/2;
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!polyInside(dx, dz, R, 5, rot)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]); if(FALL.has(brush)) falling.add(k);
    }
  }
}
function erasePentprismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0), rot = -Math.PI/2;
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!polyInside(dx, dz, R, 5, rot)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
// 纯函数：八棱柱(octprism)笔刷——XZ 正八边形截面(外接半径 R)，竖直高度 H。
function applyOctprismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0), rot = Math.PI/8;
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!polyInside(dx, dz, R, 8, rot)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]); if(FALL.has(brush)) falling.add(k);
    }
  }
}
function eraseOctprismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0), rot = Math.PI/8;
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!polyInside(dx, dz, R, 8, rot)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
// 纯函数：齿轮(gear)笔刷——XZ 外圈齿环，竖直厚度 H。
function applyGearBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!gearInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]); if(FALL.has(brush)) falling.add(k);
    }
  }
}
function eraseGearBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!gearInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
// 纯函数：拱门(arch)笔刷——XZ 拱形截面，竖直高度 H。
function applyArchBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!archInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]); if(FALL.has(brush)) falling.add(k);
    }
  }
}
function eraseArchBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!archInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
// 纯函数：棱台(frustum)笔刷——XZ 正方形，底 2R 线性缩到顶 2r(r<R)，竖直高度 H。
function applyFrustumBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  const r = Math.max(1, Math.round(R*0.5));
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    const w = H > 1 ? R - (R - r)*(dy/(H-1)) : R;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(Math.abs(dx) > w || Math.abs(dz) > w) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]); if(FALL.has(brush)) falling.add(k);
    }
  }
}
function eraseFrustumBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  const r = Math.max(1, Math.round(R*0.5));
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    const w = H > 1 ? R - (R - r)*(dy/(H-1)) : R;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(Math.abs(dx) > w || Math.abs(dz) > w) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
// 纯函数：栅栏(fence)笔刷——XZ 等距竖直立柱 + 顶部横栏，厚度 H。
function applyFenceBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  const posts = [];
  for(let px=-R; px<=R; px+=2) posts.push(px);
  for(let dy=0; dy<H; dy++){ const y = ny+dy, rail = (dy === H-1);
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      const inPost = posts.indexOf(dx) >= 0 && Math.abs(dz) <= 1;
      const inRail = rail && Math.abs(dz) <= 1;
      if(!inPost && !inRail) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]); if(FALL.has(brush)) falling.add(k);
    }
  }
}
function eraseFenceBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  const posts = [];
  for(let px=-R; px<=R; px+=2) posts.push(px);
  for(let dy=0; dy<H; dy++){ const y = ny+dy, rail = (dy === H-1);
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      const inPost = posts.indexOf(dx) >= 0 && Math.abs(dz) <= 1;
      const inRail = rail && Math.abs(dz) <= 1;
      if(!inPost && !inRail) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
// 纯函数：蜂窝(honeycomb)笔刷——XZ 穿孔盘，竖直厚度 H。
function applyHoneycombBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!honeycombInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]); if(FALL.has(brush)) falling.add(k);
    }
  }
}
function eraseHoneycombBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!honeycombInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
// 纯函数：之字(zigzag)笔刷——XZ 之字带，竖直厚度 H。
function applyZigzagBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!zigzagInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]); if(FALL.has(brush)) falling.add(k);
    }
  }
}
function eraseZigzagBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!zigzagInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
// 纯函数：雪花(snowflake)笔刷——以命中方块 (nx,ny,nz) 为底面中心，XZ 平面 6 向(60° 六轴)主臂 + 倒刺，竖直拉伸 H 层。
// 6 个臂沿六轴方向 (1,0)(0,1)(-1,1)(-1,0)(0,-1)(1,-1) 延伸半径 R，臂上 a>=2 处向垂直方向 ±1 生倒刺；统一调用 writeVoxel/clearVoxel 原语。
function snowflakeInside(dx, dz, R){
  if(dx === 0 && dz === 0) return true;                 // 中心
  const dirs = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
  for(const [ux,uz] of dirs){
    let a;
    if(ux !== 0){ if(dx % ux !== 0) continue; a = dx/ux; if(dz !== a*uz) continue; }
    else { if(dz % uz !== 0) continue; a = dz/uz; if(dx !== a*ux) continue; }
    if(a >= 1 && a <= R) return true;                   // 主臂（整数倍方向）
  }
  for(const [ux,uz] of dirs){                            // 倒刺：沿臂 a(>=2) 处 ±垂直单位向量
    const px = -uz, pz = ux;
    for(let a=2; a<=R; a++){
      const bx = a*ux, bz = a*uz;
      if((dx === bx+px && dz === bz+pz) || (dx === bx-px && dz === bz-pz)) return true;
    }
  }
  return false;
}
function applySnowflakeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!snowflakeInside(dx, dz, R)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
    }
  }
}
function eraseSnowflakeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!snowflakeInside(dx, dz, R)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// 纯函数：箭头(arrow)笔刷——以命中方块 (nx,ny,nz) 为底部中心，竖直细杆(shaft, 1×1) + 顶部圆锥箭头(head)；
// 与实心圆锥(cone)区分：arrow 有一段只占 1×1 的细杆，头部为圆锥；统一调用 writeVoxel/clearVoxel 原语。
function arrowInside(dx, dz, dy, R, H){
  const headH = Math.max(1, R);
  if(dy >= H - headH){                       // 头部：圆锥，自上而下半径减小到尖端
    const t = dy - (H - headH);
    let r = (headH - 1) - t;
    if(r < 0) r = 0;
    return dx*dx + dz*dz <= r*r;
  }
  return dx === 0 && dz === 0;               // 细杆
}
function applyArrowBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!arrowInside(dx, dz, dy, R, H)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
    }
  }
}
function eraseArrowBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!arrowInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// 纯函数：晶体(crystal)笔刷——沿 Y 轴拉长的双锥(bipyramid)：以命中方块 (nx,ny,nz) 为底面中心，
// 各层截面半径随到上下端点距离线性变化(中段最宽、两端收尖)，呈宝石/水晶状；与菱形(八面体,曼哈顿)区分。统一调用 writeVoxel/clearVoxel 原语。
function crystalInside(dx, dz, dy, R, H){
  let r;
  if(H === 1){ r = R; }                           // 单层即整盘(避免 H=1 时退化为单点)
  else {
    const dmax = Math.max(1, Math.floor((H-1)/2));
    const d = Math.min(dy, H-1-dy);
    r = Math.round(R * d / dmax);                 // 缺失边界：half 可能为 0 导致除零 → 已用 dmax 钳制
    if(r < 0) r = 0;
  }
  return dx*dx + dz*dz <= r*r;
}
function applyCrystalBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!crystalInside(dx, dz, dy, R, H)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
    }
  }
}
function eraseCrystalBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!crystalInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// 纯函数：蘑菇(mushroom)笔刷——以命中方块 (nx,ny,nz) 为底部中心，下半为 1×1 菌柄(stem)、上半为倒锥菌盖(cap)；
// 菌盖自下而上半径由 R 收尖到 0，呈经典伞菇(毒蝇伞)形；与圆柱(整柱同宽)区分。统一调用 writeVoxel/clearVoxel 原语。
function mushroomInside(dx, dz, dy, R, H){
  const stemH = Math.max(1, Math.floor(H/2));
  if(dy < stemH) return dx === 0 && dz === 0;      // 菌柄(细)
  const capH = H - stemH;
  if(capH <= 0) return false;
  const t = dy - stemH;                            // 0..capH-1，自菌盖底到顶
  let r = Math.round(R * (capH - 1 - t) / Math.max(1, capH - 1));
  if(r < 0) r = 0;
  return dx*dx + dz*dz <= r*r;
}
function applyMushroomBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!mushroomInside(dx, dz, dy, R, H)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
    }
  }
}
function eraseMushroomBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!mushroomInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// 纯函数：闪电(bolt)笔刷——以命中方块 (nx,ny,nz) 为底部中心，仅在 z=0 竖直片内，沿 Y 以三角波左右偏摆生成锯齿状闪电弧；
// 与之字(zigzag,水平铺面)、螺旋(helix,整柱)区分：闪电是单列竖向连通的折线。统一调用 writeVoxel/clearVoxel 原语。
function boltInside(dx, dz, dy, R, H){
  if(dz !== 0) return false;                       // 闪电为竖直片(仅 z=0 平面)
  const P = Math.max(1, R);
  const ph = dy % (2*P);
  const tri = ph < P ? ph/P : (2 - ph/P);          // 0..1..0 三角波
  let dx0 = Math.round((tri*2 - 1) * R);           // -R..R 偏摆
  if(dx0 < -R) dx0 = -R; if(dx0 > R) dx0 = R;      // 缺失边界：钳制在 ±R 内，防止越出笔刷足迹
  return dx === dx0;
}
function applyBoltBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!boltInside(dx, dz, dy, R, H)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
    }
  }
}
function eraseBoltBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!boltInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// 纯函数：泰森多边形(voronoi)笔刷——以命中方块 (nx,ny,nz) 为底面中心，在 XZ 正方形 [-R,R]² 内按网格种子做最近邻着色，
// 每个 cell 取最近种子的装饰色(多色)，竖直拉伸 H 层；与棋盘(checker)/晶格(lattice)区分：voronoi 是连续无规整周期的镶嵌。
// 性能：朴素 O(种子²) 改为网格 3×3 邻域 O(1) 求最近种子(最近种子必在所在网格单元的 9 邻域内)。统一调用 writeVoxel/clearVoxel 原语。
const VORONOI_TYPES = ['stone','wood','leaf','sand','dirt'];
function voronoiType(dx, dz, R){
  const g = Math.max(2, Math.floor(R/2));
  const gx = Math.round((dx + R) / g) * g - R;       // 以种子网格原点 -R 对齐(避免边界错位)
  const gz = Math.round((dz + R) / g) * g - R;
  let best = Infinity, nsx = gx, nsz = gz;              // 仅查 3×3 邻域(性能优化，等价于全局最近)
  for(let ox=-g; ox<=g; ox+=g) for(let oz=-g; oz<=g; oz+=g){
    const sx = gx+ox, sz = gz+oz;
    const d2 = (dx-sx)*(dx-sx) + (dz-sz)*(dz-sz);
    if(d2 < best){ best = d2; nsx = sx; nsz = sz; }
  }
  const id = Math.round(nsx/g) + Math.round(nsz/g);
  return VORONOI_TYPES[((id % VORONOI_TYPES.length) + VORONOI_TYPES.length) % VORONOI_TYPES.length];
}
function applyVoronoiBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, voronoiType(dx, dz, R), FALLv, key, wkey, PALETTEv);
    }
  }
}
function eraseVoronoiBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// 纯函数：云(cloud)笔刷——以命中方块 (nx,ny,nz) 为底面中心，XZ 圆盘包络内用确定性哈希噪声(无 Math.random)生成蓬松团块，中段密、上下稀；
// 与此前随机散布(scatter)不同：cloud 用可复现 hash 噪声(修复"噪声不可复现"的隐性问题)。统一调用 writeVoxel/clearVoxel 原语。
function hash3u(x, y, z){
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function cloudInside(dx, dz, dy, R, H){
  if(dx*dx + dz*dz > R*R) return false;          // 圆盘包络
  if(dy < 0 || dy >= H) return false;
  const denom = (H - 1) || 1;
  const t = dy / denom;
  const dens = 0.65 - 0.5 * Math.abs(t - 0.5) * 2; // 中段密、上下稀
  return hash3u(dx + 1000, dy + 1000, dz + 1000) < dens;
}
function applyCloudBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!cloudInside(dx, dz, dy, R, H)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
    }
  }
}
function eraseCloudBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!cloudInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// 纯函数：梅花(quincunx)笔刷——五点梅花：花心 (0,0) + 四瓣位于对角偏移 (±R,±R)；竖直拉伸 H 层。
// R2 优化：用 quincunxPoints(R) 生成精确 5 个偏移点，apply/erase 共用同一份点表（单一真相源），
// 扫描复杂度从 O(R²) 降到 O(5)，并消除 apply/erase 因重复推导形状而潜在的不一致（脆弱抽象）。
function quincunxPoints(R){
  R = Math.max(1, R|0);
  return [[0,0],[R,R],[R,-R],[-R,R],[-R,-R]];   // 花心 + 四角对角点（对角偏移边界）
}
function applyQuincunxBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0), pts = quincunxPoints(R);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts) writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
  }
}
function eraseQuincunxBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0), pts = quincunxPoints(R);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts) clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
  }
}
// ci330 纯函数：X形对角(xcross)笔刷——两条对角线 |dx|==|dz| (含中心)，半径 R、竖直拉伸 H 层；
// xcrossPoints(R) 生成精确 4R+1 个偏移点，apply/erase 共用同一点表（单一真相源），复杂度 O(R)。
function xcrossPoints(R){
  R = Math.max(1, R|0);
  const pts = [[0,0]];
  for(let d=1; d<=R; d++) pts.push([d,d],[d,-d],[-d,d],[-d,-d]);
  return pts;   // 中心 + 四条对角臂，共 4R+1 点
}
function applyXcrossBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const H = Math.max(1, height|0), pts = xcrossPoints(radius);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts) writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
  }
}
function eraseXcrossBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const H = Math.max(1, height|0), pts = xcrossPoints(radius);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts) clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
  }
}
// ci334 纯函数：同心环(concentric)笔刷——中心点 + 半径 2,4,...(偶数)的整型圆环(靶纹/年轮)，
// 环判定 |round(dist)-r|==0，concentricPoints(R) 生成点表，apply/erase 共用（单一真相源）。
function concentricPoints(R){
  R = Math.max(1, R|0);
  const pts = [[0,0]], seen = new Set(['0,0']);
  for(let r=2; r<=R; r+=2){
    for(let dx=-r; dx<=r; dx++){
      for(let dz=-r; dz<=r; dz++){
        if(Math.round(Math.sqrt(dx*dx + dz*dz)) !== r) continue;
        const k = dx + ',' + dz;
        if(!seen.has(k)){ seen.add(k); pts.push([dx,dz]); }
      }
    }
  }
  return pts;   // 中心 + 偶数半径同心环
}
function applyConcentricBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const H = Math.max(1, height|0), pts = concentricPoints(radius);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts) writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
  }
}
function eraseConcentricBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const H = Math.max(1, height|0), pts = concentricPoints(radius);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts) clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
  }
}
// ci338 纯函数：车轮(wheel)笔刷——外圈整型圆环(|round(dist)-R|==0) + 中心点 + 8 根辐条
// (轴向 4 根 + 对角 4 根, 对角步进 round(t/√2))，wheelPoints(R) 生成点表，apply/erase 共用（单一真相源）。
function wheelPoints(R){
  R = Math.max(1, R|0);
  const pts = [], seen = new Set();
  const add = (dx,dz)=>{ const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx,dz]); } };
  add(0, 0);
  for(let dx=-R; dx<=R; dx++){
    for(let dz=-R; dz<=R; dz++){
      if(Math.round(Math.sqrt(dx*dx + dz*dz)) === R) add(dx, dz);   // 外圈轮辋
    }
  }
  for(let t=1; t<R; t++){                                           // 8 辐条(不含中心/轮辋端点重复由 seen 去重)
    add(t, 0); add(-t, 0); add(0, t); add(0, -t);                   // 轴向 4 根
    const d = Math.round(t / Math.SQRT2);
    add(d, d); add(-d, d); add(d, -d); add(-d, -d);                 // 对角 4 根
  }
  return pts;
}
// ci346 纯函数：沙漏(hourglass)笔刷——上下两个圆锥对顶收腰：半径随 |dy-mid| 线性放大，
// 腰部(中层)最细为 1，顶/底面全半径 R。与圆锥(cone)/棱台(frustum)区分：沙漏是对称双锥。
function hourglassInside(dx, dz, dy, R, H){
  const mid = (H - 1) / 2;
  const t = mid === 0 ? 1 : Math.abs(dy - mid) / mid;      // 0(腰)..1(端)
  const rr = Math.max(1, Math.round(R * t));
  return dx*dx + dz*dz <= rr*rr;
}
function applyHourglassBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!hourglassInside(dx, dz, dy, R, H)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
    }
  }
}
function eraseHourglassBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!hourglassInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// ci350 纯函数：树木(tree)笔刷——下 60% 为半径 1 的树干立柱，上 40% 为球形树冠(半径 R)。
// 与蘑菇(mushroom, 平顶伞盖)区分：树冠是以冠层中心为球心的实心球。
function treeInside(dx, dz, dy, R, H){
  const trunkH = Math.max(1, Math.round(H * 0.6));
  if(dy < trunkH) return Math.abs(dx) <= 0 && Math.abs(dz) <= 0 ? true : (dx*dx + dz*dz <= 1);  // 树干：半径 1 圆柱
  const cy = trunkH + Math.max(0, H - 1 - trunkH) / 2;      // 冠心层
  const ry = Math.max(1, (H - trunkH) / 2);                 // 冠竖直半径
  const s = (dy - cy) / ry;
  const rr = R * Math.sqrt(Math.max(0, 1 - s*s));           // 球截面半径
  return dx*dx + dz*dz <= rr*rr;
}
function applyTreeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(2, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!treeInside(dx, dz, dy, R, H)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
    }
  }
}
function eraseTreeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(2, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!treeInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// ci354 纯函数：漏斗(funnel)笔刷——下 40% 为半径 1 管颈，上 60% 为倒圆锥(顶宽 R 底窄 1)。
// 与圆锥(cone, 底宽顶窄)方向相反且带管颈，与沙漏(对称双锥)区分。
function funnelInside(dx, dz, dy, R, H){
  const neckH = Math.max(1, Math.round(H * 0.4));
  if(dy < neckH) return dx*dx + dz*dz <= 1;                 // 管颈：半径 1
  const t = (H - 1) === neckH - 1 ? 1 : (dy - neckH) / Math.max(1, H - 1 - neckH);   // 0(锥底)..1(锥口)
  const rr = Math.max(1, Math.round(1 + (R - 1) * t));
  return dx*dx + dz*dz <= rr*rr;
}
function applyFunnelBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(2, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!funnelInside(dx, dz, dy, R, H)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
    }
  }
}
function eraseFunnelBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(2, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!funnelInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// ci342 纯函数：螺线(spiral)笔刷——XZ 平面阿基米德螺线 r = θ·R/(2π·TURNS)，
// 由细步进采样取整去重，从中心向外旋出 2 圈；spiralPoints(R) 生成点表，apply/erase 共用。
function spiralPoints(R){
  R = Math.max(1, R|0);
  const TURNS = 2, maxTh = TURNS * 2 * Math.PI;
  const pts = [], seen = new Set();
  const add = (dx,dz)=>{ const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx,dz]); } };
  add(0, 0);
  const steps = Math.max(64, R * 48);
  for(let i=1; i<=steps; i++){
    const th = maxTh * i / steps;
    const r = R * th / maxTh;
    add(Math.round(r * Math.cos(th)), Math.round(r * Math.sin(th)));
  }
  return pts;
}
function applySpiralBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const H = Math.max(1, height|0), pts = spiralPoints(radius);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts) writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
  }
}
function eraseSpiralBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const H = Math.max(1, height|0), pts = spiralPoints(radius);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts) clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
  }
}
function applyWheelBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const H = Math.max(1, height|0), pts = wheelPoints(radius);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts) writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALLv, key, wkey, PALETTEv);
  }
}
function eraseWheelBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const H = Math.max(1, height|0), pts = wheelPoints(radius);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts) clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
  }
}
// ci366 纯函数：斜坡(ramp)笔刷——以 (nx,ny,nz) 为底面中心，XZ 满铺 R×R 方块，沿 +dx 方向逐列升高：
// 列 dx 的填充层数 top(dx)=round((dx+R)/(2R)*(H-1))+1(从 1 到 H)。rampPoints(R) 生成底面满铺点表，
// rampInside(dx,dz,dy,R,H) 为单一真相源。apply/erase 共用，保证几何对称、无重复。
function rampPoints(R){
  R = Math.max(1, R|0);
  const pts = [], seen = new Set();
  const add = (dx,dz)=>{ const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx,dz]); } };
  for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++) add(dx, dz);
  return pts;
}
function rampInside(dx, dz, dy, R, H){
  R = Math.max(1, R|0); H = Math.max(1, H|0);
  if(dx < -R || dx > R || dz < -R || dz > R) return false;
  if(dy < 0 || dy >= H) return false;
  const top = Math.round((dx + R) / (2 * R) * (H - 1)) + 1;   // 沿 +dx 单调升高(1..H)
  return dy < top;
}
function applyRampBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  const pts = rampPoints(R);                          // XZ 足迹单一来源(满铺方格)，消除 apply 内重复双重循环
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts){
      if(!rampInside(dx, dz, dy, R, H)) continue;   // 高度由 rampInside 单一真相源判定
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALL, key, wkey, PALETTE);
    }
  }
}
function eraseRampBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  const pts = rampPoints(R);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts){
      if(!rampInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// ci370 纯函数：桥(bridge)笔刷——以 (nx,ny,nz) 为底面中心，XZ R×R 平台：顶层(deckY=H-1)为整层桥面，
// 两端 dx=±R 为从底到 deckY-1 的桥墩，桥面以下(中间)留空可穿行。bridgePoints(R) 生成底面(桥墩)点表，
// bridgeInside(dx,dz,dy,R,H) 为单一真相源。apply/erase 共用。
function bridgePoints(R){
  R = Math.max(1, R|0);
  const pts = [], seen = new Set();
  const add = (dx,dz)=>{ const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx,dz]); } };
  for(let dz=-R; dz<=R; dz++){ add(-R, dz); add(R, dz); }   // 两端桥墩(dy=0 截面)
  return pts;
}
function bridgeInside(dx, dz, dy, R, H){
  R = Math.max(1, R|0); H = Math.max(2, H|0);
  if(dx < -R || dx > R || dz < -R || dz > R) return false;
  if(dy < 0 || dy >= H) return false;
  const deckY = H - 1;
  if(dy === deckY) return true;                              // 整层桥面
  return Math.abs(dx) === R && dy <= deckY - 1;              // 两端桥墩
}
// 共享遍历原语：以 bridgeInside 为单一真相源，按 (R,H) 枚举所有命中方块并回调 (x,y,z)。
// 抽此辅助消除 apply/erase 两函数体内逐字重复的双循环样板。
function forEachBridgeVoxel(R, H, nx, ny, nz, cb){
  R = Math.max(1, R|0); H = Math.max(2, H|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!bridgeInside(dx, dz, dy, R, H)) continue;
      cb(nx+dx, y, nz+dz);
    }
  }
}
function applyBridgeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  forEachBridgeVoxel(radius, height, nx, ny, nz, (x,y,z)=>
    writeVoxel(edits, waterCol, lavaCol, falling, x, y, z, brush, FALL, key, wkey, PALETTE));
}
function eraseBridgeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  forEachBridgeVoxel(radius, height, nx, ny, nz, (x,y,z)=>
    clearVoxel(edits, waterCol, lavaCol, falling, x, y, z, key, wkey));
}
// 纯函数：胶囊形(capsule)笔刷——以命中方块 (nx,ny,nz) 为底面中心，XZ 圆盘半径 radius，竖直高度 height；
// 中段为全半径圆柱，两端按半球帽收缩，整体呈胶囊/药丸形。流体/掉落语义与 applyBrush 一致。
function applyCapsuleBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const mid = (H - 1) / 2;
  const shoulder = Math.max(0, mid - R);                 // 半球起点距中线的层数(<=shoulder 为圆柱中段)
  for(let dy=0; dy<H; dy++){
    const d = Math.abs(dy - mid);
    let rr = R;
    if(d > shoulder){ const t = d - shoulder; rr = Math.floor(Math.sqrt(Math.max(0, R*R - t*t))); }
    if(rr < 1) rr = 1;
    const y = ny + dy;
    for(let dx=-rr+1; dx<rr; dx++) for(let dz=-rr+1; dz<rr; dz++){
      if(dx*dx + dz*dz > rr*rr) continue;                // 圆盘外剔除
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：胶囊形擦除——与 applyCapsuleBrush 同几何，仅置空/退掉落集。
function eraseCapsuleBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const mid = (H - 1) / 2;
  const shoulder = Math.max(0, mid - R);
  for(let dy=0; dy<H; dy++){
    const d = Math.abs(dy - mid);
    let rr = R;
    if(d > shoulder){ const t = d - shoulder; rr = Math.floor(Math.sqrt(Math.max(0, R*R - t*t))); }
    if(rr < 1) rr = 1;
    const y = ny + dy;
    for(let dx=-rr+1; dx<rr; dx++) for(let dz=-rr+1; dz<rr; dz++){
      if(dx*dx + dz*dz > rr*rr) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null);
      falling.delete(k);
    }
  }
}
// 纯函数：星形(star)笔刷——以命中方块 (nx,ny,nz) 为底面中心，XZ 圆盘半径 radius，竖直高度 height；
// 每层取圆盘内「十字臂(dx=0 或 dz=0) + 对角臂(|dx|=|dz|)」构成的八角星截面，整柱拉伸。流体/掉落语义与 applyBrush 一致。
function applyStarBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(dx*dx + dz*dz > R*R) continue;                          // 圆盘外剔除
      if(!(dx === 0 || dz === 0 || Math.abs(dx) === Math.abs(dz))) continue; // 仅保留十字/对角臂
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：星形擦除——与 applyStarBrush 同几何，仅置空/退掉落集。
function eraseStarBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(dx*dx + dz*dz > R*R) continue;
      if(!(dx === 0 || dz === 0 || Math.abs(dx) === Math.abs(dz))) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null);
      falling.delete(k);
    }
  }
}
// 纯函数：环形(annulus)笔刷——每层取「圆盘 - 内孔(inner=floor(R/2))」的环形截面，整柱拉伸；
// 流体/掉落语义与 applyBrush 一致。
function applyRingBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const inner = Math.max(0, Math.floor(R / 2));          // 内孔半径
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      const d2 = dx*dx + dz*dz;
      if(d2 > R*R) continue;                             // 圆盘外剔除
      if(d2 <= inner*inner) continue;                    // 内孔剔除（环形）
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：环形擦除——与 applyRingBrush 同几何，仅置空/退掉落集。
function eraseRingBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const inner = Math.max(0, Math.floor(R / 2));
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      const d2 = dx*dx + dz*dz;
      if(d2 > R*R) continue;
      if(d2 <= inner*inner) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null);
      falling.delete(k);
    }
  }
}

// 纯函数：心形(heart)笔刷——XZ 平面取心形截面(隐式公式 (X²+Y²-1)³ - X²Y³ ≤ 0，
// X=dx*1.3/R, Y=dz*1.3/R，半径越大心形越大)，整柱拉伸；流体/掉落语义与 applyBrush 一致。
function applyHeartBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      const X = dx * 1.3 / R, Y = dz * 1.3 / R;
      const v = (X*X + Y*Y - 1);
      if(v*v*v - X*X*Y*Y*Y > 0) continue;           // 心形外剔除
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTE[brush]);
      if(FALL.has(brush)) falling.add(k);
    }
  }
}
// 纯函数：心形擦除——与 applyHeartBrush 同几何，仅置空/退掉落集。
function eraseHeartBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const s = Math.max(1, (R - 1) / 1.3);
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      const X = dx / s, Y = dz / s;
      const v = (X*X + Y*Y - 1);
      if(v*v*v - X*X*Y*Y*Y > 0) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null);
      falling.delete(k);
    }
  }
}

// 纯函数：金字塔形笔刷——以 (nx,ny,nz) 为底面中心，XZ 平面底半径 radius、高 height；
// 自底向上每层收缩一圈(曼哈顿半径 r-dy)，形成四棱锥；流体/掉落语义与 applyBrush 一致。
// ci358 纯函数：金字塔(四向锥台)笔刷——以 (nx,ny,nz) 为底面中心，XZ 曼哈顿菱形截面逐层收缩，层高 h=min(H,R)。
// pyramidPoints(R) 生成底面(dy=0)菱形点表，pyramidInside(dx,dz,dy,R,H) 为单一真相源。
// apply/erase 共用单一真相源，消除几何重复(此前 apply/erase 各自内联同一判定，易漂移)。
function pyramidPoints(R){
  R = Math.max(1, R|0);
  const pts = [], seen = new Set();
  const add = (dx,dz)=>{ const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx,dz]); } };
  for(let dx=-(R-1); dx<=R-1; dx++) for(let dz=-(R-1); dz<=R-1; dz++){
    if(Math.abs(dx) + Math.abs(dz) <= R) add(dx, dz);
  }
  return pts;
}
function pyramidInside(dx, dz, dy, R, H){
  R = Math.max(1, R|0); H = Math.max(1, H|0);
  const h = Math.min(H, R);
  if(dy < 0 || dy >= h) return false;                       // 超过层高(高度被钳到半径)
  if(Math.abs(dx) > R-1 || Math.abs(dz) > R-1) return false; // 与既有循环边界一致
  const lim = Math.max(0, R - dy);
  if(Math.abs(dx) + Math.abs(dz) > lim) return false;       // 曼哈顿菱形外剔除
  return true;
}
function applyPyramidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius|0);
  const H = (height == null) ? R : Math.max(1, height|0);
  const pts = pyramidPoints(R);                          // XZ 足迹单一来源(曼哈顿菱形)，消除 apply 内重复派生
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts){
      if(!pyramidInside(dx, dz, dy, R, H)) continue;   // 竖直层高/裁剪由单一真相源负责(不再本地重复 h=min(H,R))
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, brush, FALL, key, wkey, PALETTE);
    }
  }
}
// 纯函数：金字塔形擦除——与 applyPyramidBrush 同几何(pyramidPoints 足迹 + pyramidInside 单一真相源)，仅置空/退掉落集。
function erasePyramidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = (height == null) ? R : Math.max(1, height|0);
  const pts = pyramidPoints(R);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(const [dx,dz] of pts){
      if(!pyramidInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, y, nz+dz, key, wkey);
    }
  }
}
// 纯函数：散布形笔刷——以 (nx,ny,nz) 为底心、半径 radius 的球内，按确定性密度 density 逐格放置：
// 仅当 hash01(x,y,z) < density 才落块，形成可复现的随机散点云（同坐标同结果，无需外部 RNG）。流体/掉落语义与 applyBrush 一致。
function applyScatterBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, density, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const d = (density == null) ? 0.35 : Math.max(0, Math.min(1, density));
  const top = ny + 2*r - 1;
  for(let dx=-r+1; dx<r; dx++) for(let dy=-r+1; dy<r; dy++) for(let dz=-r+1; dz<r; dz++){
    if(dx*dx + dy*dy + dz*dz > r*r) continue;        // 球外剔除
    if(hash01(nx+dx, ny+dy, nz+dz) >= d) continue;   // 低于密度阈值跳过(确定性)
    const x = nx+dx, y = ny+dy, z = nz+dz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, top); continue; }
    if(brush === 'water'){ waterCol.set(wk, top); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}
// 纯函数：散布形擦除——球内全部清除(与 eraseSphereBrush 同几何；密度不影响擦除范围)。
function eraseScatterBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
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
// 纯函数：环形(甜甜圈)笔刷——XZ 平面内以 R=radius 为主半径、tube=max(1,floor(R/3)) 为管半径的实心环面。
// 中心 (nx,ny,nz) 留空(孔洞)，环体绕 Y 轴一圈；用于做拱门/环形轨道/行星环。几何仅在 XZ 平面扩张，
// Y 方向只占 [-tube, +tube] 一圈管厚，故不会像球形那样堆满整列。
// ci362 纯函数：环形(甜甜圈)笔刷——XZ 主半径 R、管半径 tube=max(1,floor(R/3)) 的实心环面；
// 中心留孔，绕 Y 轴一圈，Y 方向厚 ±tube。torusPoints(R) 生成 dy=0 环截面点表，
// torusInside(dx,dz,dy,R,H) 为单一真相源(修复此前 apply 对流体列误用常量 top=ny+t 而非逐格 y+1)。
function torusPoints(R){
  R = Math.max(2, R|0);
  const t = Math.max(1, Math.floor(R/3));
  const half = R + t;
  const pts = [], seen = new Set();
  const add = (dx,dz)=>{ const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx,dz]); } };
  for(let dx=-half; dx<=half; dx++) for(let dz=-half; dz<=half; dz++){
    const dr = Math.sqrt(dx*dx + dz*dz) - R;
    if(dr*dr <= t*t) add(dx, dz);
  }
  return pts;
}
function torusInside(dx, dz, dy, R, H){
  R = Math.max(2, R|0);
  const t = Math.max(1, Math.floor(R/3));          // 管半径；环面 Y 方向厚 ±t(故 H 由 R 推出为 2t+1，H 仅作签名对齐)
  if(dy < -t || dy > t) return false;              // 与同侪 *Inside 一致：显式钳制 dy 范围(单一真相源完备)
  const dr = Math.sqrt(dx*dx + dz*dz) - R;
  return dr*dr + dy*dy <= t*t;
}
function applyTorusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const R = Math.max(2, radius|0);
  const t = Math.max(1, Math.floor(R/3));
  const half = R + t;
  const H = 2*t + 1;
  for(let dx=-half; dx<=half; dx++) for(let dz=-half; dz<=half; dz++){
    const dr = Math.sqrt(dx*dx + dz*dz) - R;
    if(dr*dr > t*t) continue;
    for(let dy=-t; dy<=t; dy++){
      if(!torusInside(dx, dz, dy, R, H)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, ny+dy, nz+dz, brush, FALL, key, wkey, PALETTE);
    }
  }
}
// 纯函数：环形擦除——与 applyTorusBrush 同几何(单一真相源 torusInside)，仅置空/退掉落集。
function eraseTorusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const R = Math.max(2, radius|0);
  const t = Math.max(1, Math.floor(R/3));
  const half = R + t;
  const H = 2*t + 1;
  for(let dx=-half; dx<=half; dx++) for(let dz=-half; dz<=half; dz++){
    const dr = Math.sqrt(dx*dx + dz*dz) - R;
    if(dr*dr > t*t) continue;
    for(let dy=-t; dy<=t; dy++){
      if(!torusInside(dx, dz, dy, R, H)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, ny+dy, nz+dz, key, wkey);
    }
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
// 纯函数：世界包围盒查询——返回非空体素的最小/最大坐标与尺寸；世界为空返回 null。世界此前缺乏空间边界查询能力(隐含缺口)。
function worldBounds(edits){
  if(edits.size === 0) return null;
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(const [k,v] of edits){
    if(v == null) continue;                       // 挖空不计入世界边界
    const [x,y,z] = k.split(',').map(Number);
    if(x<minX) minX=x; if(y<minY) minY=y; if(z<minZ) minZ=z;
    if(x>maxX) maxX=x; if(y>maxY) maxY=y; if(z>maxZ) maxZ=z;
  }
  if(minX===Infinity) return null;
  return { min:{x:minX,y:minY,z:minZ}, max:{x:maxX,y:maxY,z:maxZ}, size:{x:maxX-minX+1,y:maxY-minY+1,z:maxZ-minZ+1} };
}
// 纯函数：程序化地形生成（确定性、可单测、与全局状态解耦）。
// 用带种子的双线性值噪声(value noise)多倍频叠加得到高度图，并为每个地表列填充 草/泥/石 三层。
function hash2(x, z, seed){
  let h = (Math.imul(x|0, 374761393) + Math.imul(z|0, 668265263) + Math.imul(seed|0, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;            // [0,1)
}
function valueNoise(x, z, seed, freq){
  const fx = x / freq, fz = z / freq;
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const tx = fx - x0, tz = fz - z0;
  const v00 = hash2(x0, z0, seed),   v10 = hash2(x0+1, z0, seed);
  const v01 = hash2(x0, z0+1, seed), v11 = hash2(x0+1, z0+1, seed);
  const sx = tx*tx*(3-2*tx), sz = tz*tz*(3-2*tz);          // 平滑插值
  const a = v00 + (v10 - v00)*sx, b = v01 + (v11 - v01)*sx;
  return a + (b - a)*sz;
}
function genTerrain(seed, size, key, PALETTE){
  size = Math.max(1, size|0);
  const edits = new Map();
  const heights = [];
  let minH = Infinity, maxH = -Infinity;
  const base = 8, noiseAmp = 12, fill = 3;                  // 地表下回填层数
  for(let x = 0; x < size; x++){
    heights[x] = [];
    for(let z = 0; z < size; z++){
      let n = valueNoise(x, z, seed, 16) * 0.6
            + valueNoise(x, z, seed, 6) * 0.3
            + valueNoise(x, z, seed, 3) * 0.1;
      const h = base + Math.floor(n * noiseAmp);
      heights[x][z] = h;
      if(h < minH) minH = h; if(h > maxH) maxH = h;
      for(let y = h - fill; y <= h; y++){
        let color;
        if(y === h) color = PALETTE.grass;
        else if(y >= h - 1) color = PALETTE.dirt;
        else color = PALETTE.stone;
        edits.set(key(x, y, z), color);
      }
    }
  }
  return { edits, heights, minH, maxH, size };
}
// 共享体素立方体几何：8 角点(相对偏移) + 6 面(每面 4 角点索引)，供 OBJ/PLY 等导出复用，避免 6 面/8 顶点定义在多处重复(copy-paste 脆弱抽象)。
function voxelCube(){
  const corners = [
    [-0.5,-0.5,-0.5],[0.5,-0.5,-0.5],[0.5,0.5,-0.5],[-0.5,0.5,-0.5],
    [-0.5,-0.5,0.5],[0.5,-0.5,0.5],[0.5,0.5,0.5],[-0.5,0.5,0.5]
  ];
  const faces = [[1,2,3,4],[5,6,7,8],[1,4,8,5],[2,3,7,6],[1,5,6,2],[4,3,7,8]];
  return { corners, faces };
}
function exportOBJ(edits, key, PALETTE){
  const { corners, faces } = voxelCube();
  const lines = ['# VoxelForge export'];
  let vi = 1;
  for(const [k, v] of edits){
    if(v == null) continue;                 // 挖空跳过
    const [x,y,z] = k.split(',').map(Number);
    for(const c of corners) lines.push('v ' + (x+c[0]) + ' ' + (y+c[1]) + ' ' + (z+c[2]));
    for(const f of faces){
      lines.push('f ' + (vi+f[0]-1) + ' ' + (vi+f[1]-1) + ' ' + (vi+f[2]-1));
      lines.push('f ' + (vi+f[0]-1) + ' ' + (vi+f[2]-1) + ' ' + (vi+f[3]-1));
    }
    vi += 8;
  }
  return lines.join('\n') + '\n';
}
// 纯函数：导出 PLY(ascii 1.0) 网格——复用 voxelCube 几何，每体素 8 顶点 + 12 三角面，顶点带 RGB 颜色；空世界导出合法 0 顶点 PLY。
function exportPLY(edits, key, PALETTE){
  const { corners, faces } = voxelCube();
  const verts = [], tris = [];
  let vi = 0;
  for(const [k, v] of edits){
    if(v == null) continue;                 // 挖空跳过
    const col = v >>> 0, r = (col>>16)&255, g = (col>>8)&255, b = col&255;
    const [x,y,z] = k.split(',').map(Number);
    for(const c of corners) verts.push((x+c[0]) + ' ' + (y+c[1]) + ' ' + (z+c[2]) + ' ' + r + ' ' + g + ' ' + b);
    for(const f of faces){
      tris.push('3 ' + (vi+f[0]-1) + ' ' + (vi+f[1]-1) + ' ' + (vi+f[2]-1));
      tris.push('3 ' + (vi+f[0]-1) + ' ' + (vi+f[2]-1) + ' ' + (vi+f[3]-1));
    }
    vi += 8;
  }
  const head = [
    'ply','format ascii 1.0',
    'element vertex ' + verts.length,
    'property float x','property float y','property float z',
    'property uchar red','property uchar green','property uchar blue',
    'element face ' + tris.length,
    'property list uchar int vertex_indices',
    'end_header'
  ];
  return head.concat(verts, tris).join('\n') + '\n';
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

// 纯函数：把实心长方体区域掏空为「外壳」——仅保留 6 个外表面的体素，内部所有方块置为 null（挖空）。
// 不改变入参（返回新 Map）。典型用途：先用 fillBox 填满一个长方体，再 hollowBox 掏成空心建筑/管道。
// 边界判定：任一坐标为盒的最小/最大即算外表面（哪怕该处原本就是 null，也不影响内部掏空）。
function hollowBox(edits, x0,y0,z0,x1,y1,z1){
  const out = new Map(edits);
  const a = [Math.min(x0,x1), Math.min(y0,y1), Math.min(z0,z1)];
  const b = [Math.max(x0,x1), Math.max(y0,y1), Math.max(z0,z1)];
  for(let x=a[0]; x<=b[0]; x++)
    for(let y=a[1]; y<=b[1]; y++)
      for(let z=a[2]; z<=b[2]; z++){
        const onBoundary = x===a[0]||x===b[0]||y===a[1]||y===b[1]||z===a[2]||z===b[2];
        if(!onBoundary) out.set(key(x,y,z), null);
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
    else if(brushShape === 'cylinder') eraseCylinderBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'pyramid') erasePyramidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'scatter') eraseScatterBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'torus') eraseTorusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'wall') eraseWallBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'diamond') eraseDiamondBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'column') eraseColumnBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'cone') eraseConeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'stairs') eraseStairsBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'dome') eraseDomeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'prism') erasePrismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'tube') eraseTubeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'wedge') eraseWedgeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'frame') eraseFrameBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'cross') eraseCrossBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'plus') erasePlusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'checker') eraseCheckerBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'lattice') eraseLatticeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'flatten') eraseFlattenBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'wave') eraseWaveBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'helix') eraseHelixBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
    else if(brushShape === 'capsule') eraseCapsuleBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'star') eraseStarBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'ring') eraseRingBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'heart') eraseHeartBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'hexprism') eraseHexPrismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'shell') eraseShellBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'tetrahedron') eraseTetrahedronBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'ellipsoid') eraseEllipsoidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'pentprism') erasePentprismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'octprism') eraseOctprismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'gear') eraseGearBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'arch') eraseArchBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'frustum') eraseFrustumBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'fence') eraseFenceBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'honeycomb') eraseHoneycombBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'zigzag') eraseZigzagBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'snowflake') eraseSnowflakeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'arrow') eraseArrowBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'crystal') eraseCrystalBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'mushroom') eraseMushroomBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'bolt') eraseBoltBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'voronoi') eraseVoronoiBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'cloud') eraseCloudBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'quincunx') eraseQuincunxBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'xcross') eraseXcrossBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'concentric') eraseConcentricBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'wheel') eraseWheelBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'spiral') eraseSpiralBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'hourglass') eraseHourglassBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize*2+1, key, wkey);
    else if(brushShape === 'tree') eraseTreeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize*3, key, wkey);
    else if(brushShape === 'funnel') eraseFunnelBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize*2+1, key, wkey);
    else if(brushShape === 'ramp') eraseRampBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else if(brushShape === 'bridge') eraseBridgeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, brushSize, key, wkey);
    else eraseBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brushSize, key, wkey);
  } else {
    if(brushShape === 'sphere') applySphereBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'cylinder') applyCylinderBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'pyramid') applyPyramidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'scatter') applyScatterBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, scatterDensity, FALL, key, wkey, PALETTE);
    else if(brushShape === 'torus') applyTorusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'wall') applyWallBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'diamond') applyDiamondBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'column') applyColumnBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'cone') applyConeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'stairs') applyStairsBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'dome') applyDomeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'prism') applyPrismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'tube') applyTubeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'wedge') applyWedgeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'frame') applyFrameBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'cross') applyCrossBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'plus') applyPlusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'checker') applyCheckerBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'lattice') applyLatticeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'flatten') applyFlattenBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'wave') applyWaveBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'helix') applyHelixBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'capsule') applyCapsuleBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'star') applyStarBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'ring') applyRingBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'heart') applyHeartBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'hexprism') applyHexPrismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'shell') applyShellBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'tetrahedron') applyTetrahedronBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'ellipsoid') applyEllipsoidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'pentprism') applyPentprismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'octprism') applyOctprismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'gear') applyGearBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'arch') applyArchBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'frustum') applyFrustumBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'fence') applyFenceBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'honeycomb') applyHoneycombBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'zigzag') applyZigzagBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'snowflake') applySnowflakeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'arrow') applyArrowBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'crystal') applyCrystalBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'mushroom') applyMushroomBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'bolt') applyBoltBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'voronoi') applyVoronoiBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'cloud') applyCloudBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'quincunx') applyQuincunxBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'xcross') applyXcrossBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'concentric') applyConcentricBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'wheel') applyWheelBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'spiral') applySpiralBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'hourglass') applyHourglassBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize*2+1, FALL, key, wkey, PALETTE);
    else if(brushShape === 'tree') applyTreeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize*3, FALL, key, wkey, PALETTE);
    else if(brushShape === 'funnel') applyFunnelBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize*2+1, FALL, key, wkey, PALETTE);
    else if(brushShape === 'ramp') applyRampBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
    else if(brushShape === 'bridge') applyBridgeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, brushSize, brushSize, FALL, key, wkey, PALETTE);
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
  const prev = snapshotEdits();                 // 爆破前快照(此前 boom 未入撤销栈 → 爆炸不可逆的真 bug)
  edits = explode(edits, cx, cy, cz, R);
  for(const k of [...falling]){   // 清理被挖掉的掉落集方块
    const [x,y,z] = k.split(',').map(Number);
    const dx = x-cx, dy = y-cy, dz = z-cz;
    if(dx*dx + dy*dy + dz*dz <= r2) falling.delete(k);
  }
  recordUndo(prev);                            // 使爆破可撤销
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
// 掏空外壳：第一角点选一角，第二角点按两对角把该实心长方体掏成外壳（内部挖空，仅留表面）
function hollowBoxAt(clientX, clientY){
  const p = pickCoord(clientX, clientY);
  if(!p) return;
  if(!fillAnchor){
    fillAnchor = { x: p.x, y: p.y, z: p.z };
    flash('掏空：已选第一角 ('+p.x+','+p.y+','+p.z+')，点对角完成');
    return;
  }
  edits = hollowBox(edits, fillAnchor.x, fillAnchor.y, fillAnchor.z, p.x, p.y, p.z);
  rebuildAll();
  flash('已掏空为外壳，点一下重新选第一角');
  fillAnchor = null;
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
  else if(mode === 'hollow') hollowBoxAt(e.clientX, e.clientY);
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
$('hollowBtn').onclick = ()=>{ mode='hollow'; $('hollowBtn').classList.add('on'); $('addBtn').classList.remove('on'); $('delBtn').classList.remove('on'); $('moveBtn').classList.remove('on'); $('boomBtn').classList.remove('on'); $('fillBtn').classList.remove('on'); $('fillBoxBtn').classList.remove('on'); $('lineBtn').classList.remove('on'); $('mode').textContent='模式: 掏空外壳(点两对角, 把长方体挖成空心)'; fillAnchor=null; };
$('brush').onchange = e=> brush = e.target.value;
$('brushSize').onchange = e=>{ brushSize = +e.target.value; $('bsVal').textContent = brushSize; };
$('mirrorOn').onchange = e=>{ mirrorOn = e.target.checked; flash(mirrorOn ? '镜像笔刷：开' : '镜像笔刷：关'); };
$('mirrorAxis').onchange = e=>{ mirrorAxis = e.target.value; };
$('mirrorCenter').oninput = e=>{ mirrorCenter = +e.target.value || 0; };
$('brushShape').onchange = e=>{ brushShape = e.target.value; flash(brushShape === 'sphere' ? '笔刷形状：球形' : brushShape === 'cylinder' ? '笔刷形状：圆柱形' : brushShape === 'pyramid' ? '笔刷形状：金字塔形' : brushShape === 'scatter' ? '笔刷形状：散布形' : brushShape === 'torus' ? '笔刷形状：环形' : brushShape === 'wall' ? '笔刷形状：墙壁' : brushShape === 'diamond' ? '笔刷形状：菱形(八面体)' : brushShape === 'column' ? '笔刷形状：立柱' : brushShape === 'cone' ? '笔刷形状：圆锥' : brushShape === 'stairs' ? '笔刷形状：阶梯' : brushShape === 'dome' ? '笔刷形状：半球(穹顶)' : brushShape === 'prism' ? '笔刷形状：三棱柱' : brushShape === 'tube' ? '笔刷形状：空心圆柱(管道)' : brushShape === 'wedge' ? '笔刷形状：楔形' : brushShape === 'frame' ? '笔刷形状：回字(空心方框)' : brushShape === 'cross' ? '笔刷形状：十字' : brushShape === 'plus' ? '笔刷形状：十字(3D加号)' : brushShape === 'checker' ? '笔刷形状：棋盘' : brushShape === 'lattice' ? '笔刷形状：晶格' : brushShape === 'flatten' ? '笔刷形状：整平(平台)' : brushShape === 'wave' ? '笔刷形状：波形' : brushShape === 'helix' ? '笔刷形状：螺旋(helix)' : brushShape === 'capsule' ? '笔刷形状：胶囊形' : brushShape === 'ring' ? '笔刷形状：圆环(annulus)' : brushShape === 'heart' ? '笔刷形状：心形' : brushShape === 'star' ? '笔刷形状：星形' : brushShape === 'hexprism' ? '笔刷形状：六棱柱' : brushShape === 'shell' ? '笔刷形状：球壳(空心球)' : brushShape === 'pentprism' ? '笔刷形状：五棱柱' : brushShape === 'octprism' ? '笔刷形状：八棱柱' : brushShape === 'gear' ? '笔刷形状：齿轮' : brushShape === 'arch' ? '笔刷形状：拱门' : brushShape === 'frustum' ? '笔刷形状：棱台' : brushShape === 'fence' ? '笔刷形状：栅栏' : brushShape === 'honeycomb' ? '笔刷形状：蜂窝' : brushShape === 'zigzag' ? '笔刷形状：之字' : brushShape === 'snowflake' ? '笔刷形状：雪花' : brushShape === 'arrow' ? '笔刷形状：箭头' : brushShape === 'crystal' ? '笔刷形状：晶体' : brushShape === 'mushroom' ? '笔刷形状：蘑菇' : brushShape === 'bolt' ? '笔刷形状：闪电' : brushShape === 'voronoi' ? '笔刷形状：泰森多边形' : brushShape === 'cloud' ? '笔刷形状：云' : brushShape === 'quincunx' ? '笔刷形状：梅花(五点)' : brushShape === 'xcross' ? '笔刷形状：X形对角' : brushShape === 'concentric' ? '笔刷形状：同心环' : brushShape === 'wheel' ? '笔刷形状：车轮(辐条)' : brushShape === 'spiral' ? '笔刷形状：螺线(平面)' : brushShape === 'hourglass' ? '笔刷形状：沙漏(双锥)' : brushShape === 'tree' ? '笔刷形状：树木' : brushShape === 'funnel' ? '笔刷形状：漏斗' : brushShape === 'ellipsoid' ? '笔刷形状：椭球' : brushShape === 'tetrahedron' ? '笔刷形状：四面体' : brushShape === 'ramp' ? '笔刷形状：斜坡' : brushShape === 'bridge' ? '笔刷形状：桥' : '笔刷形状：' + brushShape); };
$('scatterD').oninput = e=>{ scatterDensity = Math.max(0, Math.min(1, +e.target.value/100)); $('scatterDVal').textContent = scatterDensity.toFixed(2); };
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
$('exportPly').onclick = ()=>{ const ply = exportPLY(edits, key, PALETTE); downloadBlob('voxel-world.ply', new Blob([ply], { type: 'text/plain' })); flash('已导出 PLY（'+edits.size+' 个方块）'); };
$('boundsBtn').onclick = ()=>{ const b = worldBounds(edits); if(!b){ flash('世界为空，无包围盒'); return; } flash('包围盒 ' + b.size.x + '×' + b.size.y + '×' + b.size.z + ' @(' + b.min.x + ',' + b.min.y + ',' + b.min.z + ')'); };
$('genTerrainBtn').onclick = ()=>{
  const seed = (Math.random() * 1e9) | 0;                  // 每次点击换种子
  const prev = snapshotEdits();                            // R2：地形生成纳入撤销
  const { edits: ter, minH, maxH, size } = genTerrain(seed, 48, key, PALETTE);
  for(const [k,v] of ter) edits.set(k, v);                 // 合并进当前编辑层
  recordUndo(prev);
  rebuildAll();
  flash('已生成地形 种子=' + seed + ' 尺寸=' + size + '×' + size + ' 高度[' + minH + ',' + maxH + ']');
};
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
