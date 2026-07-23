// ci378..ci394 测试：dome / diamond / cone / stairs / arch 五个笔刷 —— 单一真相源(xxxPoints + xxxInside) + apply/erase 接线校验。
// 仿 _wheel_test.js：纯函数内联移植 + 从 main.js 文本做接线/真相源校验(并 eval 提取生产函数与测试副本逐值比对)。
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ---- 通用辅助(与 main.js writeVoxel/clearVoxel 语义一致) ----
const key = (x, y, z) => x + ',' + y + ',' + z;
const wkey = (x, z) => x + ',' + z;
const PALETTE = { stone: 0x8d949c, sand: 0xd8c27a, water: 0x2a6fdb, lava: 0xff5500 };
const FALL = new Set(['sand']);

function writeVoxel(edits, waterCol, lavaCol, falling, x, y, z, brush, FALLv, key, wkey, PALETTEv){
  const k = key(x, y, z), wk = wkey(x, z);
  if(brush === 'lava'){ lavaCol.set(wk, y + 1); return; }
  if(brush === 'water'){ waterCol.set(wk, y + 1); return; }
  edits.set(k, PALETTEv[brush]);
  if(FALLv.has(brush)) falling.add(k);
}
function clearVoxel(edits, waterCol, lavaCol, falling, x, y, z, key, wkey){
  const k = key(x, y, z), wk = wkey(x, z);
  if(waterCol.has(wk) && waterCol.get(wk) === y + 1) waterCol.delete(wk);
  if(lavaCol.has(wk) && lavaCol.get(wk) === y + 1) lavaCol.delete(wk);
  edits.set(k, null);
  falling.delete(k);
}

// ===================== 内联纯函数(与 main.js 生产实现保持一致) =====================
// ---- dome ----
function domePoints(R){
  R = Math.max(1, R | 0);
  const pts = [], seen = new Set();
  const add = (dx, dz) => { const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx, dz]); } };
  for(let dx = -R; dx <= R; dx++) for(let dz = -R; dz <= R; dz++){
    if(dx * dx + dz * dz <= R * R) add(dx, dz);
  }
  return pts;
}
function domeInside(dx, dz, dy, R, H){
  R = Math.max(1, R | 0); H = Math.max(1, H | 0);
  if(dy < 0) return false;
  const d2 = dx * dx + dz * dz;
  if(d2 > R * R) return false;
  const h = Math.round(Math.sqrt(R * R - d2));
  return dy <= h;
}
function applyDomeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius | 0);
  const pts = domePoints(R);
  for(let dy = 0; dy <= R; dy++){ const y = ny + dy;
    for(const [dx, dz] of pts){
      if(!domeInside(dx, dz, dy, R, 1)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx + dx, y, nz + dz, brush, FALL, key, wkey, PALETTE);
    }
  }
}
function eraseDomeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const R = Math.max(1, radius | 0);
  const pts = domePoints(R);
  for(let dy = 0; dy <= R; dy++){ const y = ny + dy;
    for(const [dx, dz] of pts){
      if(!domeInside(dx, dz, dy, R, 1)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx + dx, y, nz + dz, key, wkey);
    }
  }
}

// ---- diamond ----
function diamondPoints(R){
  R = Math.max(1, R | 0);
  const pts = [], seen = new Set();
  const add = (dx, dz) => { const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx, dz]); } };
  for(let dx = -R; dx <= R; dx++) for(let dz = -R; dz <= R; dz++){
    if(Math.abs(dx) + Math.abs(dz) <= R) add(dx, dz);
  }
  return pts;
}
function diamondInside(dx, dz, dy, R, H){
  R = Math.max(1, R | 0); H = Math.max(1, H | 0);
  if(Math.abs(dy) > R) return false;
  return Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= R;
}
function applyDiamondBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius | 0);
  const pts = diamondPoints(R);
  for(let dy = -R; dy <= R; dy++){ const y = ny + dy;
    for(const [dx, dz] of pts){
      if(!diamondInside(dx, dz, dy, R, 1)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx + dx, y, nz + dz, brush, FALL, key, wkey, PALETTE);
    }
  }
}
function eraseDiamondBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const R = Math.max(1, radius | 0);
  const pts = diamondPoints(R);
  for(let dy = -R; dy <= R; dy++){ const y = ny + dy;
    for(const [dx, dz] of pts){
      if(!diamondInside(dx, dz, dy, R, 1)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx + dx, y, nz + dz, key, wkey);
    }
  }
}

