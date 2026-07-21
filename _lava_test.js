// VoxelForge 岩浆流动校验（纯逻辑，不依赖 Three.js/WebGL）：从 main.js 抽取真实 stepLava 源码执行并断言。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const stepLava = new Function(src.match(/function stepLava\([\s\S]*?\n}/)[0] + '\nreturn stepLava;')();

let fail = 0, pass = 0; const ok = (n, c) => c ? pass++ : (fail++, console.log('  FAIL', n));

// 工具：计算岩浆总体积（各列 表面y - 地形顶 之和）
const vol = (w, t) => { let v = 0; for(const [k, s] of w){ const [x, z] = k.split(',').map(Number); v += s - t(x, z); } return v; };
const emptyWater = new Map();
const emptyFlam = new Set();

// ---- 测试 1：平地大面积岩浆，体积守恒（流动不增不减）----
{
  const t = (x, z) => 0;
  let w = new Map();
  for(let x = 0; x < 5; x++) for(let z = 0; z < 5; z++) w.set(x + ',' + z, 6); // 25 列均匀深度 6
  const V0 = vol(w, t);
  for(let i = 0; i < 300; i++) w = stepLava(w, emptyWater, t, emptyFlam, 16).lava;
  const V1 = vol(w, t);
  ok('平地: 体积守恒(误差<=2)', Math.abs(V1 - V0) <= 2);
  ok('平地: 仍有岩浆', w.size > 0);
}

// ---- 测试 2：黏滞 —— 落差=1 不横向流动，落差>=2 才流动 ----
{
  // 落差=1：岩浆(0,0)表面5 地形4(深1)；邻居(1,0)地形4（干）→ gap=5-4=1 < LAVA_GAP(2)
  const t1 = (x, z) => (x === 0 ? 4 : (z === 0 && x === 1 ? 4 : 999));
  let w1 = new Map(); w1.set('0,0', 5);
  w1 = stepLava(w1, emptyWater, t1, emptyFlam, 16).lava;
  ok('黏滞: 落差=1 不向(1,0)流动', !w1.has('1,0') && w1.get('0,0') === 5);

  // 落差=2：岩浆(0,0)表面5 地形4(深1)；邻居(1,0)地形3 → gap=5-3=2 >=2
  const t2 = (x, z) => (x === 0 ? 4 : (z === 0 && x === 1 ? 3 : 999));
  let w2 = new Map(); w2.set('0,0', 5);
  w2 = stepLava(w2, emptyWater, t2, emptyFlam, 16).lava;
  ok('黏滞: 落差=2 向(1,0)流动', w2.has('1,0') && !w2.has('0,0'));
  ok('黏滞: 流动后(1,0)表面=4(深1)', w2.get('1,0') === 4);
}

// ---- 测试 3：顺坡下流，体积不增 ----
{
  const t = (x, z) => (z === 0 ? (8 - x) : 999);  // 一行斜坡：x=0 地形8 → x=6 地形2
  let w = new Map(); w.set('0,0', 10);             // (0,0) 表面10（地形8，深2）
  const V0 = vol(w, t);
  let everBottom = false;
  for(let i = 0; i < 300; i++){ w = stepLava(w, emptyWater, t, emptyFlam, 16).lava; if(w.has('6,0')) everBottom = true; }
  const V1 = vol(w, t);
  ok('斜坡: 岩浆流到最低列(6,0)', everBottom);
  ok('斜坡: 体积不增加(守恒/仅浮点泄漏)', V1 <= V0 + 1);
}

// ---- 测试 4：冷却 —— 岩浆邻接水 → 冷却成石、水被消耗 ----
{
  const t = (x, z) => 0;
  const water = new Map(); water.set('1,0', 2);   // 邻居(1,0)有水
  let w = new Map(); w.set('0,0', 5);             // 岩浆(0,0)表面5
  const r = stepLava(w, water, t, emptyFlam, 16);
  ok('冷却: 岩浆列(0,0)转为石头', r.stone.has('0,0'));
  ok('冷却: 岩浆从 lava 中移除', !r.lava.has('0,0'));
  ok('冷却: 邻接水(1,0)被消耗', r.waterConsumed.has('1,0'));
}

// ---- 测试 5：点燃 —— 岩浆邻接可燃物 → 该列被标记为焦黑 ----
{
  const t = (x, z) => 0;
  const flam = new Set(['1,0']);                  // 邻居(1,0)为可燃物（树木）
  let w = new Map(); w.set('0,0', 5);
  const r = stepLava(w, emptyWater, t, flam, 16);
  ok('点燃: 可燃物列(1,0)被标记为焦黑', r.charred.has('1,0'));
  ok('点燃: 岩浆自身保留', r.lava.has('0,0'));
}

console.log(`\n[VoxelForge lava] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
