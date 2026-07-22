// 忠实移植 voxel-world/main.js 的 applyRingBrush / eraseRingBrush 纯函数并验证几何。
// 环形(annulus)：每层取「圆盘 - 内孔(inner=floor(R/2))」的环形截面，整柱拉伸。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

// 在 [-R+1, R-1]² 网格内、满足 dx²+dz² <= r² 的格数
function diskOverGrid(R){ let n=0; for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(dx*dx+dz*dz <= R*R) n++; } return n; }
// 在 [-R+1, R-1]² 网格内、满足 dx²+dz² <= inner² 的格数（环形内孔）
function holeCount(R, inner){ let n=0; for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(dx*dx+dz*dz <= inner*inner) n++; } return n; }
function ringCount(R){ const inner=Math.max(0,Math.floor(R/2)); return diskOverGrid(R) - holeCount(R, inner); }

function applyRingBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const inner = Math.max(0, Math.floor(R / 2));
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      const d2 = dx*dx + dz*dz;
      if(d2 > R*R) continue;
      if(d2 <= inner*inner) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseRingBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const inner = Math.max(0, Math.floor(R / 2));
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      const d2 = dx*dx + dz*dz;
      if(d2 > R*R) continue;
      if(d2 <= inner*inner) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null);
      falling.delete(k);
    }
  }
}

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

// 格数 = 环形单层 × 高度
ok('R=1,H=1 环形 0 格(内孔吞掉唯一中心)', (()=>{ const e=new Map(); applyRingBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,1,FALL,key,wkey,PALETTE); return e.size===ringCount(1); })());
ok('R=2,H=1 环形 4 格', (()=>{ const e=new Map(); applyRingBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,1,FALL,key,wkey,PALETTE); return e.size===ringCount(2); })());
ok('R=3,H=1 环形 16 格', (()=>{ const e=new Map(); applyRingBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.size===ringCount(3); })());
ok('R=4,H=1 环形 32 格', (()=>{ const e=new Map(); applyRingBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',4,1,FALL,key,wkey,PALETTE); return e.size===ringCount(4); })());
ok('R=3,H=2 环形 32 格', (()=>{ const e=new Map(); applyRingBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,2,FALL,key,wkey,PALETTE); return e.size===ringCount(3)*2; })());

// 关于 x / z 镜像对称（环形天然对称）
ok('关于 x 镜像对称', (()=>{ const R=4; const s=new Set(); for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ const d2=dx*dx+dz*dz; const inner=Math.floor(R/2); if(d2>R*R||d2<=inner*inner) continue; s.add(dx+','+dz); } for(const p of s){ const [dx,dz]=p.split(',').map(Number); if(!s.has((-dx)+','+dz)) return false; } return true; })());
ok('关于 z 镜像对称', (()=>{ const R=4; const s=new Set(); for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ const d2=dx*dx+dz*dz; const inner=Math.floor(R/2); if(d2>R*R||d2<=inner*inner) continue; s.add(dx+','+dz); } for(const p of s){ const [dx,dz]=p.split(',').map(Number); if(!s.has(dx+','+(-dz))) return false; } return true; })());
// 中心被内孔挖空
ok('中心格(dx=0,dz=0) 被挖空', (()=>{ const e=new Map(); applyRingBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return !e.has(key(0,0,0)); })());
// 外层存在（环形有材料）
ok('外层轴格(dx=2,dz=0) 存在', (()=>{ const e=new Map(); applyRingBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.has(key(2,0,0)); })());

// 颜色 / 流体 / 掉落
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyRingBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('water 写 waterCol(列数=去重列)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyRingBrush(new Map(),w,l,f,0,0,0,'water',3,1,FALL,key,wkey,PALETTE); return w.size===ringCount(3); })());
ok('lava 写 lavaCol(且 water 为空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyRingBrush(new Map(),w,l,f,0,0,0,'lava',3,1,FALL,key,wkey,PALETTE); return l.size===ringCount(3) && w.size===0; })());
ok('sand 进 falling', (()=>{ const f=new Set(); applyRingBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,1,FALL,key,wkey,PALETTE); return f.size===ringCount(3); })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyRingBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyRingBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE);
  eraseRingBrush(e,new Map(),new Map(),new Set(),0,0,0,3,1,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===ringCount(3); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyRingBrush(e,w,l,f,0,0,0,'water',3,1,FALL,key,wkey,PALETTE); eraseRingBrush(e,w,l,f,0,0,0,3,1,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

// ---- 接线检查 ----
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyRingBrush", /function applyRingBrush\(/.test(src));
ok("main.js 定义 eraseRingBrush", /function eraseRingBrush\(/.test(src));
ok("main.js 接线 applyRingBrush", /else if\(brushShape === 'ring'\) applyRingBrush/.test(src));
ok("main.js 接线 eraseRingBrush", /else if\(brushShape === 'ring'\) eraseRingBrush/.test(src));
ok("flash 标签含 ring", /brushShape === 'ring' \? '笔刷形状：圆环/.test(src));
ok("index.html 含 ring 选项", /value="ring"/.test(html));

console.log(`ring: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
