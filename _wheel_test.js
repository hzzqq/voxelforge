// ci338 测试：wheel（车轮/辐条）笔刷 —— 纯函数 + 接线校验
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 从 main.js 中忠实移植纯函数（与生产实现保持一致）
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
function wheelPoints(R){
  R = Math.max(1, R|0);
  const pts = [], seen = new Set();
  const add = (dx,dz)=>{ const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx,dz]); } };
  add(0, 0);
  for(let dx=-R; dx<=R; dx++){
    for(let dz=-R; dz<=R; dz++){
      if(Math.round(Math.sqrt(dx*dx + dz*dz)) === R) add(dx, dz);
    }
  }
  for(let t=1; t<R; t++){
    add(t, 0); add(-t, 0); add(0, t); add(0, -t);
    const d = Math.round(t / Math.SQRT2);
    add(d, d); add(-d, d); add(d, -d); add(-d, -d);
  }
  return pts;
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

// 1) wheelPoints：无重复；轮辋点满足 round(dist)==R；辐条点在轴向或对角线上
{
  const R = 6, pts = wheelPoints(R);
  const set = new Set(pts.map(p=> p.join(',')));
  assert.strictEqual(set.size, pts.length, '点表无重复');
  for(const [dx,dz] of pts){
    if(dx === 0 && dz === 0) continue;
    const r = Math.round(Math.sqrt(dx*dx + dz*dz));
    const onRim = r === R;
    const onAxis = dx === 0 || dz === 0;
    const onDiag = Math.abs(dx) === Math.abs(dz);
    assert.ok(onRim || onAxis || onDiag, `点应在轮辋/轴向/对角: (${dx},${dz})`);
  }
  // 中心对称
  for(const [dx,dz] of pts) assert.ok(set.has((-dx) + ',' + (-dz)), '中心对称');
  // 含中心 + 四正交轮辋点 + 辐条中点
  assert.ok(set.has('0,0') && set.has(String(R) + ',0') && set.has('0,' + R), '含中心与轮辋正交点');
  assert.ok(set.has('3,0') && set.has('0,-3'), '含轴向辐条中段');
}
// R 下界保护：R=0/1 → 中心 + r=1 轮辋（无辐条段）
assert.ok(wheelPoints(0).length >= 5, 'R=0 归为 1：中心+r=1 环');
assert.deepStrictEqual(wheelPoints(1), wheelPoints(0), 'R=1 与 R=0 一致');
// R 越大点越多
assert.ok(wheelPoints(6).length > wheelPoints(4).length, 'R=6 应多于 R=4');

// 2) R=4 单层写入：写入数 = 点表数；含中心/轮辋/辐条；不含非辐条内圈点
{
  const edits = new Map();
  applyWheelBrush(edits, new Map(), new Map(), new Set(), 10, 20, 30, 'stone', 4, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, wheelPoints(4).length, '写入数 = 点表数');
  assert.ok(edits.has('10,20,30'), '含中心');
  assert.ok(edits.has('14,20,30') && edits.has('10,20,34'), '含轮辋正交点');
  assert.ok(edits.has('12,20,30'), '含轴向辐条点');
  assert.ok(!edits.has('11,20,32'), '不含非辐条内圈点 (1,2)');
}

// 3) H=3 竖直拉伸：体素数 = 点表数 * H
{
  const edits = new Map();
  const n = wheelPoints(3).length;
  applyWheelBrush(edits, new Map(), new Map(), new Set(), 0, 5, 0, 'stone', 3, 3, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, n * 3, 'H=3 体素数 = 点表数*3');
  assert.ok(edits.has('0,5,0') && edits.has('0,7,0'), '含底层与顶层中心');
}

// 4) 掉落语义：sand 进 falling
{
  const falling = new Set(), edits = new Map();
  applyWheelBrush(edits, new Map(), new Map(), falling, 0, 0, 0, 'sand', 3, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(falling.size, wheelPoints(3).length, 'sand 全部进 falling');
}

// 5) 流体语义：water 只写水柱不写 edits
{
  const water = new Map(), edits = new Map();
  applyWheelBrush(edits, water, new Map(), new Set(), 0, 2, 0, 'water', 3, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, 0, 'water 不写 edits');
  assert.strictEqual(water.size, wheelPoints(3).length, 'water 写水柱');
  assert.strictEqual(water.get('0,0'), 3, '水柱高度 y+1');
}

// 6) erase 对称：apply 后 erase，全部键置 null、falling 清空
{
  const edits = new Map(), falling = new Set();
  applyWheelBrush(edits, new Map(), new Map(), falling, 3, 4, 5, 'sand', 4, 2, FALL, key, wkey, PALETTE);
  eraseWheelBrush(edits, new Map(), new Map(), falling, 3, 4, 5, 4, 2, key, wkey);
  assert.ok([...edits.values()].every(v=> v === null), 'erase 后全部为 null');
  assert.strictEqual(falling.size, 0, 'falling 已清空');
}

// 7) 接线校验：main.js 与 index.html
{
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(main.includes('function wheelPoints(R)'), 'main.js 有 wheelPoints');
  assert.ok(main.includes('function applyWheelBrush('), 'main.js 有 applyWheelBrush');
  assert.ok(main.includes('function eraseWheelBrush('), 'main.js 有 eraseWheelBrush');
  assert.ok(main.includes("brushShape === 'wheel') applyWheelBrush("), 'dispatch apply 已接线');
  assert.ok(main.includes("brushShape === 'wheel') eraseWheelBrush("), 'dispatch erase 已接线');
  assert.ok(main.includes("'笔刷形状：车轮(辐条)'"), 'flash 文案已接线');
  assert.ok(html.includes('<option value="wheel">车轮(辐条)</option>'), 'index.html option 已接线');
  // 生产实现与测试移植一致性(点表逻辑)
  const m = main.match(/function wheelPoints\(R\)\{[\s\S]*?\n\}/);
  assert.ok(m, '可提取生产 wheelPoints');
  const prod = eval('(' + m[0] + ')');
  assert.deepStrictEqual(prod(6), wheelPoints(6), '生产/测试点表一致');
}

console.log('wheel: all assertions passed (7 组)');
