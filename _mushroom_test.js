// 忠实移植 voxel-world/main.js 的 applyMushroomBrush / eraseMushroomBrush 纯函数并验证几何。
// 蘑菇：下半 1×1 菌柄 + 上半倒锥菌盖；与圆柱(整柱同宽)区分。统一 writeVoxel/clearVoxel 语义。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function mushroomInside(dx, dz, dy, R, H){
  const stemH = Math.max(1, Math.floor(H/2));
  if(dy < stemH) return dx === 0 && dz === 0;
  const capH = H - stemH;
  if(capH <= 0) return false;
  const t = dy - stemH;
  let r = Math.round(R * (capH - 1 - t) / Math.max(1, capH - 1));
  if(r < 0) r = 0;
  return dx*dx + dz*dz <= r*r;
}
function applyMushroomBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!mushroomInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseMushroomBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!mushroomInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
function diskArea(rr){ let n=0; for(let dx=-rr; dx<=rr; dx++) for(let dz=-rr; dz<=rr; dz++) if(dx*dx+dz*dz<=rr*rr) n++; return n; }
function voxCount(R,H){ let n=0; const stemH=Math.max(1,Math.floor(H/2)); for(let dy=0;dy<H;dy++){ if(dy<stemH){ n+=1; continue; } const capH=H-stemH; if(capH<=0) continue; const t=dy-stemH; let r=Math.round(R*(capH-1-t)/Math.max(1,capH-1)); if(r<0)r=0; n+=diskArea(r); } return n; }
function colCount(R,H){ const s=new Set(); const stemH=Math.max(1,Math.floor(H/2)); for(let dy=0;dy<H;dy++){ if(dy<stemH){ s.add('0,0'); continue; } const capH=H-stemH; if(capH<=0) continue; const t=dy-stemH; let r=Math.round(R*(capH-1-t)/Math.max(1,capH-1)); if(r<0)r=0; for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++) if(dx*dx+dz*dz<=r*r) s.add(dx+','+dz); } return s.size; }

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('mushroom R=3,H=5 体素数=voxCount', (()=>{ const e=new Map(); applyMushroomBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,5,FALL,key,wkey,PALETTE); return e.size===voxCount(3,5); })());
ok('mushroom R=2,H=6 体素数=voxCount', (()=>{ const e=new Map(); applyMushroomBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,6,FALL,key,wkey,PALETTE); return e.size===voxCount(2,6); })());
ok('mushroom 菌柄仅 1×1 中心', (()=>{ const e=new Map(); applyMushroomBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); return e.has(key(0,0,0)) && !e.has(key(1,0,0)); })());
ok('mushroom 菌盖底最宽(R 处)', (()=>{ const e=new Map(); applyMushroomBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); const stemH=Math.max(1,Math.floor(6/2)); return e.has(key(3,stemH,0)) && !e.has(key(3,stemH-1,0)); })());
ok('mushroom 菌盖顶尖仅中心', (()=>{ const e=new Map(); applyMushroomBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); const top=5; return e.has(key(0,top,0)) && !e.has(key(1,top,0)); })());
ok('mushroom 颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyMushroomBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('mushroom water 写 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyMushroomBrush(new Map(),w,l,f,0,0,0,'water',3,6,FALL,key,wkey,PALETTE); return w.size===colCount(3,6); })());
ok('mushroom lava 写 lavaCol(water 空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyMushroomBrush(new Map(),w,l,f,0,0,0,'lava',3,6,FALL,key,wkey,PALETTE); return l.size===colCount(3,6) && w.size===0; })());
ok('mushroom sand 进 falling', (()=>{ const f=new Set(); applyMushroomBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,6,FALL,key,wkey,PALETTE); return f.size===voxCount(3,6); })());
ok('mushroom stone 不进 falling', (()=>{ const f=new Set(); applyMushroomBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); return f.size===0; })());
ok('mushroom 擦除后值全 null', (()=>{ const e=new Map(); applyMushroomBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,6,FALL,key,wkey,PALETTE); eraseMushroomBrush(e,new Map(),new Map(),new Set(),0,0,0,3,6,key,wkey); for(const v of e.values()) if(v!==null) return false; return e.size===voxCount(3,6); })());
ok('mushroom 擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyMushroomBrush(e,w,l,f,0,0,0,'water',3,6,FALL,key,wkey,PALETTE); eraseMushroomBrush(e,w,l,f,0,0,0,3,6,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyMushroomBrush", /function applyMushroomBrush\(/.test(src));
ok("main.js 定义 eraseMushroomBrush", /function eraseMushroomBrush\(/.test(src));
ok("main.js 定义 mushroomInside", /function mushroomInside\(/.test(src));
ok("main.js 接线 apply", /else if\(brushShape === 'mushroom'\) applyMushroomBrush/.test(src));
ok("main.js 接线 erase", /else if\(brushShape === 'mushroom'\) eraseMushroomBrush/.test(src));
ok("flash 标签含 蘑菇", /笔刷形状：蘑菇/.test(src));
ok("index.html 含 mushroom 选项", /value="mushroom"/.test(html));

console.log('mushroom: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
