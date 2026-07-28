// ci398..ci414 测试：trapezoid / sawtooth / burst / tent / cage 五个新增笔刷 ——
// 单一真相源(xxxInside) + apply/erase 接线校验；纯函数内联副本 + 从 main.js 提取生产函数逐值比对。
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
// ---- trapezoid ----
function trapezoidInside(dx, dz, dy, R, H){
  R = Math.max(1, R|0); H = Math.max(1, H|0);
  if(dy < 0 || dy >= H) return false;
  if(Math.abs(dz) > R) return false;
  const r = Math.max(1, Math.round(R*0.4));
  const w = R - Math.round((R - r) * (dy / H));
  return Math.abs(dx) <= w;
}
function applyTrapezoidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!trapezoidInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseTrapezoidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!trapezoidInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
// ---- sawtooth ----
function sawtoothInside(dx, dz, dy, R, H){
  R = Math.max(1, R|0); H = Math.max(1, H|0);
  if(dy < 0 || dy >= H) return false;
  if(Math.abs(dx) > R) return false;
  if(Math.abs(dz) > R) return false;
  const period = 2 * Math.max(2, R);
  const local = ((dx + R) % period + period) % period;
  const ramp = Math.floor(local / period * H);
  return dy <= ramp;
}
// ---- burst ----
function burstInside(dx, dz, dy, R, H){
  R = Math.max(1, R|0); H = Math.max(1, H|0);
  if(dy < 0 || dy >= H) return false;
  const dist = Math.hypot(dx, dz);
  if(dist > R) return false;
  if(dist <= 1) return true;
  const rays = 12, sector = 2 * Math.PI / rays;
  const ang = Math.atan2(dz, dx);
  const local = ((ang % sector) + sector) % sector;
  return local <= sector * 0.32;
}
// ---- tent ----
function tentInside(dx, dz, dy, R, H){
  R = Math.max(1, R|0); H = Math.max(1, H|0);
  if(dy < 0 || dy >= H) return false;
  if(Math.abs(dz) > R) return false;
  const halfW = R - Math.round(R * dy / H);
  return Math.abs(dx) <= halfW;
}
// ---- cage ----
function cageInside(dx, dz, dy, R){
  R = Math.max(1, R|0); const top = 2 * R;
  if(Math.abs(dx) > R || Math.abs(dz) > R) return false;
  if(dy < 0 || dy > top) return false;
  const xExt = Math.abs(dx) === R;
  const zExt = Math.abs(dz) === R;
  const yExt = (dy === 0 || dy === top);
  return (xExt + zExt + yExt) >= 2;
}
function applySawtoothBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!sawtoothInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseSawtoothBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!sawtoothInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
function applyBurstBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!burstInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseBurstBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!burstInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
function applyTentBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!tentInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseTentBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!tentInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
function applyCageBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), top = 2 * R;
  for(let dy=0; dy<=top; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!cageInside(dx, dz, dy, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseCageBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), top = 2 * R;
  for(let dy=0; dy<=top; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!cageInside(dx, dz, dy, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}

// ===================== 校验辅助 =====================
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
  return eval('(' + t + ')');
}
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

// ===================== ci398 trapezoid =====================
{
  check(trapezoidInside(0, 0, 0, 4, 5) === true, 'trapezoidInside 底层中心为真');
  check(trapezoidInside(4, 0, 0, 4, 5) === true, 'trapezoidInside 底宽边为真(半宽=4)');
  check(trapezoidInside(0, 0, 5, 4, 5) === false, 'trapezoidInside 超出 H 为假');
  check(trapezoidInside(3, 0, 4, 4, 5) === false, 'trapezoidInside 顶窄层(半宽=2)外侧为假');
  check(trapezoidInside(0, 5, 0, 4, 5) === false, 'trapezoidInside |dz|>R 为假(全深)');
  const R = 4, H = 5;
  const edits = new Map();
  applyTrapezoidBrush(edits, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', R, H, FALL, key, wkey, PALETTE);
  check(edits.size === expectedCount(trapezoidInside, R, H), 'trapezoid apply 体素数 = inside 计数');
  let bottom = 0, top = 0;
  for(let dx = -R; dx <= R; dx++) for(let dz = -R; dz <= R; dz++){
    if(trapezoidInside(dx, dz, 0, R, H)) bottom++;
    if(trapezoidInside(dx, dz, H - 1, R, H)) top++;
  }
  check(bottom >= top + 2, 'trapezoid 底宽 > 顶窄(下宽上窄)');
  const e2 = new Map(), f2 = new Set();
  applyTrapezoidBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 'sand', R, H, FALL, key, wkey, PALETTE);
  eraseTrapezoidBrush(e2, new Map(), new Map(), f2, 0, 0, 0, R, H, key, wkey);
  check([...e2.values()].every(v => v === null), 'trapezoid erase 后全为 null');
  check(f2.size === 0, 'trapezoid erase 清空 falling');
  check(prodFn(main, 'trapezoidInside')(0, 0, 0, 4, 5) === trapezoidInside(0, 0, 0, 4, 5), '生产 trapezoidInside 与测试一致');
  check(prodFn(main, 'trapezoidInside')(3, 0, 4, 4, 5) === trapezoidInside(3, 0, 4, 4, 5), '生产 trapezoidInside 顶窄层与测试一致');
  check(main.includes("function applyTrapezoidBrush("), 'main 有 applyTrapezoidBrush');
  check(main.includes("function eraseTrapezoidBrush("), 'main 有 eraseTrapezoidBrush');
  check(main.includes("brushShape === 'trapezoid') applyTrapezoidBrush("), 'trapezoid dispatch apply 已接线');
  check(main.includes("brushShape === 'trapezoid') eraseTrapezoidBrush("), 'trapezoid dispatch erase 已接线');
  console.log('ci398 trapezoid: OK');
}

// ===================== ci402 sawtooth =====================
{
  check(sawtoothInside(0, 0, 0, 4, 5) === true, 'sawtoothInside 中段上升区底部为真');
  check(sawtoothInside(0, 0, 3, 4, 5) === false, 'sawtoothInside 中段高处为假(ramp<3)');
  check(sawtoothInside(3, 0, 4, 4, 5) === true, 'sawtoothInside 周期末最高层为真');
  check(sawtoothInside(4, 0, 1, 4, 5) === false, 'sawtoothInside 周期重置点仅底格为真');
  check(sawtoothInside(0, 4, 0, 4, 5) === true, 'sawtoothInside 全深 |dz|=R 为真');
  check(sawtoothInside(0, 5, 0, 4, 5) === false, 'sawtoothInside |dz|>R 为假');
  const R = 4, H = 5;
  const edits = new Map();
  applySawtoothBrush(edits, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', R, H, FALL, key, wkey, PALETTE);
  check(edits.size === expectedCount(sawtoothInside, R, H), 'sawtooth apply 体素数 = inside 计数');
  // 高度随 dx 上升：dx=3 处可达顶面、dx=0 处顶格为假
  check(sawtoothInside(3, 0, 4, R, H) === true && sawtoothInside(0, 0, 3, R, H) === false, 'sawtooth 高度随 dx 单调上升');
  const e2 = new Map(), f2 = new Set();
  applySawtoothBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 'sand', R, H, FALL, key, wkey, PALETTE);
  eraseSawtoothBrush(e2, new Map(), new Map(), f2, 0, 0, 0, R, H, key, wkey);
  check([...e2.values()].every(v => v === null), 'sawtooth erase 后全为 null');
  check(f2.size === 0, 'sawtooth erase 清空 falling');
  check(prodFn(main, 'sawtoothInside')(0, 0, 0, 4, 5) === sawtoothInside(0, 0, 0, 4, 5), '生产 sawtoothInside 与测试一致');
  check(prodFn(main, 'sawtoothInside')(3, 0, 4, 4, 5) === sawtoothInside(3, 0, 4, 4, 5), '生产 sawtoothInside 周期末与测试一致');
  check(main.includes("function applySawtoothBrush("), 'main 有 applySawtoothBrush');
  check(main.includes("function eraseSawtoothBrush("), 'main 有 eraseSawtoothBrush');
  check(main.includes("brushShape === 'sawtooth') applySawtoothBrush("), 'sawtooth dispatch apply 已接线');
  check(main.includes("brushShape === 'sawtooth') eraseSawtoothBrush("), 'sawtooth dispatch erase 已接线');
  console.log('ci402 sawtooth: OK');
}

// ===================== ci406 burst =====================
{
  const R = 6, H = 3;
  check(burstInside(0, 0, 0, R, H) === true, 'burstInside 中心枢纽为真');
  check(burstInside(0, 0, 1, R, H) === true, 'burstInside 枢纽全高为真');
  check(burstInside(0, 0, H, R, H) === false, 'burstInside 超出 H 为假');
  check(burstInside(3, 0, 0, R, H) === true, 'burstInside +x 射线为真');
  check(burstInside(0, 3, 0, R, H) === true, 'burstInside 90° 射线为真');
  check(burstInside(2, 2, 0, R, H) === false, 'burstInside 射线间为假');
  check(burstInside(0, 8, 0, R, H) === false, 'burstInside 超出半径为假');
  const edits = new Map();
  applyBurstBrush(edits, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', R, H, FALL, key, wkey, PALETTE);
  check(edits.size === expectedCount(burstInside, R, H), 'burst apply 体素数 = inside 计数');
  // 射线细而长：+x 轴上远端为真、稍偏即假
  check(burstInside(5, 0, 0, R, H) === true && burstInside(5, 1, 0, R, H) === false, 'burst 射线细且沿轴延伸');
  const e2 = new Map(), f2 = new Set();
  applyBurstBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 'sand', R, H, FALL, key, wkey, PALETTE);
  eraseBurstBrush(e2, new Map(), new Map(), f2, 0, 0, 0, R, H, key, wkey);
  check([...e2.values()].every(v => v === null), 'burst erase 后全为 null');
  check(f2.size === 0, 'burst erase 清空 falling');
  check(prodFn(main, 'burstInside')(0, 0, 0, R, H) === burstInside(0, 0, 0, R, H), '生产 burstInside 与测试一致');
  check(prodFn(main, 'burstInside')(3, 0, 0, R, H) === burstInside(3, 0, 0, R, H), '生产 burstInside 射线与测试一致');
  check(main.includes("function applyBurstBrush("), 'main 有 applyBurstBrush');
  check(main.includes("function eraseBurstBrush("), 'main 有 eraseBurstBrush');
  check(main.includes("brushShape === 'burst') applyBurstBrush("), 'burst dispatch apply 已接线');
  check(main.includes("brushShape === 'burst') eraseBurstBrush("), 'burst dispatch erase 已接线');
  console.log('ci406 burst: OK');
}

// ===================== ci410 tent =====================
{
  const R = 4, H = 5;
  check(tentInside(0, 0, 0, R, H) === true, 'tentInside 底中心为真');
  check(tentInside(4, 0, 0, R, H) === true, 'tentInside 底宽边为真');
  check(tentInside(0, 0, H, R, H) === false, 'tentInside 超出 H 为假');
  check(tentInside(0, 5, 0, R, H) === false, 'tentInside |dz|>R 为假(全深)');
  check(tentInside(3, 0, 0, R, H) === true, 'tentInside 底层 |dx|=3 为真');
  check(tentInside(2, 0, 4, R, H) === false, 'tentInside 顶层(顶宽=1) |dx|=2 为假(收尖)');
  const edits = new Map();
  applyTentBrush(edits, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', R, H, FALL, key, wkey, PALETTE);
  check(edits.size === expectedCount(tentInside, R, H), 'tent apply 体素数 = inside 计数');
  // 底宽 > 顶窄(对称三角棱柱)
  let bottom = 0, top = 0;
  for(let dx = -R; dx <= R; dx++) for(let dz = -R; dz <= R; dz++){
    if(tentInside(dx, dz, 0, R, H)) bottom++;
    if(tentInside(dx, dz, H - 1, R, H)) top++;
  }
  check(bottom >= top + 4, 'tent 底宽 > 顶窄(对称三角)');
  check(tentInside(-2, 0, 1, R, H) === tentInside(2, 0, 1, R, H), 'tent dx 对称');
  const e2 = new Map(), f2 = new Set();
  applyTentBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 'sand', R, H, FALL, key, wkey, PALETTE);
  eraseTentBrush(e2, new Map(), new Map(), f2, 0, 0, 0, R, H, key, wkey);
  check([...e2.values()].every(v => v === null), 'tent erase 后全为 null');
  check(f2.size === 0, 'tent erase 清空 falling');
  check(prodFn(main, 'tentInside')(0, 0, 0, R, H) === tentInside(0, 0, 0, R, H), '生产 tentInside 与测试一致');
  check(prodFn(main, 'tentInside')(2, 0, 4, R, H) === tentInside(2, 0, 4, R, H), '生产 tentInside 顶点与测试一致');
  check(main.includes("function applyTentBrush("), 'main 有 applyTentBrush');
  check(main.includes("function eraseTentBrush("), 'main 有 eraseTentBrush');
  check(main.includes("brushShape === 'tent') applyTentBrush("), 'tent dispatch apply 已接线');
  check(main.includes("brushShape === 'tent') eraseTentBrush("), 'tent dispatch erase 已接线');
  console.log('ci410 tent: OK');
}

// ===================== ci414 cage =====================
{
  const R = 3, top = 2 * R;
  check(cageInside(0, 0, 0, R) === false, 'cageInside 底面内部为假(镂空)');
  check(cageInside(3, 0, 0, R) === true, 'cageInside 竖直棱边为真');
  check(cageInside(0, 3, 0, R) === true, 'cageInside 底圈边为真');
  check(cageInside(0, 3, top, R) === true, 'cageInside 顶圈边为真');
  check(cageInside(3, 3, 3, R) === true, 'cageInside 竖直棱边中段为真');
  check(cageInside(1, 1, 1, R) === false, 'cageInside 内部为假');
  check(cageInside(3, 3, 0, R) === true, 'cageInside 角点(底)为真');
  check(cageInside(3, 3, top, R) === true, 'cageInside 角点(顶)为真');
  const edits = new Map();
  applyCageBrush(edits, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', R, top, FALL, key, wkey, PALETTE);
  check(edits.size === expectedCount(cageInside, R, top), 'cage apply 体素数 = inside 计数(线框立方体)');
  const e2 = new Map(), f2 = new Set();
  applyCageBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 'sand', R, top, FALL, key, wkey, PALETTE);
  eraseCageBrush(e2, new Map(), new Map(), f2, 0, 0, 0, R, top, key, wkey);
  check([...e2.values()].every(v => v === null), 'cage erase 后全为 null');
  check(f2.size === 0, 'cage erase 清空 falling');
  check(prodFn(main, 'cageInside')(0, 0, 0, R) === cageInside(0, 0, 0, R), '生产 cageInside 与测试一致');
  check(prodFn(main, 'cageInside')(3, 3, top, R) === cageInside(3, 3, top, R), '生产 cageInside 角点与测试一致');
  check(main.includes("function applyCageBrush("), 'main 有 applyCageBrush');
  check(main.includes("function eraseCageBrush("), 'main 有 eraseCageBrush');
  check(main.includes("brushShape === 'cage') applyCageBrush("), 'cage dispatch apply 已接线');
  check(main.includes("brushShape === 'cage') eraseCageBrush("), 'cage dispatch erase 已接线');
  console.log('ci414 cage: OK');
}

console.log('ci398..ci414 brushes: 全部断言通过 (共 ' + total + ' 项)');
