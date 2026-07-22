// 忠实移植 voxel-world/main.js 的 applyStarBrush / eraseStarBrush 纯函数并验证几何。
// 星形：每层取圆盘内「十字臂(dx=0|dz=0) + 对角臂(|dx|=|dz|)」构八角星截面，整柱拉伸。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

// 单层星形截面格数（圆盘内、十字/对角臂）
function layerCount(R){
  let n=0;
  for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
    if(dx*dx+dz*dz > R*R) continue;
    if(!(dx===0 || dz===0 || Math.abs(dx)===Math.abs(dz))) continue;
    n++;
  }
  return n;
}
function applyStarBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(dx*dx + dz*dz > R*R) continue;
      if(!(dx===0 || dz===0 || Math.abs(dx)===Math.abs(dz))) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseStarBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0);
  const H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){
    const y = ny + dy;
    for(let dx=-R+1; dx<R; dx++) for(let dz=-R+1; dz<R; dz++){
      if(dx*dx + dz*dz > R*R) continue;
      if(!(dx===0 || dz===0 || Math.abs(dx)===Math.abs(dz))) continue;
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

// 格数 = 单层截面 × 高度
ok('R=1,H=1 星形 1 格', (()=>{ const e=new Map(); applyStarBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,1,FALL,key,wkey,PALETTE); return e.size===layerCount(1); })());
ok('R=2,H=1 星形 9 格', (()=>{ const e=new Map(); applyStarBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,1,FALL,key,wkey,PALETTE); return e.size===layerCount(2); })());
ok('R=3,H=1 星形 17 格', (()=>{ const e=new Map(); applyStarBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.size===layerCount(3); })());
ok('R=2,H=4 星形 36 格', (()=>{ const e=new Map(); applyStarBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,4,FALL,key,wkey,PALETTE); return e.size===layerCount(2)*4; })());

// 关于 x/z 镜像对称（十字+对角臂天然对称）
ok('关于 x 镜像对称', (()=>{ const R=3; const s=new Set(); for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(dx*dx+dz*dz>R*R) continue; if(dx===0||dz===0||Math.abs(dx)===Math.abs(dz)) s.add(dx+','+dz); } for(const p of s){ const [dx,dz]=p.split(',').map(Number); if(!s.has((-dx)+','+dz)) return false; } return true; })());
ok('关于 z 镜像对称', (()=>{ const R=3; const s=new Set(); for(let dx=-R+1;dx<R;dx++) for(let dz=-R+1;dz<R;dz++){ if(dx*dx+dz*dz>R*R) continue; if(dx===0||dz===0||Math.abs(dx)===Math.abs(dz)) s.add(dx+','+dz); } for(const p of s){ const [dx,dz]=p.split(',').map(Number); if(!s.has(dx+','+(-dz))) return false; } return true; })());
// 含中心轴与四对角（非空星形）
ok('含中心格(dx=0,dz=0)', (()=>{ const e=new Map(); applyStarBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.has(key(0,0,0)); })());
ok('含对角臂(dx=2,dz=2)', (()=>{ const e=new Map(); applyStarBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.has(key(2,0,2)); })());
ok('不含纯角外格(dx=2,dz=0 在臂上,dx=2,dz=1 不在)', (()=>{ const e=new Map(); applyStarBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.has(key(2,0,0)) && !e.has(key(2,0,1)); })());

// 颜色 / 流体 / 掉落
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyStarBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('water 写 waterCol(列数=去重列)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyStarBrush(new Map(),w,l,f,0,0,0,'water',3,1,FALL,key,wkey,PALETTE); return w.size===layerCount(3); })());
ok('lava 写 lavaCol(列数=去重列, 且 water 为空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyStarBrush(new Map(),w,l,f,0,0,0,'lava',3,1,FALL,key,wkey,PALETTE); return l.size===layerCount(3) && w.size===0; })());
ok('sand 进 falling', (()=>{ const f=new Set(); applyStarBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,1,FALL,key,wkey,PALETTE); return f.size===layerCount(3); })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyStarBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyStarBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE);
  eraseStarBrush(e,new Map(),new Map(),new Set(),0,0,0,3,1,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===layerCount(3); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyStarBrush(e,w,l,f,0,0,0,'water',3,1,FALL,key,wkey,PALETTE); eraseStarBrush(e,w,l,f,0,0,0,3,1,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

// ---- 接线检查 ----
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyStarBrush", /function applyStarBrush\(/.test(src));
ok("main.js 定义 eraseStarBrush", /function eraseStarBrush\(/.test(src));
ok("main.js 接线 applyStarBrush", /else if\(brushShape === 'star'\) applyStarBrush/.test(src));
ok("main.js 接线 eraseStarBrush", /else if\(brushShape === 'star'\) eraseStarBrush/.test(src));
ok("index.html 含 star 选项", /value="star"/.test(html));

console.log(`star: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