// ---- cone ----
function conePoints(R){
  R = Math.max(1, R | 0);
  const pts = [], seen = new Set();
  const add = (dx, dz) => { const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx, dz]); } };
  for(let dx = -R; dx <= R; dx++) for(let dz = -R; dz <= R; dz++){
    if(dx * dx + dz * dz <= R * R) add(dx, dz);
  }
  return pts;
}
function coneInside(dx, dz, dy, R, H){
  R = Math.max(1, R | 0); H = Math.max(1, H | 0);
  if(dy < 0 || dy > R) return false;
  const rh = R - dy;
  return dx * dx + dz * dz <= rh * rh;
}
function applyConeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius | 0);
  const pts = conePoints(R);
  for(let dy = 0; dy <= R; dy++){ const y = ny + dy;
    for(const [dx, dz] of pts){
      if(!coneInside(dx, dz, dy, R, 1)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx + dx, y, nz + dz, brush, FALL, key, wkey, PALETTE);
    }
  }
}
function eraseConeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const R = Math.max(1, radius | 0);
  const pts = conePoints(R);
  for(let dy = 0; dy <= R; dy++){ const y = ny + dy;
    for(const [dx, dz] of pts){
      if(!coneInside(dx, dz, dy, R, 1)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx + dx, y, nz + dz, key, wkey);
    }
  }
}

// ---- stairs ----
function stairsPoints(R){
  R = Math.max(1, R | 0);
  const pts = [];
  for(let dx = 0; dx <= R; dx++) pts.push([dx, 0]);
  return pts;
}
function stairsInside(dx, dz, dy, R, H){
  R = Math.max(1, R | 0); H = Math.max(1, H | 0);
  if(dz !== 0) return false;
  if(dx < 0 || dx > R) return false;
  if(dy < 0 || dy > dx) return false;
  return true;
}
function applyStairsBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius | 0);
  const pts = stairsPoints(R);
  for(let dy = 0; dy <= R; dy++){ const y = ny + dy;
    for(const [dx, dz] of pts){
      if(!stairsInside(dx, dz, dy, R, 1)) continue;
      writeVoxel(edits, waterCol, lavaCol, falling, nx + dx, y, nz + dz, brush, FALL, key, wkey, PALETTE);
    }
  }
}
function eraseStairsBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const R = Math.max(1, radius | 0);
  const pts = stairsPoints(R);
  for(let dy = 0; dy <= R; dy++){ const y = ny + dy;
    for(const [dx, dz] of pts){
      if(!stairsInside(dx, dz, dy, R, 1)) continue;
      clearVoxel(edits, waterCol, lavaCol, falling, nx + dx, y, nz + dz, key, wkey);
    }
  }
}

