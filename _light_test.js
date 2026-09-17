// VoxelForge 光照烘焙单元测试：从 main.js 抽取 bakeLight / blockLightAt /
// collectGlowSources / lightFactor 纯函数，在隔离环境中断言 BFS 传播不变量
// （源等级、逐格衰减、实心阻挡、多源取亮、规模兜底、采光邻接、系数映射）。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
// brace 计数抽取（CRLF 免疫，同 _brush_test.js 方法）
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
// LIGHT_MAX / LIGHT_MIN_FACTOR 常量一并抽出求值
function extractConst(name){
  const m = src.match(new RegExp('const ' + name + ' = ([0-9.]+);'));
  if(!m) throw new Error('找不到常量 ' + name);
  return +m[1];
}
const LIGHT_MAX = extractConst('LIGHT_MAX');
const LIGHT_MIN_FACTOR = extractConst('LIGHT_MIN_FACTOR');
const bakeLight = eval('(' + extractFn('bakeLight') + ')');
const blockLightAt = eval('(' + extractFn('blockLightAt') + ')');
const collectGlowSources = eval('(' + extractFn('collectGlowSources') + ')');
const lightFactor = eval('(' + extractFn('lightFactor') + ')');
const key = (x,y,z)=> x + ',' + y + ',' + z;

// 构造：3D 实心判定（与 edits Map 一致——Map 中非 null 即实心）
function makeWorld(solidSet){
  return (x,y,z)=> solidSet.has(key(x,y,z));
}

// ---- 1) bakeLight 基本传播 ----
{
  // 单光源在原点，全空间空气
  const solid = new Set([key(0,0,0)]);           // 光源本身是实心萤石
  const lm = bakeLight([{x:0,y:0,z:0}], makeWorld(solid), key);
  ok('光源格 = 15', lm.get(key(0,0,0)) === LIGHT_MAX);
  ok('相邻空气 = 14', lm.get(key(1,0,0)) === LIGHT_MAX - 1);
  ok('距离2空气 = 13', lm.get(key(2,0,0)) === LIGHT_MAX - 2);
  ok('曼哈顿衰减：对角(1,1,0) = 13', lm.get(key(1,1,0)) === LIGHT_MAX - 2);
  ok('传播半径 15 处 = 0（不写入）', lm.get(key(15,0,0)) === undefined && lm.get(key(14,0,0)) === 1);
}

// ---- 2) 实心阻挡：完整墙平面后无光（单格墙会绕射，需整面墙）----
{
  const solid = new Set([key(0,0,0)]);
  for(let y = -16; y <= 16; y++) for(let z = -16; z <= 16; z++) solid.add(key(1, y, z));   // x=1 整面墙
  const lm = bakeLight([{x:0,y:0,z:0}], makeWorld(solid), key);
  ok('墙内(1,0,0)无光照', lm.get(key(1,0,0)) === undefined);
  ok('墙后(2,0,0)无光照', lm.get(key(2,0,0)) === undefined);
  ok('墙后远处(5,0,0)无光照', lm.get(key(5,0,0)) === undefined);
  ok('墙前(-1,0,0)正常照亮 = 14', lm.get(key(-1,0,0)) === LIGHT_MAX - 1);
}

// ---- 3) 多源取亮 ----
{
  const solid = new Set([key(0,0,0), key(10,0,0)]);
  const lm = bakeLight([{x:0,y:0,z:0},{x:10,y:0,z:0}], makeWorld(solid), key);
  ok('双源中点(5,0,0) = 10（各距5，15-5=10）', lm.get(key(5,0,0)) === LIGHT_MAX - 5);
  const lm2 = bakeLight([{x:0,y:0,z:0},{x:2,y:0,z:0}], makeWorld(new Set([key(0,0,0), key(2,0,0)])), key);
  ok('重叠区(1,0,0)取最高 = 14（与两源都相邻）', lm2.get(key(1,0,0)) === LIGHT_MAX - 1);
}

