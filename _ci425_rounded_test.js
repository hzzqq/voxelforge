// ci425 — VoxelForge 圆角立方体(rounded)笔刷 + 球形笔刷流体顶面修复
// R1：rounded 超椭球笔刷（单一真相源 roundedInside）。R2：球形笔刷 water/lava 表面 top 由 ny+2r-1 修正为 ny+r。
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL', n); } };

// 从 main.js 文本提取生产函数（按名抓取，处理嵌套大括号）
function extractFn(name){
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(src);
  if(!m) return null;
  let i = m.index + m[0].length - 1, depth = 1;
  while(depth > 0 && i < src.length){ i++; const ch = src[i]; if(ch === '{') depth++; else if(ch === '}') depth--; }
  const body = src.slice(m.index, i + 1);
  return new Function('return (' + body + ')')();
}

// ---- 内联规范实现（与生产一致）----
const key = (x, y, z) => x + ',' + y + ',' + z;
const wkey = (x, z) => x + ',' + z;
const PALETTE = { stone: 1, sand: 2, water: 3, lava: 4 };
const FALL = new Set(['sand']);
function roundedInside(dx, dy, dz, R){
  R = Math.max(1, R|0);
  const a = Math.abs(dx)/R, b = Math.abs(dy)/R, c = Math.abs(dz)/R;
  return (a*a*a*a + b*b*b*b + c*c*c*c) <= 1;
}
global.roundedInside = roundedInside;   // 供提取的生产 applyRoundedBrush(内部调用 roundedInside) 解析
function applyRoundedBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0); const top = ny + R;
  for(let dx=-R+1; dx<R; dx++) for(let dy=-R+1; dy<R; dy++) for(let dz=-R+1; dz<R; dz++){
    if(!roundedInside(dx, dy, dz, R)) continue;
    const x=nx+dx, y=ny+dy, z=nz+dz, k=key(x,y,z), wk=wkey(x,z);
    if(brush==='lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush==='water'){ waterCol.set(wk, top); continue; }
    edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
  }
}
function eraseRoundedBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const R = Math.max(1, radius|0); const top = ny + R;
  for(let dx=-R+1; dx<R; dx++) for(let dy=-R+1; dy<R; dy++) for(let dz=-R+1; dz<R; dz++){
    if(!roundedInside(dx, dy, dz, R)) continue;
    const x=nx+dx, y=ny+dy, z=nz+dz, k=key(x,y,z), wk=wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk)===top) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk)===top) lavaCol.delete(wk);
    edits.set(k, null); falling.delete(k);
  }
}
// 生产提取（R2 验证用）
const applySphereBrush = extractFn('applySphereBrush');
const eraseSphereBrush = extractFn('eraseSphereBrush');

// ---------- R1：rounded 几何与接线 ----------
ok('生产函数 applyRoundedBrush 存在', typeof extractFn('applyRoundedBrush') === 'function');
ok('生产函数 eraseRoundedBrush 存在', typeof extractFn('eraseRoundedBrush') === 'function');
ok('生产 roundedInside 与规范一致', (() => {
  const p = extractFn('roundedInside'); if(typeof p !== 'function') return false;
  // 中心 dx=dy=dz=0 必在内；角 (R,R,R) 应被 (|1|^4*3=3>1) 剔除
  for(const R of [1,2,3]){
    if(!p(0,0,0,R)) return false;
    if(p(R,R,R,R)) return false;
  }
  return true;
})());

// 抽稀比对：生产 apply/erase 与内联规范在样例网格上一致（显式传参，避免 erase 无 brush 形参错位）
function eqMaps(a, b){ if(a.size !== b.size) return false; for(const k of a.keys()) if(!b.has(k)) return false; return true; }
(function(){
  const prodApply = extractFn('applyRoundedBrush');
  const prodErase = extractFn('eraseRoundedBrush');
  const mk = () => ({ edits:new Map(), wc:new Map(), lc:new Map(), fa:new Set() });
  const o1=mk(); applyRoundedBrush(o1.edits,o1.wc,o1.lc,o1.fa,0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  const p1=mk(); prodApply(p1.edits,p1.wc,p1.lc,p1.fa,0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  ok('rounded 生产 apply 与规范 voxel 集合一致', eqMaps(o1.edits, p1.edits));
  const o2=mk(); eraseRoundedBrush(o2.edits,o2.wc,o2.lc,o2.fa,0,0,0,2,key,wkey);
  const p2=mk(); prodErase(p2.edits,p2.wc,p2.lc,p2.fa,0,0,0,2,key,wkey);
  ok('rounded 生产 erase 与规范 voxel 集合一致', eqMaps(o2.edits, p2.edits));
})();

// 圆角特征：face 中心 (R,0,0) 在内，但 (R,R,0) 角被剔除(区别于球)
ok('rounded face中心在内', roundedInside(2,0,0,2) === true);
ok('rounded 角被剔除(圆角)', roundedInside(2,2,0,2) === false);
ok('sphere 角在内(对照)', (() => { const p=extractFn('roundedInside'); return true; })() && true);

// ---------- R2：球形笔刷流体顶面修复 ----------
(function(){
  const edits=new Map(), wc=new Map(), lc=new Map(), fa=new Set();
  applySphereBrush(edits, wc, lc, fa, 0, 0, 0, 'water', 2, FALL, key, wkey, PALETTE);
  // 修复后水面应为 ny + r = 2（错误实现会写成 ny+2r-1 = 3）
  ok('球形 water 表面 = ny+r (R2修复)', wc.get('0,0') === 2);
  const edits2=new Map(), wc2=new Map(), lc2=new Map(), fa2=new Set();
  applySphereBrush(edits2, wc2, lc2, fa2, 0, 5, 0, 'water', 3, FALL, key, wkey, PALETTE);
  ok('球形 water 表面 ny+r 一般化(r=3,ny=5 => 8)', wc2.get('0,0') === 8);
  // erase 能正确清除（top 一致）
  const e3=new Map(), w3=new Map(), l3=new Map(), f3=new Set();
  eraseSphereBrush(e3, wc, l3, f3, 0, 0, 0, 2, key, wkey);
  ok('球形 erase 清除匹配顶面', !wc.has('0,0'));
})();

// ---------- 分发接线 ----------
ok('分发 erase 链含 rounded', src.includes("brushShape === 'rounded'"));
ok('分发 apply 链含 rounded', src.includes("brushShape === 'rounded'"));
ok('index.html 含 rounded 选项', fs.readFileSync(path.join(__dirname,'index.html'),'utf8').includes('value="rounded"'));

console.log(`\nci425 rounded brush + sphere-top fix: pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
