// 忠实移植 voxel-world/main.js 的 applyArrowBrush / eraseArrowBrush 纯函数并验证几何。
// 箭头：底部 1×1 细杆 + 顶部圆锥箭头；与圆锥(cone)区分在于存在细杆段。统一 writeVoxel/clearVoxel 语义。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function arrowInside(dx, dz, dy, R, H){
  const headH = Math.max(1, R);
  if(dy >= H - headH){
    const t = dy - (H - headH);
    let r = (headH - 1) - t;
    if(r < 0) r = 0;
    return dx*dx + dz*dz <= r*r;
  }
  return dx === 0 && dz === 0;
}
function applyArrowBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!arrowInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseArrowBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!arrowInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
function voxCount(R,H){ let n=0; for(let dy=0;dy<H;dy++)for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++) if(arrowInside(dx,dz,dy,R,H)) n++; return n; }
function colCount(R,H){ const s=new Set(); for(let dy=0;dy<H;dy++)for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++) if(arrowInside(dx,dz,dy,R,H)) s.add(dx+','+dz); return s.size; }

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('arrow R=2,H=6 体素数=voxCount', (()=>{ const e=new Map(); applyArrowBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,6,FALL,key,wkey,PALETTE); return e.size===voxCount(2,6); })());
ok('arrow R=3,H=8 体素数=voxCount', (()=>{ const e=new Map(); applyArrowBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,8,FALL,key,wkey,PALETTE); return e.size===voxCount(3,8); })());
ok('arrow 含细杆中心(0,0)', (()=>{ const e=new Map(); applyArrowBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,8,FALL,key,wkey,PALETTE); return e.has(key(0,0,0)); })());
ok('arrow 顶尖在最上层(仅中心)', (()=>{ const e=new Map(); applyArrowBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,8,FALL,key,wkey,PALETTE); const topY=7; return e.has(key(0,topY,0)) && !e.has(key(1,topY,0)); })());
ok('arrow 不含杆外(1,0)在杆段', (()=>{ const e=new Map(); applyArrowBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,8,FALL,key,wkey,PALETTE); return !e.has(key(1,2,0)); })());
ok('arrow 颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyArrowBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,8,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('arrow water 写 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyArrowBrush(new Map(),w,l,f,0,0,0,'water',3,8,FALL,key,wkey,PALETTE); return w.size===colCount(3,8); })());
ok('arrow lava 写 lavaCol(water 空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyArrowBrush(new Map(),w,l,f,0,0,0,'lava',3,8,FALL,key,wkey,PALETTE); return l.size===colCount(3,8) && w.size===0; })());
ok('arrow sand 进 falling', (()=>{ const f=new Set(); applyArrowBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,8,FALL,key,wkey,PALETTE); return f.size===voxCount(3,8); })());
ok('arrow stone 不进 falling', (()=>{ const f=new Set(); applyArrowBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,8,FALL,key,wkey,PALETTE); return f.size===0; })());
ok('arrow 擦除后值全 null', (()=>{ const e=new Map(); applyArrowBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,8,FALL,key,wkey,PALETTE); eraseArrowBrush(e,new Map(),new Map(),new Set(),0,0,0,3,8,key,wkey); for(const v of e.values()) if(v!==null) return false; return e.size===voxCount(3,8); })());
ok('arrow 擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyArrowBrush(e,w,l,f,0,0,0,'water',3,8,FALL,key,wkey,PALETTE); eraseArrowBrush(e,w,l,f,0,0,0,3,8,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

// ---- 接线检查 + 隐性问题修复(flash 兜底回显真实形状名) ----
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyArrowBrush", /function applyArrowBrush\(/.test(src));
ok("main.js 定义 eraseArrowBrush", /function eraseArrowBrush\(/.test(src));
ok("main.js 定义 arrowInside", /function arrowInside\(/.test(src));
ok("main.js 接线 apply", /else if\(brushShape === 'arrow'\) applyArrowBrush/.test(src));
ok("main.js 接线 erase", /else if\(brushShape === 'arrow'\) eraseArrowBrush/.test(src));
ok("flash 标签含 箭头", /笔刷形状：箭头/.test(src));
ok("flash 兜底回显真实形状名(非'立方体')", /: '笔刷形状：' \+ brushShape/.test(src));
ok("index.html 含 arrow 选项", /value="arrow"/.test(html));

console.log('arrow: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
