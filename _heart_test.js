// 忠实移植 voxel-world/main.js 的 applyHeartBrush / eraseHeartBrush 纯函数并验证几何。
// 心形(heart)：XZ 平面取心形截面(隐式公式 (X²+Y²-1)³ - X²Y³ ≤ 0，X=dx/s, Y=dz/s，s=(R-1)/1.3)，整柱拉伸。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function heartInside(dx, dz, R){
  const X = dx * 1.3 / R, Y = dz * 1.3 / R;
  const v = (X*X + Y*Y - 1);
  return v*v*v - X*X*Y*Y*Y <= 0;
}
function heartCount(R){ let n=0; for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(heartInside(dx,dz,R)) n++; } return n; }

function applyHeartBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      const X = dx * 1.3 / R, Y = dz * 1.3 / R;
      const v = (X*X + Y*Y - 1);
      if(v*v*v - X*X*Y*Y*Y > 0) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseHeartBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      const X = dx * 1.3 / R, Y = dz * 1.3 / R;
      const v = (X*X + Y*Y - 1);
      if(v*v*v - X*X*Y*Y*Y > 0) continue;
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

// 格数 = 心形单层 × 高度
ok('R=1,H=1 心形 1 格(中心)', (()=>{ const e=new Map(); applyHeartBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,1,FALL,key,wkey,PALETTE); return e.size===heartCount(1); })());
ok('R=2,H=1 心形 = heartCount(2)', (()=>{ const e=new Map(); applyHeartBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,1,FALL,key,wkey,PALETTE); return e.size===heartCount(2); })());
ok('R=3,H=1 心形 = heartCount(3)', (()=>{ const e=new Map(); applyHeartBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.size===heartCount(3); })());
ok('R=4,H=1 心形 = heartCount(4)', (()=>{ const e=new Map(); applyHeartBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',4,1,FALL,key,wkey,PALETTE); return e.size===heartCount(4); })());
ok('R=3,H=2 心形 = heartCount(3)*2', (()=>{ const e=new Map(); applyHeartBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,2,FALL,key,wkey,PALETTE); return e.size===heartCount(3)*2; })());

// 单调性：半径越大覆盖越多
ok('半径越大覆盖越多', heartCount(4) > heartCount(3) && heartCount(3) > heartCount(2) && heartCount(2) > heartCount(1));
// 中心格恒在
ok('中心格(dx=0,dz=0) 恒在心形内', (()=>{ for(const R of [1,2,3,4,5]) if(!heartInside(0,0,R)) return false; return true; })());
// 关于 x 镜像对称（心形对 Y 轴偶对称）
ok('关于 x 镜像对称', (()=>{ const R=4; const s=new Set(); for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(heartInside(dx,dz,R)) s.add(dx+','+dz); } for(const p of s){ const [dx,dz]=p.split(',').map(Number); if(!s.has((-dx)+','+dz)) return false; } return true; })());
// 下心形外区域(最远下角)dx=3,dz=-3 不在心形内（心形底部收窄，侧下角空）
ok('最远下角格不在心形内(R=4, dx=3,dz=-3)', !heartInside(3,-3,4));

// 颜色 / 流体 / 掉落
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyHeartBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('water 写 waterCol(列数=去重列)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyHeartBrush(new Map(),w,l,f,0,0,0,'water',3,1,FALL,key,wkey,PALETTE); return w.size===heartCount(3); })());
ok('lava 写 lavaCol(且 water 为空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyHeartBrush(new Map(),w,l,f,0,0,0,'lava',3,1,FALL,key,wkey,PALETTE); return l.size===heartCount(3) && w.size===0; })());
ok('sand 进 falling', (()=>{ const f=new Set(); applyHeartBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,1,FALL,key,wkey,PALETTE); return f.size===heartCount(3); })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyHeartBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyHeartBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE);
  eraseHeartBrush(e,new Map(),new Map(),new Set(),0,0,0,3,1,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===heartCount(3); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyHeartBrush(e,w,l,f,0,0,0,'water',3,1,FALL,key,wkey,PALETTE); eraseHeartBrush(e,w,l,f,0,0,0,3,1,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

// ---- 接线检查 ----
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyHeartBrush", /function applyHeartBrush\(/.test(src));
ok("main.js 定义 eraseHeartBrush", /function eraseHeartBrush\(/.test(src));
ok("main.js 接线 applyHeartBrush", /else if\(brushShape === 'heart'\) applyHeartBrush/.test(src));
ok("main.js 接线 eraseHeartBrush", /else if\(brushShape === 'heart'\) eraseHeartBrush/.test(src));
ok("flash 标签含 heart", /brushShape === 'heart' \? '笔刷形状：心形/.test(src));
ok("index.html 含 heart 选项", /value="heart"/.test(html));

console.log(`heart: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
