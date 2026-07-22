// 忠实移植 voxel-world/main.js 的 applyTetrahedronBrush / eraseTetrahedronBrush / tetraInTri 纯函数并验证几何。
// 四面体(tetrahedron)：XZ 平面等边三角形截面(中心在 dx=dz=0，顶点朝上)，自底(满宽 R)向上收尖至顶，形成三角锥。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function tetraInTri(dx, dz, w){
  if(w <= 0) return dx === 0 && dz === 0;
  const ax = 0, ay = w, bx = -w*0.866, by = -w*0.5, cx = w*0.866, cy = -w*0.5;
  const s1 = (bx-ax)*(dz-ay) - (by-ay)*(dx-ax);
  const s2 = (cx-bx)*(dz-by) - (cy-by)*(dx-bx);
  const s3 = (ax-cx)*(dz-cy) - (ay-cy)*(dx-cx);
  return (s1>=0 && s2>=0 && s3>=0) || (s1<=0 && s2<=0 && s3<=0);
}
function tetraCount(R, H){
  R = Math.max(1, R|0); H = Math.max(1, H|0);
  let n = 0;
  for(let dy=0; dy<H; dy++){
    const w = H > 1 ? R * (1 - dy/(H-1)) : R;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){ if(tetraInTri(dx, dz, w)) n++; }
  }
  return n;
}
function applyTetrahedronBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const w = H > 1 ? R * (1 - dy/(H-1)) : R;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(!tetraInTri(dx, dz, w)) continue;
      const x = nx+dx, y = ny+dy, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseTetrahedronBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const w = H > 1 ? R * (1 - dy/(H-1)) : R;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(!tetraInTri(dx, dz, w)) continue;
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

// 格数 = 各层三角形截面之和(与 apply 同构，校验移植一致性)
ok('R=1,H=1 四面体 = tetraCount(1,1)=1', (()=>{ const e=new Map(); applyTetrahedronBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,1,FALL,key,wkey,PALETTE); return e.size===tetraCount(1,1) && e.size===1; })());
ok('R=2,H=1 四面体 = tetraCount(2,1)', (()=>{ const e=new Map(); applyTetrahedronBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,1,FALL,key,wkey,PALETTE); return e.size===tetraCount(2,1); })());
ok('R=3,H=1 四面体 = tetraCount(3,1)', (()=>{ const e=new Map(); applyTetrahedronBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.size===tetraCount(3,1); })());
ok('R=3,H=2 四面体 = tetraCount(3,2)', (()=>{ const e=new Map(); applyTetrahedronBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,2,FALL,key,wkey,PALETTE); return e.size===tetraCount(3,2); })());

// 单调：半径越大覆盖越多；高度越大覆盖越多
ok('半径越大覆盖越多', tetraCount(4,1) > tetraCount(3,1) && tetraCount(3,1) > tetraCount(2,1) && tetraCount(2,1) > tetraCount(1,1));
ok('高度越大覆盖越多', tetraCount(3,2) > tetraCount(3,1) && tetraCount(3,3) > tetraCount(3,2));
// 顶部为尖端：H>=2 时最高层仅 1 格(中心)
ok('顶部尖端仅 1 格', (()=>{ const e=new Map(); applyTetrahedronBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE);
  const ys = {}; for(const k of e.keys()){ const y = +k.split(',')[1]; ys[y]=(ys[y]||0)+1; }
  const maxY = Math.max(...Object.keys(ys).map(Number)); return ys[maxY]===1; })());
// 底面为居中等边三角形：含中心(dx=dz=0)且关于垂直轴(dx->-dx)对称
ok('底面含中心且关于 dx 镜像对称', (()=>{ const R=4; for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){ if(tetraInTri(dx,dz,R) !== tetraInTri(-dx,dz,R)) return false; } return tetraInTri(0,0,R); })());

// 颜色 / 流体 / 掉落
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyTetrahedronBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('water 写 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyTetrahedronBrush(new Map(),w,l,f,0,0,0,'water',3,1,FALL,key,wkey,PALETTE); return w.size===tetraCount(3,1); })());
ok('lava 写 lavaCol(且 water 为空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyTetrahedronBrush(new Map(),w,l,f,0,0,0,'lava',3,1,FALL,key,wkey,PALETTE); return l.size===tetraCount(3,1) && w.size===0; })());
ok('sand 进 falling', (()=>{ const f=new Set(); applyTetrahedronBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,1,FALL,key,wkey,PALETTE); return f.size===tetraCount(3,1); })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyTetrahedronBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyTetrahedronBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE);
  eraseTetrahedronBrush(e,new Map(),new Map(),new Set(),0,0,0,3,1,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===tetraCount(3,1); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyTetrahedronBrush(e,w,l,f,0,0,0,'water',3,1,FALL,key,wkey,PALETTE); eraseTetrahedronBrush(e,w,l,f,0,0,0,3,1,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

// ---- 接线检查 ----
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyTetrahedronBrush", /function applyTetrahedronBrush\(/.test(src));
ok("main.js 定义 eraseTetrahedronBrush", /function eraseTetrahedronBrush\(/.test(src));
ok("main.js 定义 tetraInTri", /function tetraInTri\(/.test(src));
ok("main.js 接线 applyTetrahedronBrush", /else if\(brushShape === 'tetrahedron'\) applyTetrahedronBrush/.test(src));
ok("main.js 接线 eraseTetrahedronBrush", /else if\(brushShape === 'tetrahedron'\) eraseTetrahedronBrush/.test(src));
ok("flash 标签含 tetrahedron", /brushShape === 'tetrahedron' \? '笔刷形状：四面体'/.test(src));
ok("index.html 含 tetrahedron 选项", /value="tetrahedron"/.test(html));

console.log(`tetrahedron: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
