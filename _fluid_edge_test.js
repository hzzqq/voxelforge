// VoxelForge 流体 CA 边界测试：从 main.js 抽取真实 stepWater / stepLava，
// 覆盖既往 _water/_lava_test 未及的边界：超深钳制、排空语义、自定义 maxDepth/gap、
// 多邻居余数分配守恒（含超排封顶）、冷却优先于点燃的顺序耦合。
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
function extractConst(name){
  const m = src.match(new RegExp('const ' + name + ' = ([0-9]+);'));
  if(!m) throw new Error('找不到常量 ' + name);
  return +m[1];
}
const MAX_WATER_DEPTH = extractConst('MAX_WATER_DEPTH');
const bake = new Function('MAX_WATER_DEPTH',
  extractFn('stepWater') + '\n' + extractFn('stepLava') +
  '\nreturn { stepWater, stepLava };');
const { stepWater, stepLava } = bake(MAX_WATER_DEPTH);
const key = (x,z)=> x + ',' + z;
const flat = tn => ()=> tn;   // 全平地地形函数
// 封闭盆地：3x3 内低外高——观测「钳制」必须先杜绝流动摊薄，开放地形测不到钳制
const basin = (inner, wall)=> (x,z)=> (x>=-1 && x<=1 && z>=-1 && z<=1) ? inner : wall;

// ---- 1) stepWater：超深列钳制到 tn+MAX_WATER_DEPTH ----
{
  const t = basin(10, 50);
  const w = new Map();
  for(let x = -1; x <= 1; x++) for(let z = -1; z <= 1; z++) w.set(key(x,z), 10 + 20);   // depth 20 > 16
  const next = stepWater(w, t);
  let allClamped = true;
  for(let x = -1; x <= 1; x++) for(let z = -1; z <= 1; z++){
    if(next.get(key(x,z)) !== 10 + MAX_WATER_DEPTH) allClamped = false;
  }
  ok('超深水(20)钳制到 tn+16（封闭盆地不外流）', allClamped && next.size === 9);
}

// ---- 2) stepWater：自定义 maxDepth 钳制 ----
{
  const t = basin(10, 50);
  const w = new Map();
  for(let x = -1; x <= 1; x++) for(let z = -1; z <= 1; z++) w.set(key(x,z), 10 + 20);
  const next = stepWater(w, t, 3);
  ok('自定义 maxDepth=3 钳制到 tn+3', next.size === 9 && next.get(key(0,0)) === 13);
}

// ---- 3) stepWater：源列排空语义（s <= tn 不入 next）----
{
  const w = new Map([[key(0,0), 11]]);   // depth 1，四周地形 10（更低，成为 lowers）
  const next = stepWater(w, flat(10));
  ok('源列流干后从 next 排空', !next.has(key(0,0)));
  const nb = [key(1,0), key(-1,0), key(0,1), key(0,-1)].filter(k => next.has(k));
  ok('水体迁移到 1 个邻居列', nb.length === 1 && next.get(nb[0]) === 11);
}

// ---- 4) stepWater：空 Map 快速路径 ----
{
  const next = stepWater(new Map(), flat(10));
  ok('空水 Map 返回空 Map', next instanceof Map && next.size === 0);
}

// ---- 5) stepWater：多邻居余数分配 + 超排封顶 → 体积严格守恒 ----
{
  // 中心 depth 3（表面13）；四邻地形 8/10/8/10 全为更低。
  // 修复前：out = 13 - floor(49/5) = 4 > 实有 3，凭空多排 1（体积 3→4）。
  // 修复后：out 封顶为实有 3，体积 3→3。
  const t = (x,z)=> (x === 1 || z === 1) ? 8 : 10;
  const w = new Map([[key(0,0), 13]]);
  const next = stepWater(w, t);
  const vol = [...next.entries()].reduce((acc,[k,s])=>{
    const [x,z] = k.split(',').map(Number);
    return acc + (s - t(x,z));
  }, 0);
  ok('超排封顶后体积守恒（before=3, after=3）', vol === 3);
  ok('源列排空', !next.has(key(0,0)));
  ok('低地(1,0)与(0,1)各得 1 深', next.get(key(1,0)) === 9 && next.get(key(0,1)) === 9);
}

