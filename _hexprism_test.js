// 忠实移植 voxel-world/main.js 的 applyHexPrismBrush / eraseHexPrismBrush 纯函数并验证几何。
// 六棱柱(hexPrism)：XZ 平面正六边形截面(apothem=R，顶点沿 ±z)，整柱拉伸。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function hexInside(dx, dz, R){
  const a = R;
  const n1 = Math.abs(dx);
  const n2 = Math.abs(0.5 * dx + Math.sqrt(3)/2 * dz);
  const n3 = Math.abs(-0.5 * dx + Math.sqrt(3)/2 * dz);
  return Math.max(n1, n2, n3) <= a + 1e-9;
}
function hexCount(R){ let n=0; for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(hexInside(dx,dz,R)) n++; } return n; }

function applyHexPrismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(!hexInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseHexPrismBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(!hexInside(dx, dz, R)) continue;
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

// 格数 = 六边形单层 × 高度
ok('R=1,H=1 六棱柱 = hexCount(1)', (()=>{ const e=new Map(); applyHexPrismBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,1,FALL,key,wkey,PALETTE); return e.size===hexCount(1); })());
ok('R=2,H=1 六棱柱 = hexCount(2)', (()=>{ const e=new Map(); applyHexPrismBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,1,FALL,key,wkey,PALETTE); return e.size===hexCount(2); })());
ok('R=3,H=1 六棱柱 = hexCount(3)', (()=>{ const e=new Map(); applyHexPrismBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.size===hexCount(3); })());
ok('R=4,H=1 六棱柱 = hexCount(4)', (()=>{ const e=new Map(); applyHexPrismBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',4,1,FALL,key,wkey,PALETTE); return e.size===hexCount(4); })());
ok('R=3,H=2 六棱柱 = hexCount(3)*2', (()=>{ const e=new Map(); applyHexPrismBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,2,FALL,key,wkey,PALETTE); return e.size===hexCount(3)*2; })());

// 单调性：半径越大覆盖越多
ok('半径越大覆盖越多', hexCount(4) > hexCount(3) && hexCount(3) > hexCount(2) && hexCount(2) > hexCount(1));
// 中心格恒在
ok('中心格(dx=0,dz=0) 恒在六边形内', (()=>{ for(const R of [1,2,3,4,5]) if(!hexInside(0,0,R)) return false; return true; })());
// 关于 x 镜像对称(六边形偶对称)
ok('关于 x 镜像对称', (()=>{ const R=4; const s=new Set(); for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(hexInside(dx,dz,R)) s.add(dx+','+dz); } for(const p of s){ const [dx,dz]=p.split(',').map(Number); if(!s.has((-dx)+','+dz)) return false; } return true; })());
// 关于 z 镜像对称(六边形偶对称)
ok('关于 z 镜像对称', (()=>{ const R=4; const s=new Set(); for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(hexInside(dx,dz,R)) s.add(dx+','+dz); } for(const p of s){ const [dx,dz]=p.split(',').map(Number); if(!s.has(dx+','+(-dz))) return false; } return true; })());

// 颜色 / 流体 / 掉落
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyHexPrismBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('water 写 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyHexPrismBrush(new Map(),w,l,f,0,0,0,'water',3,1,FALL,key,wkey,PALETTE); return w.size===hexCount(3); })());
ok('lava 写 lavaCol(且 water 为空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyHexPrismBrush(new Map(),w,l,f,0,0,0,'lava',3,1,FALL,key,wkey,PALETTE); return l.size===hexCount(3) && w.size===0; })());
ok('sand 进 falling', (()=>{ const f=new Set(); applyHexPrismBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,1,FALL,key,wkey,PALETTE); return f.size===hexCount(3); })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyHexPrismBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyHexPrismBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE);
  eraseHexPrismBrush(e,new Map(),new Map(),new Set(),0,0,0,3,1,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===hexCount(3); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyHexPrismBrush(e,w,l,f,0,0,0,'water',3,1,FALL,key,wkey,PALETTE); eraseHexPrismBrush(e,w,l,f,0,0,0,3,1,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

// ---- 接线检查 ----
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyHexPrismBrush", /function applyHexPrismBrush\(/.test(src));
ok("main.js 定义 eraseHexPrismBrush", /function eraseHexPrismBrush\(/.test(src));
ok("main.js 定义 hexInside", /function hexInside\(/.test(src));
ok("main.js 接线 applyHexPrismBrush", /else if\(brushShape === 'hexprism'\) applyHexPrismBrush/.test(src));
ok("main.js 接线 eraseHexPrismBrush", /else if\(brushShape === 'hexprism'\) eraseHexPrismBrush/.test(src));
ok("flash 标签含 hexprism", /brushShape === 'hexprism' \? '笔刷形状：六棱柱/.test(src));
ok("index.html 含 hexprism 选项", /value="hexprism"/.test(html));

console.log(`hexprism: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