// ---- arch ----
function archXZInside(dx, dz, R){
  const dist = Math.hypot(dx, dz);
  const innerR = R * 0.6;
  if(dz <= 0) return dist <= R;
  return dist >= innerR && dist <= R;
}
function archPoints(R){
  R = Math.max(1, R | 0);
  const pts = [], seen = new Set();
  const add = (dx, dz) => { const k = dx + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx, dz]); } };
  for(let dx = -R; dx <= R; dx++) for(let dz = -R; dz <= R; dz++){
    if(archXZInside(dx, dz, R)) add(dx, dz);
  }
  return pts;
}
function archInside(dx, dz, dy, R, H){
  R = Math.max(1, R | 0); H = Math.max(1, H | 0);
  if(dy < 0 || dy >= H) return false;
  return archXZInside(dx, dz, R);
}
function applyArchBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALL, key, wkey, PALETTE){
  const R = Math.max(1, radius | 0), H = Math.max(1, height | 0);
  const pts = archPoints(R);
  for(let dy = 0; dy < H; dy++){ const y = ny + dy;
    for(const [dx, dz] of pts){
      if(!archInside(dx, dz, dy, R, H)) continue;
      const x = nx + dx, z = nz + dz, k = key(x, y, z), wk = wkey(x, z);
      if(brush === 'lava'){ lavaCol.set(wk, y + 1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y + 1); continue; }
      edits.set(k, PALETTE[brush]); if(FALL.has(brush)) falling.add(k);
    }
  }
}
function eraseArchBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius | 0), H = Math.max(1, height | 0);
  const pts = archPoints(R);
  for(let dy = 0; dy < H; dy++){ const y = ny + dy;
    for(const [dx, dz] of pts){
      if(!archInside(dx, dz, dy, R, H)) continue;
      const x = nx + dx, z = nz + dz, k = key(x, y, z), wk = wkey(x, z);
      if(waterCol.has(wk) && waterCol.get(wk) === y + 1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y + 1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}

// ===================== 校验辅助 =====================
// 从 main.js 提取生产函数定义(括号匹配)，用于与测试副本逐值比对
function extractFn(src, name){
  const sig = 'function ' + name + '(';
  const i = src.indexOf(sig);
  if(i < 0) return null;
  let j = src.indexOf('{', i), depth = 0, k = j;
  for(; k < src.length; k++){
    if(src[k] === '{') depth++;
    else if(src[k] === '}'){ depth--; if(depth === 0){ k++; break; } }
  }
  return src.slice(i, k);
}
function prodFn(src, name){
  const t = extractFn(src, name);
  assert.ok(t, '生产代码含 ' + name);
  return eval('(' + t + ')');   // 闭包于本模块作用域(archInside 可见 archXZInside)
}
// 期望体素数：用 xxxInside 在包围盒内逐点计数(与 apply 结果应一致)
function expectedCount(insideFn, R, H){
  R = Math.max(1, R | 0); H = Math.max(1, H | 0);
  const B = Math.max(R, H) + 1;
  let n = 0;
  for(let dx = -B; dx <= B; dx++) for(let dy = -B; dy <= B; dy++) for(let dz = -B; dz <= B; dz++){
    if(insideFn(dx, dz, dy, R, H)) n++;
  }
  return n;
}

const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
let total = 0;
function check(cond, msg){ total++; assert.ok(cond, msg); }

// ===================== ci378 dome =====================
{
  check(domePoints(2).length === 13, 'domePoints(2) 圆盘点数=13');
  check(domePoints(3).length > domePoints(2).length, 'domePoints 随 R 增大');
  check(domeInside(0, 0, 0, 2, 1) === true, 'domeInside 中心为真');
  check(domeInside(3, 0, 0, 2, 1) === false, 'domeInside 圆盘外为假');
  check(domeInside(0, 0, 3, 2, 1) === false, 'domeInside 穹顶顶上为假');
  const edits = new Map();
  applyDomeBrush(edits, new Map(), new Map(), new Set(), 5, 10, 5, 'stone', 2, FALL, key, wkey, PALETTE);
  check(edits.size === expectedCount(domeInside, 2, 1), 'dome apply 体素数 = inside 计数');
  check(edits.has('5,10,5'), 'dome 含底面中心');
  // 擦除对称
  const edits2 = new Map(), falling2 = new Set();
  applyDomeBrush(edits2, new Map(), new Map(), falling2, 5, 10, 5, 'sand', 2, FALL, key, wkey, PALETTE);
  eraseDomeBrush(edits2, new Map(), new Map(), falling2, 5, 10, 5, 2, key, wkey);
  check([...edits2.values()].every(v => v === null), 'dome erase 后全为 null');
  check(falling2.size === 0, 'dome erase 清空 falling');
  // 生产函数一致性
  assert.deepStrictEqual(prodFn(main, 'domePoints')(2), domePoints(2), '生产 domePoints 与测试一致');
  check(prodFn(main, 'domeInside')(0, 0, 0, 2, 1) === domeInside(0, 0, 0, 2, 1), '生产 domeInside 与测试一致');
  // 接线
  check(main.includes("function applyDomeBrush("), 'main 有 applyDomeBrush');
  check(main.includes("function eraseDomeBrush("), 'main 有 eraseDomeBrush');
  check(main.includes("brushShape === 'dome') applyDomeBrush("), 'dome dispatch apply 已接线');
  check(main.includes("brushShape === 'dome') eraseDomeBrush("), 'dome dispatch erase 已接线');
  console.log('ci378 dome: OK');
}

// ===================== ci382 diamond =====================
{
  check(diamondPoints(2).length === 13, 'diamondPoints(2) 曼哈顿点数=13');
  check(diamondPoints(3).length > diamondPoints(2).length, 'diamondPoints 随 R 增大');
  check(diamondInside(0, 0, 0, 2, 1) === true, 'diamondInside 中心为真');
  check(diamondInside(3, 0, 0, 2, 1) === false, 'diamondInside |dx|>R 为假');
  check(diamondInside(0, 0, 3, 2, 1) === false, 'diamondInside |dy|>R 为假');
  check(diamondInside(1, 0, 0, 2, 1) === true, 'diamondInside 表面点(1,0,0)为真');
  const edits = new Map();
  applyDiamondBrush(edits, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', 2, FALL, key, wkey, PALETTE);
  check(edits.size === expectedCount(diamondInside, 2, 1), 'diamond apply 体素数 = inside 计数');
  check(edits.has('0,0,0'), 'diamond 含中心');
  // ci382 隐性修复验证：water 列高应为逐列真实顶 y+1，而非旧版全局 top=ny+2r-1
  {
    const water = new Map(), editsW = new Map();
    applyDiamondBrush(editsW, water, new Map(), new Set(), 0, 0, 0, 'water', 2, FALL, key, wkey, PALETTE);
    check(water.size === diamondPoints(2).length, 'diamond water 列数 = 足迹列数');
    // 列 (1,0)：真实顶 dy = R - |dx| - |dz| = 2-1-0 = 1 → 水面应为 ny+ (1) +1 = 2
    check(water.get(wkey(1, 0)) === 0 + (2 - 1 - 0) + 1, 'diamond 列(1,0)水高=逐列真实顶+1(旧版会写成 ny+3)');
  }
  // 擦除对称
  const e2 = new Map(), f2 = new Set();
  applyDiamondBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 'sand', 2, FALL, key, wkey, PALETTE);
  eraseDiamondBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 2, key, wkey);
  check([...e2.values()].every(v => v === null), 'diamond erase 后全为 null');
  check(f2.size === 0, 'diamond erase 清空 falling');
  // 生产一致性
  assert.deepStrictEqual(prodFn(main, 'diamondPoints')(2), diamondPoints(2), '生产 diamondPoints 与测试一致');
  check(prodFn(main, 'diamondInside')(1, 0, 0, 2, 1) === diamondInside(1, 0, 0, 2, 1), '生产 diamondInside 与测试一致');
  // 接线
  check(main.includes("function applyDiamondBrush("), 'main 有 applyDiamondBrush');
  check(main.includes("function eraseDiamondBrush("), 'main 有 eraseDiamondBrush');
  check(main.includes("brushShape === 'diamond') applyDiamondBrush("), 'diamond dispatch apply 已接线');
  check(main.includes("brushShape === 'diamond') eraseDiamondBrush("), 'diamond dispatch erase 已接线');
  console.log('ci382 diamond: OK');
}

// ===================== ci386 stairs =====================
{
  check(stairsPoints(2).length === 3, 'stairsPoints(2) 单列足迹=3');
  check(stairsPoints(4).length === 5, 'stairsPoints(4)=5');
  check(stairsInside(0, 0, 0, 2, 1) === true, 'stairsInside 第0级底为真');
  check(stairsInside(2, 0, 2, 2, 1) === true, 'stairsInside 第2级顶层为真');
  check(stairsInside(2, 0, 3, 2, 1) === false, 'stairsInside 超出台阶高为假');
  check(stairsInside(2, 1, 0, 2, 1) === false, 'stairsInside 非 z=0 平面为假');
  const edits = new Map();
  applyStairsBrush(edits, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', 3, FALL, key, wkey, PALETTE);
  check(edits.size === expectedCount(stairsInside, 3, 1), 'stairs apply 体素数 = inside 计数');
  check(edits.has('3,3,0'), 'stairs 含最高级顶点(3,3,0)');
  check(!edits.has('0,1,0'), 'stairs 第0级仅 1 格(无 (0,1,0))');
  // 擦除对称
  const e2 = new Map(), f2 = new Set();
  applyStairsBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 'sand', 3, FALL, key, wkey, PALETTE);
  eraseStairsBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 3, key, wkey);
  check([...e2.values()].every(v => v === null), 'stairs erase 后全为 null');
  check(f2.size === 0, 'stairs erase 清空 falling');
  // 生产一致性
  assert.deepStrictEqual(prodFn(main, 'stairsPoints')(3), stairsPoints(3), '生产 stairsPoints 与测试一致');
  check(prodFn(main, 'stairsInside')(2, 0, 2, 3, 1) === stairsInside(2, 0, 2, 3, 1), '生产 stairsInside 与测试一致');
  // 接线
  check(main.includes("function applyStairsBrush("), 'main 有 applyStairsBrush');
  check(main.includes("function eraseStairsBrush("), 'main 有 eraseStairsBrush');
  check(main.includes("brushShape === 'stairs') applyStairsBrush("), 'stairs dispatch apply 已接线');
  check(main.includes("brushShape === 'stairs') eraseStairsBrush("), 'stairs dispatch erase 已接线');
  console.log('ci386 stairs: OK');
}