// ---- 6) stepLava：自定义 gap=0（关闭黏滞，落差 1 也流）----
{
  const r = stepLava(new Map([[key(0,0), 11]]), new Map(), flat(10), new Set(), 16, 0);
  ok('gap=0 时落差 1 向低处流动', r.lava.has(key(1,0)) || r.lava.has(key(-1,0)) || r.lava.has(key(0,1)) || r.lava.has(key(0,-1)));
}

// ---- 7) stepLava：默认 gap=2 与自定义 gap=9（落差 1/2 均不流）----
{
  const r = stepLava(new Map([[key(0,0), 11]]), new Map(), flat(10), new Set());   // 落差 1
  ok('默认 gap=2：落差 1 不流动', r.lava.get(key(0,0)) === 11 && r.lava.size === 1);
  const r2 = stepLava(new Map([[key(0,0), 12]]), new Map(), flat(10), new Set(), 16, 9);   // 落差 2
  ok('gap=9：落差 2 不流动', r2.lava.get(key(0,0)) === 12 && r2.lava.size === 1);
}

// ---- 8) stepLava：maxDepth 钳制（封闭盆地防流动摊薄）----
{
  const t = basin(10, 50);
  const lava = new Map();
  for(let x = -1; x <= 1; x++) for(let z = -1; z <= 1; z++) lava.set(key(x,z), 30);
  const r = stepLava(lava, new Map(), t, new Set(), 5);
  ok('深岩浆钳制到 tn+maxDepth(5)', r.lava.size === 9 && r.lava.get(key(0,0)) === 15);
  const r2 = stepLava(lava, new Map(), t, new Set());
  ok('默认钳制到 tn+MAX_WATER_DEPTH', r2.lava.get(key(0,0)) === 10 + MAX_WATER_DEPTH);
}

// ---- 9) stepLava：冷却优先于点燃（顺序耦合）——被冷却的岩浆列不点燃邻居 ----
// 落差 1 < 默认 gap 2：岩浆不流动，纯冷却/点燃场景。
{
  const lava = new Map([[key(0,0), 11]]);
  const water = new Map([[key(1,0), 10]]);          // (1,0) 有水 → (0,0) 冷却
  const flammable = new Set([key(0,1)]);            // (0,1) 是可燃物，本应被 (0,0) 点燃
  const r = stepLava(lava, water, flat(10), flammable);
  ok('邻水岩浆冷却成石头', r.stone.has(key(0,0)));
  ok('水被消耗', r.waterConsumed.has(key(1,0)));
  ok('冷却列从 lava 移除', !r.lava.has(key(0,0)));
  ok('已冷却列不点燃邻居（点燃只遍历存活的 next）', r.charred.size === 0);
  // 对照组：无水时同位置可燃物被点燃
  const r2 = stepLava(new Map([[key(0,0), 11]]), new Map(), flat(10), flammable);
  ok('无水对照：可燃物被点燃', r2.charred.has(key(0,1)));
  ok('无水对照：岩浆保留', r2.lava.has(key(0,0)));
}

// ---- 10) stepLava：多列同时冷却，stone 数量正确 ----
{
  const lava = new Map([[key(0,0), 11], [key(5,5), 11]]);
  const water = new Map([[key(1,0), 10], [key(6,5), 10]]);
  const r = stepLava(lava, water, flat(10), new Set());
  ok('两列同时冷却，stone.size=2', r.stone.size === 2 && r.stone.has(key(0,0)) && r.stone.has(key(5,5)));
  ok('两列水均被消耗', r.waterConsumed.size === 2);
}

console.log(`[VoxelForge fluidEdge] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
