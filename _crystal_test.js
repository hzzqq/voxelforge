// 忠实移植 voxel-world/main.js 的 applyCrystalBrush / eraseCrystalBrush 纯函数并验证几何。
// 晶体：沿 Y 拉长双锥(bipyramid)，中段最宽、两端收尖；H=1 退化为整盘；与菱形(曼哈顿八面体)区分。统一 writeVoxel/clearVoxel 语义。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function crystalInside(dx, dz, dy, R, H){
  let r;
  if(H === 1){ r = R; }
  else {
    const dmax = Math.max(1, Math.floor((H-1)/2));
    const d = Math.min(dy, H-1-dy);
    r = Math.round(R * d / dmax);
    if(r < 0) r = 0;
  }
  return dx*dx + dz*dz <= r*r;
}
function applyCrystalBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!crystalInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseCrystalBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!crystalInside(dx, dz, dy, R, H)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
function diskArea(rr){ let n=0; for(let dx=-rr; dx<=rr; dx++) for(let dz=-rr; dz<=rr; dz++) if(dx*dx+dz*dz<=rr*rr) n++; return n; }
function voxCount(R,H){ let n=0; for(let dy=0;dy<H;dy++){ let r; if(H===1){r=R;} else { const dmax=Math.max(1,Math.floor((H-1)/2)); const d=Math.min(dy,H-1-dy); r=Math.round(R*d/dmax); if(r<0)r=0; } n+=diskArea(r); } return n; }
function colCount(R,H){ const s=new Set(); for(let dy=0;dy<H;dy++){ let r; if(H===1){r=R;} else { const dmax=Math.max(1,Math.floor((H-1)/2)); const d=Math.min(dy,H-1-dy); r=Math.round(R*d/dmax); if(r<0)r=0; } for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++) if(dx*dx+dz*dz<=r*r) s.add(dx+','+dz); } return s.size; }

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('crystal R=2,H=1 = 整盘 13 格', (()=>{ const e=new Map(); applyCrystalBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,1,FALL,key,wkey,PALETTE); return e.size===diskArea(2); })());
ok('crystal R=2,H=5 体素数=voxCount(25)', (()=>{ const e=new Map(); applyCrystalBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,5,FALL,key,wkey,PALETTE); return e.size===voxCount(2,5); })());
ok('crystal R=3,H=7 体素数=voxCount', (()=>{ const e=new Map(); applyCrystalBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,7,FALL,key,wkey,PALETTE); return e.size===voxCount(3,7); })());
ok('crystal 关于中线对称', (()=>{ const R=3,H=7; for(let dy=0;dy<H;dy++){ let ra,rb; const f=(d)=>{ if(H===1)return R; const dmax=Math.max(1,Math.floor((H-1)/2)); return Math.round(R*Math.min(d,H-1-d)/dmax); }; if(f(dy)!==f(H-1-dy)) return false; } return true; })());
ok('crystal 上下两端仅中心点', (()=>{ const e=new Map(); applyCrystalBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,7,FALL,key,wkey,PALETTE); return e.has(key(0,0,0)) && e.has(key(0,6,0)) && !e.has(key(1,0,0)) && !e.has(key(1,6,0)); })());
ok('crystal 中段最宽(>杆段)', (()=>{ const e=new Map(); applyCrystalBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,7,FALL,key,wkey,PALETTE); const ys=new Map(); for(const k of e.keys()){ const [x,y,z]=k.split(',').map(Number); if(x===0&&z===0) ys.set(y,1); } return e.has(key(3,3,0)) && !e.has(key(3,0,0)); })());
ok('crystal 颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyCrystalBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,5,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('crystal water 写 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyCrystalBrush(new Map(),w,l,f,0,0,0,'water',2,5,FALL,key,wkey,PALETTE); return w.size===colCount(2,5); })());
ok('crystal lava 写 lavaCol(water 空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyCrystalBrush(new Map(),w,l,f,0,0,0,'lava',2,5,FALL,key,wkey,PALETTE); return l.size===colCount(2,5) && w.size===0; })());
ok('crystal sand 进 falling', (()=>{ const f=new Set(); applyCrystalBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',2,5,FALL,key,wkey,PALETTE); return f.size===voxCount(2,5); })());
ok('crystal stone 不进 falling', (()=>{ const f=new Set(); applyCrystalBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',2,5,FALL,key,wkey,PALETTE); return f.size===0; })());
ok('crystal 擦除后值全 null', (()=>{ const e=new Map(); applyCrystalBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,5,FALL,key,wkey,PALETTE); eraseCrystalBrush(e,new Map(),new Map(),new Set(),0,0,0,2,5,key,wkey); for(const v of e.values()) if(v!==null) return false; return e.size===voxCount(2,5); })());
ok('crystal 擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyCrystalBrush(e,w,l,f,0,0,0,'water',2,5,FALL,key,wkey,PALETTE); eraseCrystalBrush(e,w,l,f,0,0,0,2,5,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyCrystalBrush", /function applyCrystalBrush\(/.test(src));
ok("main.js 定义 eraseCrystalBrush", /function eraseCrystalBrush\(/.test(src));
ok("main.js 定义 crystalInside", /function crystalInside\(/.test(src));
ok("main.js 接线 apply", /else if\(brushShape === 'crystal'\) applyCrystalBrush/.test(src));
ok("main.js 接线 erase", /else if\(brushShape === 'crystal'\) eraseCrystalBrush/.test(src));
ok("flash 标签含 晶体", /笔刷形状：晶体/.test(src));
ok("index.html 含 crystal 选项", /value="crystal"/.test(html));

console.log('crystal: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
