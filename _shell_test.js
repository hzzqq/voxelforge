// 忠实移植 voxel-world/main.js 的 applyShellBrush / eraseShellBrush 纯函数并验证几何。
// 球壳(shell)：以命中方块为球心，半径 R 的实心球掏去内层 innerR=R-max(1,round(R/3))，剩余为薄壁球壳。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function shellInside(dx, dy, dz, R){
  const innerR = Math.max(1, R - Math.max(1, Math.round(R/3)));
  const d2 = dx*dx + dy*dy + dz*dz;
  return d2 <= R*R && d2 > innerR*innerR;
}
function shellCount(R){ let n=0; for(let dy=-R+1;dy<R;dy++) for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(shellInside(dx,dy,dz,R)) n++; } return n; }
// 实心球(不含掏空)格数，用于比较“壳比实心少”
function solidCount(R){ let n=0; for(let dy=-R+1;dy<R;dy++) for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(dx*dx+dy*dy+dz*dz <= R*R) n++; } return n; }
// 球壳覆盖的去重 XZ 列数（waterCol/lavaCol 以列 key，多 y 层共享同一列）
function shellCols(R){ const s=new Set(); for(let dy=-R+1;dy<R;dy++) for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(shellInside(dx,dy,dz,R)) s.add(dx+','+dz); } return s.size; }

function applyShellBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0);
  const innerR = Math.max(1, R - Math.max(1, Math.round(R/3)));
  for(let dy=-R+1; dy<R; dy++) for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
    const d2 = dx*dx + dy*dy + dz*dz;
    if(d2 > R*R || d2 <= innerR*innerR) continue;
    const x = nx+dx, y = ny+dy, z = nz+dz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTEv[brush]);
    if(FALLv.has(brush)) falling.add(k);
  }
}
function eraseShellBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const innerR = Math.max(1, R - Math.max(1, Math.round(R/3)));
  for(let dy=-R+1; dy<R; dy++) for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
    const d2 = dx*dx + dy*dy + dz*dz;
    if(d2 > R*R || d2 <= innerR*innerR) continue;
    const x = nx+dx, y = ny+dy, z = nz+dz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(k, null);
    falling.delete(k);
  }
}

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

// 球壳是空心的：壳格数严格少于实心球
ok('R=2 壳格数 < 实心球', shellCount(2) < solidCount(2) && shellCount(2) > 0);
ok('R=3 壳格数 < 实心球', shellCount(3) < solidCount(3) && shellCount(3) > 0);
ok('R=4 壳格数 < 实心球', shellCount(4) < solidCount(4) && shellCount(4) > 0);
// 中心(内腔)不被填充
ok('中心(0,0,0) 在壳内被排除', shellInside(0,0,0,4) === false);
ok('中心格未写入编辑集', (()=>{ const e=new Map(); applyShellBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',4,4,FALL,key,wkey,PALETTE); return !e.has(key(0,0,0)); })());
// 半径越大壳越多（单调）
ok('半径越大壳越多', shellCount(4) > shellCount(3) && shellCount(3) > shellCount(2));
// 编辑集大小 = shellCount(R)
ok('R=3 编辑集大小 = shellCount(3)', (()=>{ const e=new Map(); applyShellBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return e.size===shellCount(3); })());
ok('R=4 编辑集大小 = shellCount(4)', (()=>{ const e=new Map(); applyShellBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',4,4,FALL,key,wkey,PALETTE); return e.size===shellCount(4); })());

// 颜色 / 流体 / 掉落
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyShellBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('water 写 waterCol(列数=去重列)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyShellBrush(new Map(),w,l,f,0,0,0,'water',3,3,FALL,key,wkey,PALETTE); return w.size===shellCols(3); })());
ok('lava 写 lavaCol(列数=去重列 且 water 为空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyShellBrush(new Map(),w,l,f,0,0,0,'lava',3,3,FALL,key,wkey,PALETTE); return l.size===shellCols(3) && w.size===0; })());
ok('sand 进 falling', (()=>{ const f=new Set(); applyShellBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,3,FALL,key,wkey,PALETTE); return f.size===shellCount(3); })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyShellBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyShellBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE);
  eraseShellBrush(e,new Map(),new Map(),new Set(),0,0,0,3,3,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===shellCount(3); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyShellBrush(e,w,l,f,0,0,0,'water',3,3,FALL,key,wkey,PALETTE); eraseShellBrush(e,w,l,f,0,0,0,3,3,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

// ---- 接线检查 ----
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyShellBrush", /function applyShellBrush\(/.test(src));
ok("main.js 定义 eraseShellBrush", /function eraseShellBrush\(/.test(src));
ok("main.js 接线 applyShellBrush", /else if\(brushShape === 'shell'\) applyShellBrush/.test(src));
ok("main.js 接线 eraseShellBrush", /else if\(brushShape === 'shell'\) eraseShellBrush/.test(src));
ok("flash 标签含 shell", /brushShape === 'shell' \? '笔刷形状：球壳\(空心球\)/.test(src));
ok("index.html 含 shell 选项", /value="shell"/.test(html));

console.log(`shell: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
