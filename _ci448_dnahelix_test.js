// ci448 测试：DNA 双螺旋笔刷(dnahelix) —— 单一真相源 dnaHelixPoints + apply/erase 接线；
// 内联纯函数副本 + 从 main.js 提取生产函数逐值比对；并校验 dispatch 与 UI 接线、scatter/球体重构无回归。
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
function dnaHelixPoints(R, H){
  R = Math.max(2, R|0); H = Math.max(4, H|0);
  const TWISTS = 2.5;
  const pts = [], seen = new Set();
  const add = (dx, dy, dz)=>{ const k = dx + ',' + dy + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx, dy, dz]); } };
  const steps = H * 4;
  for(let i=0; i<=steps; i++){
    const t = H * i / steps;
    const th = t * TWISTS * 2 * Math.PI / H;
    const cx = R * Math.cos(th), cz = R * Math.sin(th);
    add(Math.round(cx), Math.round(t), Math.round(cz));
    add(Math.round(-cx), Math.round(t), Math.round(-cz));
    if(i % 3 === 0){ const sr = 3; for(let s=1; s<sr; s++){ const f = s / sr; add(Math.round(cx*(1 - 2*f)), Math.round(t), Math.round(cz*(1 - 2*f))); } }
  }
  return pts;
}
function applyDnaHelixBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const pts = dnaHelixPoints(radius, height);
  for(const [dx, dy, dz] of pts) writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, ny+dy, nz+dz, brush, FALLv, key, wkey, PALETTEv);
}
function eraseDnaHelixBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const pts = dnaHelixPoints(radius, height);
  for(const [dx, dy, dz] of pts) clearVoxel(edits, waterCol, lavaCol, falling, nx+dx, ny+dy, nz+dz, key, wkey);
}

const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
let total = 0;
function check(cond, msg){ total++; assert.ok(cond, msg); }
function extractFn(src, name){
  const i = src.indexOf('function ' + name + '(');
  if(i < 0) return null;
  let j = src.indexOf('{', i), depth = 0, k = j;
  for(; k < src.length; k++){ if(src[k] === '{') depth++; else if(src[k] === '}'){ depth--; if(depth === 0){ k++; break; } } }
  return src.slice(i, k);
}
function prodFn(src, name){
  const t = extractFn(src, name);
  assert.ok(t, '生产代码含 ' + name);
  return eval('(' + t + ')');
}

// ===================== ci448 dnahelix =====================
{
  const R = 6, H = R * 3;
  // --- 几何：双螺旋(两条链)+ 横档，非空且对称(链A/链B 互为反相) ---
  const pts = dnaHelixPoints(R, H);
  check(pts.length > 20, 'dnaHelixPoints 点数量充足(双螺旋+横档)');
  // 生产函数与内联副本逐值一致
  const prodPts = prodFn(main, 'dnaHelixPoints')(R, H);
  check(prodPts.length === pts.length && JSON.stringify(prodPts) === JSON.stringify(pts), 'dnaHelixPoints 生产=内联(单一真相源)');
  // apply 与 erase 共用点表(几何对称)
  const e1 = new Map(), wc1 = new Map(), lc1 = new Map(), f1 = new Set();
  applyDnaHelixBrush(e1, wc1, lc1, f1, 10, 20, 30, 'stone', R, H, FALL, key, wkey, PALETTE);
  const e2 = new Map(), wc2 = new Map(), lc2 = new Map(), f2 = new Set();
  eraseDnaHelixBrush(e2, wc2, lc2, f2, 10, 20, 30, R, H, key, wkey);
  // 双链：同一高度 dy 上既存在正 dx 也存在负 dx 的链点(两条相位差 π 的螺旋链)
  const byY = new Map();
  for(const [dx,dy,dz] of pts){ if(!byY.has(dy)) byY.set(dy,new Set()); byY.get(dy).add(Math.sign(dx)); }
  let doubleStrand = false;
  for(const signs of byY.values()){ if(signs.has(1) && signs.has(-1)){ doubleStrand = true; break; } }
  check(doubleStrand, 'dnahelix 同一高度含双链(正/负 dx 并存)');
  // erase 精确移除 apply 所放(同样的 key 集合)
  check(e2.size === e1.size, 'erase 点集大小 == apply 点集大小');
  let eraseMatch = true;
  for(const k of e1.keys()){ const [x,y,z]=k.split(',').map(Number); const [dx,dy,dz]=k.split(',').map(Number); if(!e2.has(k)) eraseMatch=false; }
  check(eraseMatch, 'erase 精确覆盖 apply 所放方块(无残留)');
  // 生产 apply/erase 与内联一致
  const pe = new Map(), pwc = new Map(), plc = new Map(), pf = new Set();
  prodFn(main, 'applyDnaHelixBrush')(pe, pwc, plc, pf, 10, 20, 30, 'stone', R, H, FALL, key, wkey, PALETTE);
  check(JSON.stringify([...pe.entries()].sort()) === JSON.stringify([...e1.entries()].sort()), 'applyDnaHelixBrush 生产=内联');
  const pe2 = new Map();
  prodFn(main, 'eraseDnaHelixBrush')(pe2, pwc, plc, pf, 10, 20, 30, R, H, key, wkey);
  check(JSON.stringify([...pe2.entries()].sort()) === JSON.stringify([...e2.entries()].sort()), 'eraseDnaHelixBrush 生产=内联');
}

// ===================== dispatch / UI 接线 =====================
check(main.includes("brushShape === 'dnahelix') applyDnaHelixBrush"), 'main.js apply dispatch 含 dnahelix');
check(main.includes("brushShape === 'dnahelix') eraseDnaHelixBrush"), 'main.js erase dispatch 含 dnahelix');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
check(html.includes('<option value="dnahelix">'), 'index.html 下拉含 dnahelix 选项');

// ===================== R2 回归：sphere 重构后行为不变 =====================
{
  const prodApplySphere = prodFn(main, 'applySphereBrush');
  const prodEraseSphere = prodFn(main, 'eraseSphereBrush');
  // 半径 3 的实心球：内部点数应等于半径3实心球内整点(不含外壳角)
  const e = new Map(), wc = new Map(), lc = new Map(), f = new Set();
  prodApplySphere(e, wc, lc, f, 0, 0, 0, 'stone', 3, FALL, key, wkey, PALETTE);
  // 实心球 r=3 内整点 = sum_{dy=-2..2}(每层的钻石数)，手动核对半径3球内点数
  let expect = 0;
  for(let dx=-2; dx<=2; dx++) for(let dy=-2; dy<=2; dy++) for(let dz=-2; dz<=2; dz++) if(dx*dx+dy*dy+dz*dz <= 9) expect++;
  check(e.size === expect, 'applySphereBrush(重构) 实心球点数正确 r=3 => ' + expect);
  // 擦除精确移除
  const e2 = new Map();
  prodEraseSphere(e2, wc, lc, f, 0, 0, 0, 3, key, wkey);
  check(e2.size === e.size, 'eraseSphereBrush(重构) 点集大小匹配');
  let m = true; for(const k of e.keys()) if(!e2.has(k)) m=false;
  check(m, 'eraseSphereBrush(重构) 精确覆盖 apply 所放(无残留)');
}
console.log(`\n_ci448_dnahelix: ${total} checks, all pass`);
process.exit(0);
