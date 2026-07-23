// ci330 测试：xcross（X形对角）笔刷 —— 纯函数 + 接线校验
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
function xcrossPoints(R){
  R = Math.max(1, R|0);
  const pts = [[0,0]];
  for(let d=1; d<=R; d++) pts.push([d,d],[d,-d],[-d,d],[-d,-d]);
  return pts;
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

// 1) xcrossPoints：4R+1 个点，全部满足 |dx|==|dz|
assert.strictEqual(xcrossPoints(1).length, 5, 'R=1 应为 5 点');
assert.strictEqual(xcrossPoints(3).length, 13, 'R=3 应为 13 点(4R+1)');
assert.strictEqual(xcrossPoints(0).length, 5, 'R 下界保护：R=0 归为 1');
assert.ok(xcrossPoints(4).every(([dx,dz])=> Math.abs(dx) === Math.abs(dz)), '所有点满足 |dx|==|dz|');
{
  const set = new Set(xcrossPoints(5).map(p=> p.join(',')));
  assert.strictEqual(set.size, 21, 'R=5 点无重复(21 点)');
}

// 2) R=2 单层：恰好 9 个体素，中心 + 四臂各 2
{
  const edits = new Map();
  applyXcrossBrush(edits, new Map(), new Map(), new Set(), 10, 20, 30, 'stone', 2, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, 9, 'R=2,H=1 应写入 9 个体素');
  assert.ok(edits.has('10,20,30'), '含中心');
  assert.ok(edits.has('12,20,32') && edits.has('8,20,28') && edits.has('12,20,28') && edits.has('8,20,32'), '含四臂末端');
  assert.ok(!edits.has('11,20,30') && !edits.has('10,20,31'), '不含正交轴点(区别于十字 cross)');
}

// 3) H=3 竖直拉伸：体素数 = (4R+1)*H
{
  const edits = new Map();
  applyXcrossBrush(edits, new Map(), new Map(), new Set(), 0, 5, 0, 'stone', 1, 3, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, 15, 'R=1,H=3 应写入 15 个体素');
  assert.ok(edits.has('0,5,0') && edits.has('0,7,0'), '含底层与顶层中心');
}

// 4) 掉落语义：sand 进 falling
{
  const falling = new Set(), edits = new Map();
  applyXcrossBrush(edits, new Map(), new Map(), falling, 0, 0, 0, 'sand', 1, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(falling.size, 5, 'sand 全部进 falling');
}

// 5) 流体语义：water 只写水柱不写 edits
{
  const water = new Map(), edits = new Map();
  applyXcrossBrush(edits, water, new Map(), new Set(), 0, 2, 0, 'water', 1, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, 0, 'water 不写 edits');
  assert.strictEqual(water.size, 5, 'water 写 5 个水柱');
  assert.strictEqual(water.get('0,0'), 3, '水柱高度 y+1');
}

// 6) erase 对称：apply 后 erase，全部键置 null、falling 清空
{
  const edits = new Map(), falling = new Set();
  applyXcrossBrush(edits, new Map(), new Map(), falling, 3, 4, 5, 'sand', 2, 2, FALL, key, wkey, PALETTE);
  eraseXcrossBrush(edits, new Map(), new Map(), falling, 3, 4, 5, 2, 2, key, wkey);
  assert.ok([...edits.values()].every(v=> v === null), 'erase 后全部为 null');
  assert.strictEqual(falling.size, 0, 'falling 已清空');
}

// 7) 接线校验：main.js 与 index.html
{
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(main.includes('function xcrossPoints(R)'), 'main.js 有 xcrossPoints');
  assert.ok(main.includes('function applyXcrossBrush('), 'main.js 有 applyXcrossBrush');
  assert.ok(main.includes('function eraseXcrossBrush('), 'main.js 有 eraseXcrossBrush');
  assert.ok(main.includes("brushShape === 'xcross') applyXcrossBrush("), 'dispatch apply 已接线');
  assert.ok(main.includes("brushShape === 'xcross') eraseXcrossBrush("), 'dispatch erase 已接线');
  assert.ok(main.includes("'笔刷形状：X形对角'"), 'flash 文案已接线');
  assert.ok(html.includes('<option value="xcross">X形对角</option>'), 'index.html option 已接线');
  // 生产实现与测试移植一致性(点表逻辑)
  const m = main.match(/function xcrossPoints\(R\)\{[\s\S]*?\n\}/);
  assert.ok(m, '可提取生产 xcrossPoints');
  const prod = eval('(' + m[0] + ')');
  assert.deepStrictEqual(prod(3), xcrossPoints(3), '生产/测试点表一致');
}

console.log('xcross: all assertions passed (7 组)');
