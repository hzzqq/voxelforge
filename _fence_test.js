// 忠实移植 voxel-world/main.js 的 applyFenceBrush / eraseFenceBrush 纯函数并验证几何。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function polyInside(dx, dz, R, n, rot){
  const vx = [], vz = [];
  for(let i=0;i<n;i++){ const a = rot + i*2*Math.PI/n; vx.push(Math.cos(a)*R); vz.push(Math.sin(a)*R); }
  for(let i=0;i<n;i++){
    const x1=vx[i], y1=vz[i], x2=vx[(i+1)%n], y2=vz[(i+1)%n];
    const e = (x2-x1)*(dz-y1) - (y2-y1)*(dx-x1);
    const c = (x2-x1)*(0-y1) - (y2-y1)*(0-x1);
    if(e*c < 0) return false;
  }
  return true;
}
function gearInside(dx, dz, R){
  const dist = Math.hypot(dx, dz);
  const innerR = R*0.7;
  if(dist < innerR || dist > R) return false;
  const N = 10, period = 2*Math.PI/N, f = 0.5;
  const ang = Math.atan2(dz, dx);
  const a = ((ang % period) + period) % period;
  return a <= period*f;
}
function archInside(dx, dz, R){
  const dist = Math.hypot(dx, dz);
  const innerR = R*0.6;
  if(dz <= 0) return dist <= R;
  return dist >= innerR && dist <= R;
}
function honeycombInside(dx, dz, R){
  const dist = Math.hypot(dx, dz);
  if(dist > R) return false;
  const g = Math.max(2, Math.round(R/2)), hr = g*0.42;
  for(let j=-(R+2); j<=(R+2); j++){
    const off = (j & 1) ? g/2 : 0, cy = j*g*0.866;
    for(let i=-(R+2); i<=(R+2); i++){
      if(Math.hypot(dx-(i*g+off), dz-cy) < hr) return false;
    }
  }
  return true;
}
function zigzagInside(dx, dz, R){
  if(dx < -R || dx > R) return false;
  const A = R, period = Math.max(2, R);
  const t = (((dx + R) % (2*period)) + 2*period) % (2*period);
  const tri = t < period ? (t/period) : (2 - t/period);
  const zc = Math.round(tri*A - A/2);
  return Math.abs(dz - zc) <= 1;
}

// 本笔刷的几何判定(与 main.js 内联实现等价)
function ins(dx, dz, dy, R, H){ const posts=[]; for(let px=-R;px<=R;px+=2) posts.push(px); const inPost = posts.indexOf(dx)>=0 && Math.abs(dz)<=1; const inRail=(dy===H-1) && Math.abs(dz)<=1; return inPost||inRail; }
// 通用 apply/erase(使用 ins)——与 main.js Fence 笔刷同构
function applyX(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!ins(dx,dz,dy,R,H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseX(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!ins(dx,dz,dy,R,H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
function voxCount(R,H){ let n=0; for(let dy=0;dy<H;dy++)for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++) if(ins(dx,dz,dy,R,H)) n++; return n; }
function colCount(R,H){ const s=new Set(); for(let dy=0;dy<H;dy++)for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++) if(ins(dx,dz,dy,R,H)) s.add(dx+','+dz); return s.size; }
let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }
ok('fence R=2,H=3 体素数=voxCount', (()=>{ const e=new Map(); applyX(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,3,FALL,key,wkey,PALETTE); return e.size===voxCount(2,3); })());
ok('fence R=3,H=3 体素数=voxCount', (()=>{ const e=new Map(); applyX(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return e.size===voxCount(3,3); })());
ok('fence 半径越大覆盖越多', voxCount(1,3) < voxCount(2,3) && voxCount(2,3) < voxCount(3,3));
ok('fence 高度越大覆盖越多', voxCount(2,2) < voxCount(2,3) && voxCount(2,3) < voxCount(2,4));
ok('fence 颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyX(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('fence water 写 waterCol(按列计)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyX(new Map(),w,l,f,0,0,0,'water',3,3,FALL,key,wkey,PALETTE); return w.size===colCount(3,3); })());
ok('fence lava 写 lavaCol(且 water 为空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyX(new Map(),w,l,f,0,0,0,'lava',3,3,FALL,key,wkey,PALETTE); return l.size===colCount(3,3) && w.size===0; })());
ok('fence sand 进 falling', (()=>{ const f=new Set(); applyX(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,3,FALL,key,wkey,PALETTE); return f.size===voxCount(3,3); })());
ok('fence stone 不进 falling', (()=>{ const f=new Set(); applyX(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return f.size===0; })());
ok('fence 擦除后值全 null', (()=>{ const e=new Map(); applyX(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); eraseX(e,new Map(),new Map(),new Set(),0,0,0,3,3,key,wkey); for(const v of e.values()) if(v!==null) return false; return e.size===voxCount(3,3); })());
ok('fence 擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyX(e,w,l,f,0,0,0,'water',3,3,FALL,key,wkey,PALETTE); eraseX(e,w,l,f,0,0,0,3,3,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyFenceBrush", new RegExp("function applyFenceBrush\\(").test(src));
ok("main.js 定义 eraseFenceBrush", new RegExp("function eraseFenceBrush\\(").test(src));
ok("main.js 接线 applyFenceBrush", new RegExp("else if\\(brushShape === 'fence'\\) applyFenceBrush").test(src));
ok("main.js 接线 eraseFenceBrush", new RegExp("else if\\(brushShape === 'fence'\\) eraseFenceBrush").test(src));
ok("flash 标签含 fence", new RegExp("brushShape === 'fence' \\? '笔刷形状：栅栏'").test(src));
ok("flash 内容含 栅栏", new RegExp("笔刷形状：栅栏").test(src));
ok("index.html 含 fence 选项", new RegExp('value="fence"').test(html));
console.log('fence: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);