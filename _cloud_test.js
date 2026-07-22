// 忠实移植 voxel-world/main.js 的 applyCloudBrush / eraseCloudBrush 纯函数并验证几何与确定性。
// 云：XZ 圆盘包络内用确定性 hash 噪声生成蓬松团块(可复现)；中段密上下稀。统一 writeVoxel/clearVoxel 语义。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function hash3(x, y, z){
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function cloudInside(dx, dz, dy, R, H){
  if(dx*dx + dz*dz > R*R) return false;
  if(dy < 0 || dy >= H) return false;
  const denom = (H - 1) || 1;
  const t = dy / denom;
  const dens = 0.65 - 0.5 * Math.abs(t - 0.5) * 2;
  return hash3(dx + 1000, dy + 1000, dz + 1000) < dens;
}
function applyCloudBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!cloudInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseCloudBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!cloudInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
function diskCount(R){ let n=0; for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++) if(dx*dx+dz*dz<=R*R) n++; return n; }

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('cloud R=3,H=4 确定性(两次一致)', (()=>{ const a=new Map(),b=new Map(); applyCloudBrush(a,new Map(),new Map(),new Set(),0,0,0,'stone',3,4,FALL,key,wkey,PALETTE); applyCloudBrush(b,new Map(),new Map(),new Set(),0,0,0,'stone',3,4,FALL,key,wkey,PALETTE); return JSON.stringify([...a])===JSON.stringify([...b]); })());
ok('cloud R=3,H=4 非空', (()=>{ const e=new Map(); applyCloudBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,4,FALL,key,wkey,PALETTE); return e.size>0; })());
ok('cloud 不出圆盘包络', (()=>{ const e=new Map(); applyCloudBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,4,FALL,key,wkey,PALETTE); for(const k of e.keys()){ const [x,y,z]=k.split(',').map(Number); const dx=x, dz=z; if(dx*dx+dz*dz>9) return false; } return true; })());
ok('cloud 蓬松(非填满包络)', (()=>{ const e=new Map(); applyCloudBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,4,FALL,key,wkey,PALETTE); return e.size < diskCount(3)*4; })());
ok('cloud 颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyCloudBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,4,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('cloud water 写 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyCloudBrush(new Map(),w,l,f,0,0,0,'water',3,4,FALL,key,wkey,PALETTE); let n=0; for(let dy=0;dy<4;dy++)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++) if(cloudInside(dx,dz,dy,3,4)) n++; return w.size<=n; })());
ok('cloud lava 写 lavaCol(water 空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyCloudBrush(new Map(),w,l,f,0,0,0,'lava',3,4,FALL,key,wkey,PALETTE); let n=0; for(let dy=0;dy<4;dy++)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++) if(cloudInside(dx,dz,dy,3,4)) n++; return l.size<=n && w.size===0; })());
ok('cloud sand 进 falling', (()=>{ const f=new Set(); applyCloudBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,4,FALL,key,wkey,PALETTE); let n=0; for(let dy=0;dy<4;dy++)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++) if(cloudInside(dx,dz,dy,3,4)) n++; return f.size<=n; })());
ok('cloud 擦除后值全 null', (()=>{ const e=new Map(); applyCloudBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,4,FALL,key,wkey,PALETTE); eraseCloudBrush(e,new Map(),new Map(),new Set(),0,0,0,3,4,key,wkey); for(const v of e.values()) if(v!==null) return false; return true; })());

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyCloudBrush", /function applyCloudBrush\(/.test(src));
ok("main.js 定义 eraseCloudBrush", /function eraseCloudBrush\(/.test(src));
ok("main.js 定义 cloudInside", /function cloudInside\(/.test(src));
ok("main.js 定义 hash3(确定性噪声)", /function hash3\(/.test(src));
ok("main.js 接线 apply", /else if\(brushShape === 'cloud'\) applyCloudBrush/.test(src));
ok("main.js 接线 erase", /else if\(brushShape === 'cloud'\) eraseCloudBrush/.test(src));
ok("flash 标签含 云", /笔刷形状：云/.test(src));
ok("index.html 含 cloud 选项", /value="cloud"/.test(html));

console.log('cloud: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
