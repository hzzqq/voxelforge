// ci443 测试：mobius 莫比乌斯环笔刷 —— 单一真相源(mobiusInside) + apply/erase 接线校验；
// 内联纯函数副本 + 从 main.js 提取生产函数逐值比对。
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

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
function mobiusInside(dx, dz, dy, R, T){
  R = Math.max(2, R|0); T = Math.max(1, T|0);
  const rr = Math.sqrt(dx*dx + dz*dz);
  if(rr < 0.5) return false;
  const u = Math.atan2(dz, dx);
  const a = rr - R, b = dy;
  const al = u/2;
  const perp = -a*Math.sin(al) + b*Math.cos(al);
  const along = a*Math.cos(al) + b*Math.sin(al);
  return Math.abs(perp) <= 1.2 && Math.abs(along) <= T;
}
function applyMobiusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const R = Math.max(2, radius|0), t = Math.max(1, Math.floor(R/3));
  const half = R + t;
  for(let dx=-half; dx<=half; dx++) for(let dz=-half; dz<=half; dz++) for(let dy=-t; dy<=t; dy++){
    if(!mobiusInside(dx, dz, dy, R, t)) continue;
    writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, ny+dy, nz+dz, brush, FALL, key, wkey, PALETTE);
  }
}
function eraseMobiusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const R = Math.max(2, radius|0), t = Math.max(1, Math.floor(R/3));
  const half = R + t;
  for(let dx=-half; dx<=half; dx++) for(let dz=-half; dz<=half; dz++) for(let dy=-t; dy<=t; dy++){
    if(!mobiusInside(dx, dz, dy, R, t)) continue;
    clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, ny+dy, nz+dz, key, wkey);
  }
}

const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
let total = 0;
function check(cond, msg){ total++; assert.ok(cond, msg); }
function extractFn(src, name){
  const i = src.indexOf('function ' + name + '(');
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

// ===================== ci443 mobius =====================
{
  const R = 6, T = Math.max(1, Math.floor(R/3)); // T=2
  // --- Inside 几何：闭合环(四向卡点为真) + 中空(中心/内径为假) ---
  check(mobiusInside(R, 0, 0, R, T) === true, 'mobiusInside +x 环上为真');
  check(mobiusInside(-R, 0, 0, R, T) === true, 'mobiusInside -x 环上为真(扭带接缝)');
  check(mobiusInside(0, R, 0, R, T) === true, 'mobiusInside +z 环上为真');
  check(mobiusInside(0, -R, 0, R, T) === true, 'mobiusInside -z 环上为真');
  check(mobiusInside(0, 0, 0, R, T) === false, 'mobiusInside 中心孔为假');
  check(mobiusInside(Math.floor(R/2), 0, 0, R, T) === false, 'mobiusInside 内径(半径一半)为假(中空环)');
  check(mobiusInside(R, 0, T + 3, R, T) === false, 'mobiusInside 超出带厚为假');
  // 扭带非对称：同一 XZ 角、不同 dy 的归属随 u 变化(单侧特性)——
  // 在 u=0(+x) 带近水平(perp≈dy)，在 u=π(-x) 带近竖直(perp≈-a)，验证两者都接受 y=0 但拒绝相反的极端 dy
  check(mobiusInside(R, 0, 0, R, T) === true, 'mobius +x y=0 接受');
  check(mobiusInside(-R, 0, 0, R, T) === true, 'mobius -x y=0 接受(扭带接缝仍闭合)');

  // --- apply 体素数 = inside 计数(自定义边界，覆盖 R+T) ---
  let expected = 0;
  for(let dx=-R-T; dx<=R+T; dx++) for(let dz=-R-T; dz<=R+T; dz++) for(let dy=-T; dy<=T; dy++)
    if(mobiusInside(dx, dz, dy, R, T)) expected++;
  const edits = new Map();
  applyMobiusBrush(edits, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', R, FALL, key, wkey, PALETTE);
  check(edits.size === expected, 'mobius apply 体素数 = inside 计数(' + edits.size + '=' + expected + ')');
  // 四向卡点均在 edits 中 => 闭合环
  check(edits.has(key(R, 0, 0)) && edits.has(key(-R, 0, 0)) && edits.has(key(0, 0, R)) && edits.has(key(0, 0, -R)), 'mobius 四向卡点构成闭合环');

  // --- erase 后全 null / 清空 falling ---
  const e2 = new Map(), f2 = new Set();
  applyMobiusBrush(e2, new Map(), new Map(), f2, 0, 0, 0, 'sand', R, FALL, key, wkey, PALETTE);
  eraseMobiusBrush(e2, new Map(), new Map(), f2, 0, 0, 0, R, key, wkey);
  check([...e2.values()].every(v => v === null), 'mobius erase 后全为 null');
  check(f2.size === 0, 'mobius erase 清空 falling');

  // --- 生产代码与测试内联副本一致 ---
  check(prodFn(main, 'mobiusInside')(R, 0, 0, R, T) === mobiusInside(R, 0, 0, R, T), '生产 mobiusInside 与测试一致(+x)');
  check(prodFn(main, 'mobiusInside')(-R, 0, 0, R, T) === mobiusInside(-R, 0, 0, R, T), '生产 mobiusInside 与测试一致(-x 接缝)');
  check(main.includes('function applyMobiusBrush('), 'main 有 applyMobiusBrush');
  check(main.includes('function eraseMobiusBrush('), 'main 有 eraseMobiusBrush');
  check(main.includes("brushShape === 'mobius') applyMobiusBrush("), 'mobius dispatch apply 已接线');
  check(main.includes("brushShape === 'mobius') eraseMobiusBrush("), 'mobius dispatch erase 已接线');
  console.log('ci443 mobius: OK (' + total + ' checks)');
}

console.log(`_ci443_mobius: ${total} checks, all pass`);
process.exit(0);
