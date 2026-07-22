// 测试：quincunx（五点梅花）笔刷 —— 纯函数 + 接线校验
const assert = require('assert');

// 从 main.js 中忠实移植纯函数（与生产实现保持一致）
const key = (x,y,z) => x + ',' + y + ',' + z;
const wkey = (x,z) => x + ',' + z;
const PALETTE = { stone: 0x8d949c };
const FALL = new Set();

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
function quincunxPoints(R){
  R = Math.max(1, R|0);
  return [[0,0],[R,R],[R,-R],[-R,R],[-R,-R]];
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

// 1) quincunxPoints 给出精确 5 点（花心 + 四角对角偏移）
assert.deepStrictEqual(quincunxPoints(1).sort(), [[0,0],[1,1],[1,-1],[-1,1],[-1,-1]].sort(), 'R=1 应为 5 点梅花');
assert.strictEqual(quincunxPoints(3).length, 5, '任意 R 均为 5 点');
assert.strictEqual(quincunxPoints(0).length, 5, 'R 下界保护：R=0 归为 1');

// 2) R=1 单层：恰好 5 个体素，坐标为花心 + 四角
{
  const edits = new Map();
  applyQuincunxBrush(edits, new Map(), new Map(), new Set(), 10, 20, 30, 'stone', 1, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, 5, 'R=1,H=1 应写入 5 个体素');
  const want = new Set(['10,20,30','11,20,31','11,20,29','9,20,31','9,20,29']);
  for(const k of edits.keys()) assert.ok(want.has(k), '意外坐标 ' + k);
}

// 3) 竖直拉伸 H 层：体素数 = 5 * H
{
  const edits = new Map();
  applyQuincunxBrush(edits, new Map(), new Map(), new Set(), 2, 5, 7, 'stone', 2, 4, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, 5 * 4, 'R=2,H=4 应写入 20 个体素');
}

// 4) 流体语义：笔刷为 water 时写入 waterCol 而非 edits
{
  const edits = new Map(), waterCol = new Map(), lavaCol = new Map();
  applyQuincunxBrush(edits, waterCol, lavaCol, new Set(), 0, 0, 0, 'water', 1, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, 0, 'water 笔刷不写 edits');
  assert.strictEqual(waterCol.size, 5, 'water 笔刷写 5 个水列');
}

// 5) 擦除幂等：apply 后再 erase 应清空对应体素（clearVoxel 将值置 null，键保留）
function solidCount(edits){ let n = 0; for(const v of edits.values()) if(v !== null) n++; return n; }
{
  const edits = new Map(), waterCol = new Map(), lavaCol = new Map(), falling = new Set();
  applyQuincunxBrush(edits, waterCol, lavaCol, falling, 0, 0, 0, 'stone', 2, 2, FALL, key, wkey, PALETTE);
  const before = solidCount(edits);
  eraseQuincunxBrush(edits, waterCol, lavaCol, falling, 0, 0, 0, 2, 2, key, wkey);
  assert.strictEqual(solidCount(edits), 0, '擦除后应为 0 个实体素');
  assert.strictEqual(before, 5 * 2, '擦除前应为 10 个实体素');
}

// 6) 接线校验：main.js / index.html 已正确接入 quincunx
const fs = require('fs');
const main = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
assert.ok(main.includes('function applyQuincunxBrush'), 'main.js 缺少 applyQuincunxBrush');
assert.ok(main.includes('function eraseQuincunxBrush'), 'main.js 缺少 eraseQuincunxBrush');
assert.ok(/else if\(brushShape === 'quincunx'\) applyQuincunxBrush/.test(main), 'dispatch apply 未接入 quincunx');
assert.ok(/else if\(brushShape === 'quincunx'\) eraseQuincunxBrush/.test(main), 'dispatch erase 未接入 quincunx');
assert.ok(main.includes("'笔刷形状：梅花(五点)'"), 'flash 缺少梅花标签');
assert.ok(html.includes('<option value="quincunx">梅花</option>'), 'index.html 缺少梅花选项');

console.log('quincunx 测试通过：6 组断言 OK');
