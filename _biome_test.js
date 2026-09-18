// VoxelForge 生物群系单元测试：从 main.js 抽取【真实生产函数】hash/fbm/heightAt/biomeAt/plantFor/voxelColor，
// 断言：确定性、值域、海拔/水岸门控、九群系可达性、空间连续性、植被密度/类型边界、
// voxelColor 分群系取色与编辑优先级、矿石带不受群系影响（房屋风格同 _terrain_test.js）。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
// brace 计数抽取（CRLF 免疫，同 _terrain_test.js 方法）
function extractFn(name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) throw new Error('找不到函数 ' + name);
  let depth = 0, i = src.indexOf('{', start);
  for(; i < src.length; i++){
    const c = src[i];
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(start, i+1); }
  }
  throw new Error('函数 ' + name + ' 括号不匹配');
}
function extractConstArrow(name){
  const m = src.match(new RegExp('const ' + name + ' = [^;]+;'));
  if(!m) throw new Error('找不到常量 ' + name);
  return m[0];
}
// 生产默认参数（main.js: let amp = 12 / SNOW_LINE = floor(amp*0.7)+4 / WATER = 2）
const amp = 12, SNOW_LINE = Math.floor(amp * 0.7) + 4, WATER = 2;
const PALETTE = {
  grass: 0x6ab04c, dirt: 0x8a5a2b, stone: 0x8d949c, iron: 0xb0b8c0, gold: 0xffd24a,
  diamond: 0x6ffcff, coal: 0x33373d, sand: 0xe2cf8a, gravel: 0x8a8d91,
  water: 0x3a7bd5, lava: 0xe05626, wood: 0x9c6b3f, leaf: 0x3f8f3f, snow: 0xeaf2f7, glowstone: 0xfff2a8,
  savanna: 0xb8b04a, jungle: 0x2f7d33, taiga: 0x5e7d6b, cactus: 0x4f9e4f
};
const code = [
  extractConstArrow('smooth'),
  extractConstArrow('lerp'),
  extractFn('hash'), extractFn('hash3'), extractFn('vnoise'), extractFn('vnoise3'),
  extractFn('fbm'), extractFn('fbm3'), extractFn('caveAt'), extractFn('heightAt'),
  extractFn('biomeAt'), extractFn('plantFor'), extractFn('voxelColor')
].join('\n');
// voxelColor 闭包依赖（edits/caveLinks/cavesOn/key）注入桩：cavesOn=false 关洞穴便于观测矿石带
function bake(){
  const edits = new Map(), caveLinks = new Map(), cavesOn = false;
  const key = (x,y,z)=> x + ',' + y + ',' + z;
  return new Function('amp','SNOW_LINE','WATER','PALETTE','edits','caveLinks','cavesOn','key',
    code + '\nreturn { hash, heightAt, biomeAt, plantFor, voxelColor, caveAt, setEdit:(k,v)=>edits.set(k,v) };')(
    amp, SNOW_LINE, WATER, PALETTE, edits, caveLinks, cavesOn, key);
}
const W = bake();
const { hash, heightAt, biomeAt, plantFor, voxelColor, caveAt, setEdit } = W;
const CLIMATES = ['desert','jungle','savanna','plains','forest','taiga','tundra'];
const BIOMES = new Set(['alpine','beach', ...CLIMATES]);
const key3 = (x,y,z)=> x + ',' + y + ',' + z;

// ---- A) biomeAt：确定性 + 值域 + h 传参等价 ----
ok('biomeAt 确定性', biomeAt(5, 9) === biomeAt(5, 9) && biomeAt(-37, 82) === biomeAt(-37, 82));
ok('biomeAt 值域：全部返回已知群系名', (()=>{
  for(let i = 0; i < 300; i++){
    const b = biomeAt(i * 13 - 400, i * 7 + 3);
    if(!BIOMES.has(b)) return false;
  }
  return true;
})());
ok('biomeAt h 显式传参与重算等价', (()=>{
  for(let i = 0; i < 50; i++){
    const x = i * 17 - 200, z = i * 11 - 150;
    if(biomeAt(x, z) !== biomeAt(x, z, heightAt(x, z))) return false;
  }
  return true;
})());