// ---- 4) 零光源快速路径 ----
{
  const lm = bakeLight([], makeWorld(new Set()), key);
  ok('零光源返回空 Map', lm instanceof Map && lm.size === 0);
  const lm2 = bakeLight(null, makeWorld(new Set()), key);
  ok('null 源不抛错且返回空 Map', lm2 instanceof Map && lm2.size === 0);
}

// ---- 5) maxCells 规模兜底 ----
{
  const lm = bakeLight([{x:0,y:0,z:0}], makeWorld(new Set()), key, LIGHT_MAX, 10);
  ok('maxCells=10 时 Map 不超过 10', lm.size <= 10);
}

// ---- 6) blockLightAt 采光：实心块取邻域最大 ----
{
  const lm = new Map([[key(1,0,0), 12], [key(0,1,0), 7]]);
  ok('采光取 6 邻最大 = 12', blockLightAt(0,0,0, lm, key) === 12);
  const lm2 = new Map();
  ok('无光照邻域 = 0', blockLightAt(0,0,0, lm2, key) === 0);
  // 邻域里有实心萤石光源(15)：采光应取到光源格
  const lm3 = new Map([[key(2,0,0), 15]]);
  ok('邻域光源格 15 可被直接采光', blockLightAt(1,0,0, lm3, key) === 15);
}

// ---- 7) collectGlowSources ----
{
  const edits = new Map();
  edits.set(key(3,4,5), 0xfff2a8);   // 萤石
  edits.set(key(6,7,8), 0x8d949c);   // 石头
  edits.set(key(9,10,11), 0xfff2a8); // 另一块萤石
  const srcs = collectGlowSources(edits, 0xfff2a8);
  ok('收集 2 个萤石源', srcs.length === 2);
  ok('源坐标解析正确', srcs.some(s => s.x===3 && s.y===4 && s.z===5) && srcs.some(s => s.x===9 && s.y===10 && s.z===11));
  ok('空 edits 零源', collectGlowSources(new Map(), 0xfff2a8).length === 0);
}

// ---- 8) lightFactor 系数映射 ----
{
  ok('0 光 → LIGHT_MIN_FACTOR', Math.abs(lightFactor(0) - LIGHT_MIN_FACTOR) < 1e-9);
  ok('满光 → 1', Math.abs(lightFactor(LIGHT_MAX) - 1) < 1e-9);
  ok('半光 → 中点', Math.abs(lightFactor(LIGHT_MAX/2) - (LIGHT_MIN_FACTOR + (1-LIGHT_MIN_FACTOR)/2)) < 1e-9);
  ok('越界钳制：-5 → 0 光系数', Math.abs(lightFactor(-5) - LIGHT_MIN_FACTOR) < 1e-9);
  ok('越界钳制：99 → 1', Math.abs(lightFactor(99) - 1) < 1e-9);
}

// ---- 9) 场景级不变量：萤石洞穴照明（开放空间逐格衰减，深处趋暗）----
{
  const solid = new Set([key(0,0,0)]);   // 萤石在原点，其余全为空气
  const lm = bakeLight([{x:0,y:0,z:0}], makeWorld(solid), key);
  ok('通道中部(8,0,0) = 7', lm.get(key(8,0,0)) === LIGHT_MAX - 8);
  ok('衰减极限(14,0,0) = 1（半径 14 格）', lm.get(key(14,0,0)) === 1);
  ok('半径外(15,0,0)无光', lm.get(key(15,0,0)) === undefined);
  // 实心壁块采光：位于(5,1,0)的壁块邻接(5,0,0)空气光 15-5=10
  ok('壁块(5,1,0)采光 = 10', blockLightAt(5,1,0, lm, key) === 10);
  ok('远处壁块(13,1,0)采光 = 2', blockLightAt(13,1,0, lm, key) === 2);
}

console.log(`[VoxelForge lightBake] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