// ===================== ci390 cone =====================
{
  check(conePoints(2).length === 13, 'conePoints(2) 底圆点数=13');
  check(conePoints(3).length > conePoints(2).length, 'conePoints 随 R 增大');
  check(coneInside(0, 0, 0, 2, 1) === true, 'coneInside 锥底中心为真');
  check(coneInside(0, 0, 2, 2, 1) === true, 'coneInside 锥顶(0,0,2)为真');
  check(coneInside(0, 0, 3, 2, 1) === false, 'coneInside 超出顶端为假');
  check(coneInside(2, 0, 1, 2, 1) === false, 'coneInside 中部半径外为假');
  const edits = new Map();
  applyConeBrush(edits, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', 2, FALL, key, wkey, PALETTE);
  check(edits.size === expectedCount(coneInside, 2, 1), 'cone apply 体素数 = inside 计数');
  check(edits.has('0,2,0'), 'cone 含锥顶(0,2,0)');
  check(edits.has('0,0,0'), 'cone 含锥底中心');
  // 擦除对称
  const e2 = new Map(), f2 = new Set();
  applyConeBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 'sand', 2, FALL, key, wkey, PALETTE);
  eraseConeBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 2, key, wkey);
  check([...e2.values()].every(v => v === null), 'cone erase 后全为 null');
  check(f2.size === 0, 'cone erase 清空 falling');
  // 生产一致性
  assert.deepStrictEqual(prodFn(main, 'conePoints')(2), conePoints(2), '生产 conePoints 与测试一致');
  check(prodFn(main, 'coneInside')(0, 0, 2, 2, 1) === coneInside(0, 0, 2, 2, 1), '生产 coneInside 与测试一致');
  // 接线
  check(main.includes("function applyConeBrush("), 'main 有 applyConeBrush');
  check(main.includes("function eraseConeBrush("), 'main 有 eraseConeBrush');
  check(main.includes("brushShape === 'cone') applyConeBrush("), 'cone dispatch apply 已接线');
  check(main.includes("brushShape === 'cone') eraseConeBrush("), 'cone dispatch erase 已接线');
  console.log('ci390 cone: OK');
}