// ---- B) 门控逻辑（显式 h 注入；heightAt 自然值域 [4, amp+4]，beach 天然不可达故须注入观测）----
ok('h=SNOW_LINE → alpine', biomeAt(5, 9, SNOW_LINE) === 'alpine');
ok('h>SNOW_LINE → alpine', biomeAt(5, 9, SNOW_LINE + 7) === 'alpine');
ok('h=WATER+1 → beach', biomeAt(5, 9, WATER + 1) === 'beach');
ok('h<WATER → beach', biomeAt(5, 9, WATER - 1) === 'beach');
ok('h 负值越界仍 beach（门控先于气候场）', biomeAt(5, 9, -10) === 'beach');

// ---- C) 自然可达性：±300 全扫描，8 群系（除 beach）齐现 ----
const anchors = {};
{
  let alpineN = 0;
  for(let x = -300; x < 300; x++) for(let z = -300; z < 300; z++){
    const b = biomeAt(x, z);
    if(!(b in anchors)) anchors[b] = { x, z };
  }
  for(const b of CLIMATES) ok('自然扫描可达：' + b, b in anchors);
  ok('自然扫描可达：alpine（海拔门控 h≥SNOW_LINE）', 'alpine' in anchors);
  ok('自然扫描共 8 群系（beach 需 h≤WATER+1，heightAt≥4 天然排除）', Object.keys(anchors).length === 8);
}

// ---- D) 空间连续性：低频场群系大块分布，沿 200 格直线切换次数 ≤ 40（逐格噪声会 ~150 次）----
ok('群系空间连续（非逐格碎斑）', (()=>{
  let changes = 0, prev = biomeAt(0, 17);
  for(let x = 1; x < 200; x++){
    const b = biomeAt(x, 17);
    if(b !== prev){ changes++; prev = b; }
  }
  return changes <= 40;
})());

// ---- E) plantFor：确定性 + 类型/干高边界 + 裸地群系 + 密度语义 ----
ok('plantFor 确定性', JSON.stringify(plantFor('desert', 5, 9)) === JSON.stringify(plantFor('desert', 5, 9)));
{
  const a = anchors.desert;
  let allCactus = true;
  for(let dx = -40; dx <= 40; dx++) for(let dz = -40; dz <= 40; dz++){
    const p = plantFor('desert', a.x + dx, a.z + dz);
    if(p && p.kind !== 'cactus') allCactus = false;
  }
  ok('desert 区域植被全为仙人掌', allCactus);
}
ok('仙人掌干高 ∈ [2,3]', (()=>{
  const hs = [];
  for(let i = 0; i < 400; i++){ const p = plantFor('desert', i * 7, i * 3 + 1); if(p) hs.push(p.trunkH); }
  return hs.length > 0 && hs.every(h => h >= 2 && h <= 3);
})());
ok('plains 树干高 ∈ [3,5]', (()=>{
  const hs = [];
  for(let i = 0; i < 800; i++){ const p = plantFor('plains', i * 5, i * 9); if(p) hs.push(p.trunkH); }
  return hs.length > 0 && hs.every(h => h >= 3 && h <= 5);
})());
ok('jungle 树干高 ∈ [4,7]', (()=>{
  const hs = [];
  for(let i = 0; i < 800; i++){ const p = plantFor('jungle', i * 5, i * 9); if(p) hs.push(p.trunkH); }
  return hs.length > 0 && hs.every(h => h >= 4 && h <= 7);
})());
ok('pine 干高 ∈ [4,6]', (()=>{
  const hs = [];
  for(let i = 0; i < 800; i++){ const p = plantFor('taiga', i * 5, i * 9); if(p) hs.push(p.trunkH); }
  return hs.length > 0 && hs.every(h => h >= 4 && h <= 6);
})());
ok('beach/alpine/tundra 裸地无植被', (()=>{
  for(let i = 0; i < 20; i++){
    const x = i * 23 - 200, z = i * 31 + 5;
    if(plantFor('beach', x, z) !== null) return false;
    if(plantFor('alpine', x, z) !== null) return false;
    if(plantFor('tundra', x, z) !== null) return false;
  }
  return true;
})());
ok('plains 密度语义与旧版一致（hash(x,z)≤0.06 ⇔ 种树）', (()=>{
  for(let i = 0; i < 1000; i++){
    const x = i * 3 - 150, z = i * 7 + 2;
    if((plantFor('plains', x, z) !== null) !== (hash(x, z) <= 0.06)) return false;
  }
  return true;
})());
ok('savanna 稀疏（2000 采样 0 < 命中 ≤ 60）', (()=>{
  let n = 0;
  for(let i = 0; i < 2000; i++){ if(plantFor('savanna', i * 3, i * 11)) n++; }
  return n > 0 && n <= 60;
})());

