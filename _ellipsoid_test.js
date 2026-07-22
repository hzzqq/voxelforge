// 忠实移植 voxel-world/main.js 的 applyEllipsoidBrush / eraseEllipsoidBrush 纯函数并验证椭球几何。
// 椭球(ellipsoid)：XZ 半轴 radius，竖直半轴 (height-1)/2；按归一化方程 dx²/R² + ((dy-b)/b)² + dz²/R² <= 1 选体素。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function ellipsoidTest(dx, dy, dz, R, H){
  const b = (H - 1) / 2;
  if(b <= 0) return (dx*dx + dz*dz) / (R*R) <= 1;
  const cy = (dy - b) / b;
  return (dx*dx)/(R*R) + cy*cy + (dz*dz)/(R*R) <= 1;
}
function ellipsoidCount(R, H){
  R = Math.max(1, R|0); H = Math.max(1, H|0);
  let n = 0;
  for(let dy=0; dy<H; dy++) for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){ if(ellipsoidTest(dx, dy, dz, R, H)) n++; }
  return n;
}
// 流体按 XZ 列(wk)写入，多层会覆盖同一列，故流体条目数 = 唯一列数而非体素数。
function ellipsoidColCount(R, H){
  R = Math.max(1, R|0); H = Math.max(1, H|0);
  const s = new Set();
  for(let dy=0; dy<H; dy++) for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){ if(ellipsoidTest(dx, dy, dz, R, H)) s.add(dx+','+dz); }
  return s.size;
}
function applyEllipsoidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const b = (H - 1) / 2;
  for(let dy=0; dy<H; dy++){
    const cy = b > 0 ? (dy - b) / b : 0;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      const norm = b > 0 ? (dx*dx)/(R*R) + cy*cy + (dz*dz)/(R*R) : (dx*dx + dz*dz)/(R*R);
      if(norm > 1) continue;
      const x = nx+dx, y = ny+dy, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseEllipsoidBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const b = (H - 1) / 2;
  for(let dy=0; dy<H; dy++){
    const cy = b > 0 ? (dy - b) / b : 0;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      const norm = b > 0 ? (dx*dx)/(R*R) + cy*cy + (dz*dz)/(R*R) : (dx*dx + dz*dz)/(R*R);
      if(norm > 1) continue;
      const x = nx+dx, y = ny+dy, z = nz+dz;
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

// 格数 = 椭球方程切片之和(与 apply 同构，校验移植一致性)
ok('R=1,H=1 椭球 = ellipsoidCount(1,1)=5', (()=>{ const e=new Map(); applyEllipsoidBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,1,FALL,key,wkey,PALETTE); return e.size===ellipsoidCount(1,1) && e.size===5; })());
ok('R=2,H=1 椭球 = ellipsoidCount(2,1)=13', (()=>{ const e=new Map(); applyEllipsoidBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,1,FALL,key,wkey,PALETTE); return e.size===ellipsoidCount(2,1) && e.size===13; })());
ok('R=2,H=3 椭球 = ellipsoidCount(2,3)=15', (()=>{ const e=new Map(); applyEllipsoidBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,3,FALL,key,wkey,PALETTE); return e.size===ellipsoidCount(2,3) && e.size===15; })());
ok('R=3,H=3 椭球 = ellipsoidCount(3,3)=31', (()=>{ const e=new Map(); applyEllipsoidBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return e.size===ellipsoidCount(3,3) && e.size===31; })());

// 单调：半径越大覆盖越多；高度(H>=2)越大覆盖越多
ok('半径越大覆盖越多', ellipsoidCount(1,3) < ellipsoidCount(2,3) && ellipsoidCount(2,3) < ellipsoidCount(3,3));
ok('高度(H>=2)越大覆盖越多', ellipsoidCount(2,2) < ellipsoidCount(2,3) && ellipsoidCount(2,3) < ellipsoidCount(2,4));
// 关于 dx / dz 镜像对称(椭球方程对 dx,dz 偶对称)
ok('关于 dx 镜像对称', (()=>{ const R=4,H=5; for(let dx=-R; dx<=R; dx++) for(let dy=0; dy<H; dy++) for(let dz=-R; dz<=R; dz++){ if(ellipsoidTest(dx,dy,dz,R,H) !== ellipsoidTest(-dx,dy,dz,R,H)) return false; } return true; })());
ok('关于 dz 镜像对称', (()=>{ const R=4,H=5; for(let dx=-R; dx<=R; dx++) for(let dy=0; dy<H; dy++) for(let dz=-R; dz<=R; dz++){ if(ellipsoidTest(dx,dy,dz,R,H) !== ellipsoidTest(dx,dy,-dz,R,H)) return false; } return true; })());
// 中心(dx=dz=0, 中层)必含；边界外(角点 dx=R,dz=R)必不含
ok('中层中心含入', ellipsoidTest(0, 2, 0, 3, 5));
ok('角点(dx=R,dz=R)排除', !ellipsoidTest(3, 2, 3, 3, 5));

// 颜色 / 流体 / 掉落
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyEllipsoidBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('water 写 waterCol(按列计)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyEllipsoidBrush(new Map(),w,l,f,0,0,0,'water',3,3,FALL,key,wkey,PALETTE); return w.size===ellipsoidColCount(3,3); })());
ok('lava 写 lavaCol(且 water 为空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyEllipsoidBrush(new Map(),w,l,f,0,0,0,'lava',3,3,FALL,key,wkey,PALETTE); return l.size===ellipsoidColCount(3,3) && w.size===0; })());
ok('sand 进 falling', (()=>{ const f=new Set(); applyEllipsoidBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,3,FALL,key,wkey,PALETTE); return f.size===ellipsoidCount(3,3); })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyEllipsoidBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyEllipsoidBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE);
  eraseEllipsoidBrush(e,new Map(),new Map(),new Set(),0,0,0,3,3,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===ellipsoidCount(3,3); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyEllipsoidBrush(e,w,l,f,0,0,0,'water',3,3,FALL,key,wkey,PALETTE); eraseEllipsoidBrush(e,w,l,f,0,0,0,3,3,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

// ---- 接线检查 ----
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyEllipsoidBrush", /function applyEllipsoidBrush\(/.test(src));
ok("main.js 定义 eraseEllipsoidBrush", /function eraseEllipsoidBrush\(/.test(src));
ok("main.js 接线 applyEllipsoidBrush", /else if\(brushShape === 'ellipsoid'\) applyEllipsoidBrush/.test(src));
ok("main.js 接线 eraseEllipsoidBrush", /else if\(brushShape === 'ellipsoid'\) eraseEllipsoidBrush/.test(src));
ok("flash 标签含 ellipsoid", /brushShape === 'ellipsoid' \? '笔刷形状：椭球'/.test(src));
ok("index.html 含 ellipsoid 选项", /value="ellipsoid"/.test(html));

console.log(`ellipsoid: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