// ===================== ci394 arch =====================
{
  check(archPoints(4).length > 0, 'archPoints(4) 非空');
  check(archPoints(5).length > archPoints(4).length, 'archPoints 随 R 增大');
  check(archInside(0, 0, 0, 4, 6) === true, 'archInside 拱座底为真');
  check(archInside(0, 0, 5, 4, 6) === true, 'archInside 顶部层为真');
  check(archInside(0, 0, 6, 4, 6) === false, 'archInside 超出 H 为假');
  check(archInside(0, 5, 0, 4, 6) === false, 'archInside 拱外(超外半径)为假');
  check(archInside(0, 2, 0, 4, 6) === false, 'archInside 拱孔(内半径内)为假');
  const edits = new Map();
  applyArchBrush(edits, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', 4, 6, FALL, key, wkey, PALETTE);
  check(edits.size === expectedCount(archInside, 4, 6), 'arch apply 体素数 = inside 计数');
  check(edits.has('0,0,0'), 'arch 含底部拱座中心');
  // 擦除对称
  const e2 = new Map(), f2 = new Set();
  applyArchBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 'sand', 4, 6, FALL, key, wkey, PALETTE);
  eraseArchBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 4, 6, key, wkey);
  check([...e2.values()].every(v => v === null), 'arch erase 后全为 null');
  check(f2.size === 0, 'arch erase 清空 falling');
  // 生产一致性(archInside 现已升格为 4 参 3D 真相源)
  check(prodFn(main, 'archInside')(0, 0, 0, 4, 6) === archInside(0, 0, 0, 4, 6), '生产 archInside 与测试一致');
  assert.deepStrictEqual(prodFn(main, 'archPoints')(4), archPoints(4), '生产 archPoints 与测试一致');
  check(/\bfunction archInside\(dx, dz, dy, R, H\)\{/.test(main), 'archInside 已是 4 参 3D 真相源');
  check(!main.includes('archInside(dx, dz, R)'), 'archInside 旧 3 参调用已清除');
  // 接线
  check(main.includes("function applyArchBrush("), 'main 有 applyArchBrush');
  check(main.includes("function eraseArchBrush("), 'main 有 eraseArchBrush');
  check(main.includes("brushShape === 'arch') applyArchBrush("), 'arch dispatch apply 已接线');
  check(main.includes("brushShape === 'arch') eraseArchBrush("), 'arch dispatch erase 已接线');
  console.log('ci394 arch: OK');
}

console.log('ci378..ci394 brushes: 全部断言通过 (共 ' + total + ' 项)');