// ---- E2) hash 修复回归 + 洞穴密度带 + 矿石全可达（本轮真缺陷守护）----
// 旧 hash 末步 (n^(n>>16)) 算术右移符号扩展使最高位自抵消，值域永远 ≤ 0.5：雪顶/金/钻石/煤
// 全部绝迹。此组断言防复发。
ok('hash 全值域（晶格样本 max>0.9 且 min<0.1）', (()=>{
  let mn = 1, mx = 0;
  for(let x = -200; x <= 200; x += 7) for(let z = -200; z <= 200; z += 5){
    const v = hash(x, z);
    if(v < mn) mn = v; if(v > mx) mx = v;
  }
  return mx > 0.9 && mn < 0.1;
})());
ok('caveAt 洞穴率带（石层采样空气率 ∈ [15%, 45%]）', (()=>{
  let air = 0, tot = 0;
  for(let x = -150; x < 150; x += 3) for(let z = -150; z < 150; z += 3){
    const h = heightAt(x, z);
    for(let y = h - 8; y < h - 2; y++){ tot++; if(caveAt(x, y, z)) air++; }
  }
  const r = air / tot;
  return r >= 0.15 && r <= 0.45;
})());
ok('矿石五色全可达（金/钻石/煤不再绝迹）', (()=>{
  const seen = new Set();
  for(let x = -100; x < 100; x += 2) for(let z = -100; z < 100; z += 2){
    const h = heightAt(x, z);
    for(let y = h - 10; y < h - 2; y++){
      const c = voxelColor(x, y, z);
      if(c !== null) seen.add(c);
    }
  }
  return seen.has(PALETTE.stone) && seen.has(PALETTE.iron) && seen.has(PALETTE.gold)
    && seen.has(PALETTE.diamond) && seen.has(PALETTE.coal);
})());

// ---- F) voxelColor 集成：分群系取色 + 亚表层 + 编辑优先 + 矿石带不受群系影响 ----
{
  const d = anchors.desert, hd = heightAt(d.x, d.z);
  ok('沙漠点表面 = sand', voxelColor(d.x, hd, d.z) === PALETTE.sand);
  ok('沙漠点亚表（y=h-2）= sand（沙层下探）', voxelColor(d.x, hd - 2, d.z) === PALETTE.sand);
  const t = anchors.tundra;
  ok('冻原点表面 = snow', voxelColor(t.x, heightAt(t.x, t.z), t.z) === PALETTE.snow);
  const p = anchors.plains, hp = heightAt(p.x, p.z);
  ok('平原点表面 = grass 且亚表 = dirt', voxelColor(p.x, hp, p.z) === PALETTE.grass && voxelColor(p.x, hp - 2, p.z) === PALETTE.dirt);
  ok('丛林/针叶/稀树草原表面取专色', voxelColor(anchors.jungle.x, heightAt(anchors.jungle.x, anchors.jungle.z), anchors.jungle.z) === PALETTE.jungle
    && voxelColor(anchors.taiga.x, heightAt(anchors.taiga.x, anchors.taiga.z), anchors.taiga.z) === PALETTE.taiga
    && voxelColor(anchors.savanna.x, heightAt(anchors.savanna.x, anchors.savanna.z), anchors.savanna.z) === PALETTE.savanna);
  const k = key3(d.x, hd, d.z);
  setEdit(k, 0x123456);
  ok('玩家编辑优先级不被群系破坏', voxelColor(d.x, hd, d.z) === 0x123456);
  const ORES = new Set([PALETTE.stone, PALETTE.iron, PALETTE.gold, PALETTE.diamond, PALETTE.coal]);
  ok('矿石带不受群系影响（沙漠点 y=h-6 ∈ 石/矿五色）', ORES.has(voxelColor(d.x, hd - 6, d.z)));
}

console.log(`[VoxelForge biome] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
