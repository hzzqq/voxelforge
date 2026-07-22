// 忠实移植 voxel-world/main.js 的 applyCapsuleBrush / eraseCapsuleBrush 纯函数并验证几何。
// 胶囊形：中段全半径圆柱(R)、两端按半球帽收缩；圆盘判定 dx²+dz² <= rr²(与圆柱同)。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

// 与 main.js 完全一致的半径函数，供测试预估格数
function radiusAt(dy, H, R){
  const mid = (H - 1) / 2;
  const shoulder = Math.max(0, mid - R);
  let rr = R;
  if(Math.abs(dy - mid) > shoulder){ const t = Math.abs(dy - mid) - shoulder; rr = Math.floor(Math.sqrt(Math.max(0, R*R - t*t))); }
  if(rr < 1) rr = 1;
  return rr;
}
function diskArea(rr){ let n=0; for(let dx=-rr+1; dx<rr; dx++) for(let dz=-rr+1; dz<rr; dz++) if(dx*dx+dz*dz <= rr*rr) n++; return n; }
function expectedTotal(R, H){ let n=0; for(let dy=0; dy<H; dy++) n += diskArea(radiusAt(dy, H, R)); return n; }

function applyCapsuleBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const mid = (H - 1) / 2;
  const shoulder = Math.max(0, mid - R);
  for(let dy=0; dy<H; dy++){
    const d = Math.abs(dy - mid);
    let rr = R;
    if(d > shoulder){ const t = d - shoulder; rr = Math.floor(Math.sqrt(Math.max(0, R*R - t*t))); }
    if(rr < 1) rr = 1;
    const y = ny + dy;
    for(let dx=-rr+1; dx<rr; dx++) for(let dz=-rr+1; dz<rr; dz++){
      if(dx*dx + dz*dz > rr*rr) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseCapsuleBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  const mid = (H - 1) / 2;
  const shoulder = Math.max(0, mid - R);
  for(let dy=0; dy<H; dy++){
    const d = Math.abs(dy - mid);
    let rr = R;
    if(d > shoulder){ const t = d - shoulder; rr = Math.floor(Math.sqrt(Math.max(0, R*R - t*t))); }
    if(rr < 1) rr = 1;
    const y = ny + dy;
    for(let dx=-rr+1; dx<rr; dx++) for(let dz=-rr+1; dz<rr; dz++){
      if(dx*dx + dz*dz > rr*rr) continue;
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

// 格数 = 几何预估
ok('R=1,H=1 胶囊 1 格', (()=>{ const e=new Map(); applyCapsuleBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,1,FALL,key,wkey,PALETTE); return e.size===expectedTotal(1,1); })());
ok('R=2,H=5 胶囊 13 格', (()=>{ const e=new Map(); applyCapsuleBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,5,FALL,key,wkey,PALETTE); return e.size===expectedTotal(2,5); })());
ok('R=2,H=8 胶囊 37 格', (()=>{ const e=new Map(); applyCapsuleBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,8,FALL,key,wkey,PALETTE); return e.size===expectedTotal(2,8); })());
ok('R=3,H=3 胶囊 19 格(扁椭球)', (()=>{ const e=new Map(); applyCapsuleBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return e.size===expectedTotal(3,3); })());

// 关于中线镜像对称(两端半球对称)
ok('半径关于中线镜像对称', (()=>{ const R=3,H=9; for(let dy=0; dy<H; dy++){ if(radiusAt(dy,H,R)!==radiusAt(H-1-dy,H,R)) return false; } return true; })());
// 中段存在全半径层(H>=2R+1)
ok('H>=2R+1 时中部出现全半径层', (()=>{ const R=2,H=6; let hasFull=false; for(let dy=0; dy<H; dy++) if(radiusAt(dy,H,R)===R) hasFull=true; return hasFull; })());
// 高度足够时竖向拉成柱状(各层均含底格 ny)
ok('竖直方向占满 H 层', (()=>{ const e=new Map(); applyCapsuleBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,8,FALL,key,wkey,PALETTE);
  const ys=new Set([...e.keys()].map(k=>+k.split(',')[1])); for(let y=0;y<8;y++) if(!ys.has(y)) return false; return true; })());

// 颜色 / 流体 / 掉落
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyCapsuleBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,5,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
function distinctCols(R,H){ const s=new Set(); for(let dy=0;dy<H;dy++){ const rr=radiusAt(dy,H,R); for(let dx=-rr+1;dx<rr;dx++) for(let dz=-rr+1;dz<rr;dz++){ if(dx*dx+dz*dz>rr*rr) continue; s.add(dx+','+dz); } } return s.size; }
ok('water 写 waterCol(列数=去重列)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyCapsuleBrush(new Map(),w,l,f,0,0,0,'water',2,5,FALL,key,wkey,PALETTE); return w.size===distinctCols(2,5); })());
ok('lava 写 lavaCol(列数=去重列, 且 water 为空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyCapsuleBrush(new Map(),w,l,f,0,0,0,'lava',2,5,FALL,key,wkey,PALETTE); return l.size===distinctCols(2,5) && w.size===0; })());
ok('sand 进 falling', (()=>{ const f=new Set(); applyCapsuleBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',2,5,FALL,key,wkey,PALETTE); return f.size===expectedTotal(2,5); })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyCapsuleBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',2,5,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyCapsuleBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,5,FALL,key,wkey,PALETTE);
  eraseCapsuleBrush(e,new Map(),new Map(),new Set(),0,0,0,2,5,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===expectedTotal(2,5); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyCapsuleBrush(e,w,l,f,0,0,0,'water',2,5,FALL,key,wkey,PALETTE); eraseCapsuleBrush(e,w,l,f,0,0,0,2,5,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

// ---- 接线检查 ----
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyCapsuleBrush", /function applyCapsuleBrush\(/.test(src));
ok("main.js 定义 eraseCapsuleBrush", /function eraseCapsuleBrush\(/.test(src));
ok("main.js 接线 applyCapsuleBrush", /else if\(brushShape === 'capsule'\) applyCapsuleBrush/.test(src));
ok("main.js 接线 eraseCapsuleBrush", /else if\(brushShape === 'capsule'\) eraseCapsuleBrush/.test(src));
ok("index.html 含 capsule 选项", /value="capsule"/.test(html));

console.log(`capsule: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
