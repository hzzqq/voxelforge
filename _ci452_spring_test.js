// ci452 测试：弹簧线圈(spring) 笔刷 —— 单一真相源 springPoints + apply/erase 接线；
// 内联纯函数副本 + 从 main.js 提取生产函数逐值比对；几何校验(单链线圈/空心/恒定半径) + dispatch 接线。
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
function springPoints(R, H){
  R = Math.max(2, R|0); H = Math.max(4, H|0);
  const COILS = 5;
  const pts = [], seen = new Set();
  const add = (dx, dy, dz)=>{ const k = dx + ',' + dy + ',' + dz; if(!seen.has(k)){ seen.add(k); pts.push([dx, dy, dz]); } };
  for(let dy=0; dy<=H; dy++){
    const th = dy * COILS * 2 * Math.PI / H;
    add(Math.round(R * Math.cos(th)), dy, Math.round(R * Math.sin(th)));
  }
  return pts;
}
function applySpringBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const pts = springPoints(radius, height);
  for(const [dx, dy, dz] of pts) writeVoxel(edits, waterCol, lavaCol, falling, nx+dx, ny+dy, nz+dz, brush, FALLv, key, wkey, PALETTEv);
}
function eraseSpringBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const pts = springPoints(radius, height);
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

// ===================== ci452 spring =====================
{
  const R = 6, H = R * 3;
  const pts = springPoints(R, H);
  check(pts.length >= H, 'springPoints 每高度一个采样点(线圈点数≈H+1: 实际 ' + pts.length + ' vs H=' + H + ')');

  // 生产函数与内联副本逐值一致(单一真相源)
  const prodPts = prodFn(main, 'springPoints')(R, H);
  check(prodPts.length === pts.length && JSON.stringify(prodPts) === JSON.stringify(pts), 'springPoints 生产=内联(单一真相源)');

  // apply / erase 共用点表
  const e1 = new Map(), wc1 = new Map(), lc1 = new Map(), f1 = new Set();
  applySpringBrush(e1, wc1, lc1, f1, 10, 20, 30, 'stone', R, H, FALL, key, wkey, PALETTE);
  const e2 = new Map(), wc2 = new Map(), lc2 = new Map(), f2 = new Set();
  eraseSpringBrush(e2, wc2, lc2, f2, 10, 20, 30, R, H, key, wkey);
  check(e2.size === e1.size, 'erase 点集大小 == apply 点集大小');
  let eraseMatch = true;
  for(const k of e1.keys()){ if(!e2.has(k)) eraseMatch = false; }
  check(eraseMatch, 'erase 精确覆盖 apply 所放方块(无残留)');

  // 单链：任意高度 dy 上只出现一条链(不会出现正/负 dx 同时存在的双链)
  const byY = new Map();
  for(const [dx, dy, dz] of pts){ if(!byY.has(dy)) byY.set(dy, new Set()); byY.get(dy).add(Math.sign(dx)); }
  let singleStrand = true;
  for(const signs of byY.values()){ if(signs.size > 1){ singleStrand = false; break; } }
  check(singleStrand, 'spring 为单链线圈(同高度无双链)');

  // 空心：中心轴 (dx=0,dz=0) 任何高度都不落块
  let hollow = true;
  for(const [dx, dy, dz] of pts){ if(dx === 0 && dz === 0){ hollow = false; break; } }
  check(hollow, 'spring 空心(中心轴无块)');

  // 恒定半径：最大平面半径约等于 R
  let maxR = 0;
  for(const [dx, dy, dz] of pts){ maxR = Math.max(maxR, Math.hypot(dx, dz)); }
  check(Math.abs(maxR - R) <= 1, 'spring 平面半径≈R(实际 ' + maxR.toFixed(1) + ' vs R=' + R + ')');

  // 钳制：极端入参安全
  const c1 = springPoints(0, 0), c2 = springPoints(-3, 2);
  check(c1.length > 0 && c2.length > 0, 'springPoints 极端入参(R=0/H=0/负)仍产出非空点集');

  // dispatch 接线：apply/erase 分支存在
  check(main.includes("else if(brushShape === 'spring') eraseSpringBrush("), 'erase dispatch 接线 spring');
  check(main.includes("else if(brushShape === 'spring') applySpringBrush("), 'apply dispatch 接线 spring');
  // UI 选项
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check(html.includes('<option value="spring">'), 'index.html 含 spring 笔刷选项');

  console.log('  ci452 spring: 断言 ' + total + ' 项');
}
console.log('\n_ci452_spring: ' + total + ' 断言全部通过');
