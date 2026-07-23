// ci342 测试：spiral（阿基米德螺线）笔刷 —— 纯函数 + 接线校验
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const key = (x,y,z) => x + ',' + y + ',' + z;
const wkey = (x,z) => x + ',' + z;
const PALETTE = { stone: 0x8d949c, sand: 0xd8c27a };
const FALL = new Set(['sand']);

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

// 1) spiralPoints：无重复；所有点半径 <= R；含中心；终点在轮缘附近
{
  const R = 6, pts = spiralPoints(R);
  const set = new Set(pts.map(p=> p.join(',')));
  assert.strictEqual(set.size, pts.length, '点表无重复');
  assert.ok(set.has('0,0'), '含中心');
  for(const [dx,dz] of pts){
    assert.ok(Math.sqrt(dx*dx + dz*dz) <= R + 0.75, `点不越界: (${dx},${dz})`);
  }
  const [lx, lz] = pts[pts.length - 1];
  assert.ok(Math.abs(Math.sqrt(lx*lx + lz*lz) - R) <= 1, '末点接近半径 R');
}
// R 下界保护 + 单调
assert.ok(spiralPoints(0).length >= 2, 'R=0 归为 1 至少 2 点');
assert.deepStrictEqual(spiralPoints(1), spiralPoints(0), 'R=1 与 R=0 一致');
assert.ok(spiralPoints(6).length > spiralPoints(3).length, 'R=6 应多于 R=3');
// 螺线是曲线不是圆盘：点数远小于实心圆盘体素数
assert.ok(spiralPoints(6).length < Math.PI * 6 * 6 * 0.8, '点数 << 实心圆盘(细曲线)');

// 2) R=4 单层写入：写入数 = 点表数，含中心
{
  const edits = new Map();
  applySpiralBrush(edits, new Map(), new Map(), new Set(), 10, 20, 30, 'stone', 4, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, spiralPoints(4).length, '写入数 = 点表数');
  assert.ok(edits.has('10,20,30'), '含中心');
}

// 3) H=2 竖直拉伸：体素数 = 点表数 * H
{
  const edits = new Map();
  const n = spiralPoints(3).length;
  applySpiralBrush(edits, new Map(), new Map(), new Set(), 0, 5, 0, 'stone', 3, 2, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, n * 2, 'H=2 体素数 = 点表数*2');
  assert.ok(edits.has('0,5,0') && edits.has('0,6,0'), '含底层与顶层中心');
}

// 4) 掉落语义：sand 进 falling
{
  const falling = new Set(), edits = new Map();
  applySpiralBrush(edits, new Map(), new Map(), falling, 0, 0, 0, 'sand', 3, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(falling.size, spiralPoints(3).length, 'sand 全部进 falling');
}

// 5) 流体语义：water 只写水柱不写 edits
{
  const water = new Map(), edits = new Map();
  applySpiralBrush(edits, water, new Map(), new Set(), 0, 2, 0, 'water', 3, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, 0, 'water 不写 edits');
  assert.strictEqual(water.size, spiralPoints(3).length, 'water 写水柱');
  assert.strictEqual(water.get('0,0'), 3, '水柱高度 y+1');
}

// 6) erase 对称：apply 后 erase，全部键置 null、falling 清空
{
  const edits = new Map(), falling = new Set();
  applySpiralBrush(edits, new Map(), new Map(), falling, 3, 4, 5, 'sand', 4, 2, FALL, key, wkey, PALETTE);
  eraseSpiralBrush(edits, new Map(), new Map(), falling, 3, 4, 5, 4, 2, key, wkey);
  assert.ok([...edits.values()].every(v=> v === null), 'erase 后全部为 null');
  assert.strictEqual(falling.size, 0, 'falling 已清空');
}

// 7) 接线校验：main.js 与 index.html
{
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(main.includes('function spiralPoints(R)'), 'main.js 有 spiralPoints');
  assert.ok(main.includes('function applySpiralBrush('), 'main.js 有 applySpiralBrush');
  assert.ok(main.includes('function eraseSpiralBrush('), 'main.js 有 eraseSpiralBrush');
  assert.ok(main.includes("brushShape === 'spiral') applySpiralBrush("), 'dispatch apply 已接线');
  assert.ok(main.includes("brushShape === 'spiral') eraseSpiralBrush("), 'dispatch erase 已接线');
  assert.ok(main.includes("'笔刷形状：螺线(平面)'"), 'flash 文案已接线');
  assert.ok(html.includes('<option value="spiral">螺线(平面)</option>'), 'index.html option 已接线');
  const m = main.match(/function spiralPoints\(R\)\{[\s\S]*?\n\}/);
  assert.ok(m, '可提取生产 spiralPoints');
  const prod = eval('(' + m[0] + ')');
  assert.deepStrictEqual(prod(6), spiralPoints(6), '生产/测试点表一致');
}

console.log('spiral: all assertions passed (7 组)');
