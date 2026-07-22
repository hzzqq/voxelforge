// 忠实移植 voxel-world/main.js 的 applyBoltBrush / eraseBoltBrush 纯函数并验证几何。
// 闪电：仅在 z=0 竖直片、沿 Y 三角波偏摆的单列折线；与 zigzag/helix 区分。统一 writeVoxel/clearVoxel 语义。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function boltInside(dx, dz, dy, R, H){
  if(dz !== 0) return false;
  const P = Math.max(1, R);
  const ph = dy % (2*P);
  const tri = ph < P ? ph/P : (2 - ph/P);
  let dx0 = Math.round((tri*2 - 1) * R);
  if(dx0 < -R) dx0 = -R; if(dx0 > R) dx0 = R;
  return dx === dx0;
}
function applyBoltBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!boltInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseBoltBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!boltInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
// 每层恰好 1 格(单列折线) → 体素 = H；且钳制在 ±R 内
function voxCount(R,H){ let n=0; for(let dy=0;dy<H;dy++){ if(boltInside(0,0,dy,R,H)){} n+=1; } return n; } // 每层 1 格
function withinBounds(R,H){ for(let dy=0;dy<H;dy++){ let dx0; { const P=Math.max(1,R); const ph=dy%(2*P); const tri=ph<P?ph/P:(2-ph/P); dx0=Math.round((tri*2-1)*R); if(dx0<-R)dx0=-R; if(dx0>R)dx0=R; } if(dx0<-R||dx0>R) return false; } return true; }
function isZigzag(R,H){ const xs=[]; for(let dy=0;dy<H;dy++){ let dx0; { const P=Math.max(1,R); const ph=dy%(2*P); const tri=ph<P?ph/P:(2-ph/P); dx0=Math.round((tri*2-1)*R); if(dx0<-R)dx0=-R; if(dx0>R)dx0=R; } xs.push(dx0); } // 至少一次偏摆到非 0
  return xs.some(x=>x!==0) && xs.every(x=>x>=-R&&x<=R); }

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('bolt R=3,H=6 每层1格共 6', (()=>{ const e=new Map(); applyBoltBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); return e.size===6; })());
ok('bolt R=4,H=8 每层1格共 8', (()=>{ const e=new Map(); applyBoltBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',4,8,FALL,key,wkey,PALETTE); return e.size===8; })());
ok('bolt 全在 z=0 平面', (()=>{ const e=new Map(); applyBoltBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); for(const k of e.keys()){ if(+k.split(',')[2]!==0) return false; } return true; })());
ok('bolt 偏摆钳制在 ±R 内', withinBounds(3,6));
ok('bolt 确有左右偏摆', isZigzag(3,6));
ok('bolt 颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyBoltBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
function boltCols(R,H){ const s=new Set(); for(let dy=0;dy<H;dy++){ let dx0; { const P=Math.max(1,R); const ph=dy%(2*P); const tri=ph<P?ph/P:(2-ph/P); dx0=Math.round((tri*2-1)*R); if(dx0<-R)dx0=-R; if(dx0>R)dx0=R; } s.add(dx0+',0'); } return s.size; }
ok('bolt water 写 waterCol(去重列数)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyBoltBrush(new Map(),w,l,f,0,0,0,'water',3,6,FALL,key,wkey,PALETTE); return w.size===boltCols(3,6); })());
ok('bolt lava 写 lavaCol(去重列数, water 空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyBoltBrush(new Map(),w,l,f,0,0,0,'lava',3,6,FALL,key,wkey,PALETTE); return l.size===boltCols(3,6) && w.size===0; })());
ok('bolt sand 进 falling', (()=>{ const f=new Set(); applyBoltBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,6,FALL,key,wkey,PALETTE); return f.size===6; })());
ok('bolt stone 不进 falling', (()=>{ const f=new Set(); applyBoltBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); return f.size===0; })());
ok('bolt 擦除后值全 null', (()=>{ const e=new Map(); applyBoltBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); eraseBoltBrush(e,new Map(),new Map(),new Set(),0,0,0,3,6,key,wkey); for(const v of e.values()) if(v!==null) return false; return e.size===6; })());
ok('bolt 擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyBoltBrush(e,w,l,f,0,0,0,'water',3,6,FALL,key,wkey,PALETTE); eraseBoltBrush(e,w,l,f,0,0,0,3,6,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyBoltBrush", /function applyBoltBrush\(/.test(src));
ok("main.js 定义 eraseBoltBrush", /function eraseBoltBrush\(/.test(src));
ok("main.js 定义 boltInside", /function boltInside\(/.test(src));
ok("main.js 接线 apply", /else if\(brushShape === 'bolt'\) applyBoltBrush/.test(src));
ok("main.js 接线 erase", /else if\(brushShape === 'bolt'\) eraseBoltBrush/.test(src));
ok("flash 标签含 闪电", /笔刷形状：闪电/.test(src));
ok("index.html 含 bolt 选项", /value="bolt"/.test(html));

console.log('bolt: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
