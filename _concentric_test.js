// ci334 测试：concentric（同心环）笔刷 —— 纯函数 + 接线校验
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
  return pts;
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

// 1) concentricPoints：R<2 只有中心；点无重复；环点满足 round(dist)==环半径
assert.strictEqual(concentricPoints(1).length, 1, 'R=1 只有中心');
assert.strictEqual(concentricPoints(0).length, 1, 'R 下界保护：R=0 归为 1 只有中心');
{
  const pts = concentricPoints(6);
  const set = new Set(pts.map(p=> p.join(',')));
  assert.strictEqual(set.size, pts.length, '点表无重复');
  for(const [dx,dz] of pts){
    if(dx === 0 && dz === 0) continue;
    const r = Math.round(Math.sqrt(dx*dx + dz*dz));
    assert.ok(r === 2 || r === 4 || r === 6, `环点半径应为偶数环: (${dx},${dz}) -> ${r}`);
  }
  // 对称性：(dx,dz) 在表中则 (-dx,-dz) 也在
  for(const [dx,dz] of pts) assert.ok(set.has((-dx) + ',' + (-dz)), '中心对称');
}
// R=2 与 R=3 应相同（奇数半径不加新环）
assert.deepStrictEqual(concentricPoints(3), concentricPoints(2), 'R=3 与 R=2 点表一致(奇数不加环)');
// R=4 点数 > R=2 点数（多一圈）
assert.ok(concentricPoints(4).length > concentricPoints(2).length, 'R=4 应多一圈');

// 2) R=2 单层：中心 + 一圈 r=2；含 (2,0)/(0,2)/(-2,0)/(0,-2)，不含 (1,0)
{
  const edits = new Map();
  applyConcentricBrush(edits, new Map(), new Map(), new Set(), 10, 20, 30, 'stone', 2, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, concentricPoints(2).length, '写入数 = 点表数');
  assert.ok(edits.has('10,20,30'), '含中心');
  assert.ok(edits.has('12,20,30') && edits.has('10,20,32') && edits.has('8,20,30') && edits.has('10,20,28'), '含 r=2 四正交点');
  assert.ok(!edits.has('11,20,30'), '不含 r=1 点(环间留空)');
}

// 3) H=3 竖直拉伸：体素数 = 点表数 * H
{
  const edits = new Map();
  const n = concentricPoints(2).length;
  applyConcentricBrush(edits, new Map(), new Map(), new Set(), 0, 5, 0, 'stone', 2, 3, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, n * 3, 'H=3 体素数 = 点表数*3');
  assert.ok(edits.has('0,5,0') && edits.has('0,7,0'), '含底层与顶层中心');
}

// 4) 掉落语义：sand 进 falling
{
  const falling = new Set(), edits = new Map();
  applyConcentricBrush(edits, new Map(), new Map(), falling, 0, 0, 0, 'sand', 2, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(falling.size, concentricPoints(2).length, 'sand 全部进 falling');
}

// 5) 流体语义：water 只写水柱不写 edits
{
  const water = new Map(), edits = new Map();
  applyConcentricBrush(edits, water, new Map(), new Set(), 0, 2, 0, 'water', 2, 1, FALL, key, wkey, PALETTE);
  assert.strictEqual(edits.size, 0, 'water 不写 edits');
  assert.strictEqual(water.size, concentricPoints(2).length, 'water 写水柱');
  assert.strictEqual(water.get('0,0'), 3, '水柱高度 y+1');
}

// 6) erase 对称：apply 后 erase，全部键置 null、falling 清空
{
  const edits = new Map(), falling = new Set();
  applyConcentricBrush(edits, new Map(), new Map(), falling, 3, 4, 5, 'sand', 4, 2, FALL, key, wkey, PALETTE);
  eraseConcentricBrush(edits, new Map(), new Map(), falling, 3, 4, 5, 4, 2, key, wkey);
  assert.ok([...edits.values()].every(v=> v === null), 'erase 后全部为 null');
  assert.strictEqual(falling.size, 0, 'falling 已清空');
}

// 7) 接线校验：main.js 与 index.html
{
  const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(main.includes('function concentricPoints(R)'), 'main.js 有 concentricPoints');
  assert.ok(main.includes('function applyConcentricBrush('), 'main.js 有 applyConcentricBrush');
  assert.ok(main.includes('function eraseConcentricBrush('), 'main.js 有 eraseConcentricBrush');
  assert.ok(main.includes("brushShape === 'concentric') applyConcentricBrush("), 'dispatch apply 已接线');
  assert.ok(main.includes("brushShape === 'concentric') eraseConcentricBrush("), 'dispatch erase 已接线');
  assert.ok(main.includes("'笔刷形状：同心环'"), 'flash 文案已接线');
  assert.ok(html.includes('<option value="concentric">同心环</option>'), 'index.html option 已接线');
  // 生产实现与测试移植一致性(点表逻辑)
  const m = main.match(/function concentricPoints\(R\)\{[\s\S]*?\n\}/);
  assert.ok(m, '可提取生产 concentricPoints');
  const prod = eval('(' + m[0] + ')');
  assert.deepStrictEqual(prod(6), concentricPoints(6), '生产/测试点表一致');
}

console.log('concentric: all assertions passed (7 组)');
