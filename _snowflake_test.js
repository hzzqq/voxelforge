// 忠实移植 voxel-world/main.js 的 applySnowflakeBrush / eraseSnowflakeBrush 纯函数并验证几何。
// 雪花：中心 + 6 向(60° 六轴)主臂 + 倒刺；统一调用 writeVoxel/clearVoxel 语义(流体顶 y+1、掉落、挖空)。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function snowflakeInside(dx, dz, R){
  if(dx === 0 && dz === 0) return true;
  const dirs = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
  for(const [ux,uz] of dirs){
    let a;
    if(ux !== 0){ if(dx % ux !== 0) continue; a = dx/ux; if(dz !== a*uz) continue; }
    else { if(dz % uz !== 0) continue; a = dz/uz; if(dx !== a*ux) continue; }
    if(a >= 1 && a <= R) return true;
  }
  for(const [ux,uz] of dirs){
    const px = -uz, pz = ux;
    for(let a=2; a<=R; a++){
      const bx = a*ux, bz = a*uz;
      if((dx === bx+px && dz === bz+pz) || (dx === bx-px && dz === bz-pz)) return true;
    }
  }
  return false;
}
function applySnowflakeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!snowflakeInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]); if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseSnowflakeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      if(!snowflakeInside(dx, dz, R)) continue;
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
function voxCount(R,H){ let n=0; for(let dy=0;dy<H;dy++)for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++) if(snowflakeInside(dx,dz,R)) n++; return n; }
function colCount(R,H){ const s=new Set(); for(let dy=0;dy<H;dy++)for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++) if(snowflakeInside(dx,dz,R)) s.add(dx+','+dz); return s.size; }

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('snowflake R=1,H=1 = 中心+6 臂共 7 格', (()=>{ const e=new Map(); applySnowflakeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,1,FALL,key,wkey,PALETTE); return e.size===7; })());
ok('snowflake R=3,H=2 体素数=voxCount', (()=>{ const e=new Map(); applySnowflakeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,2,FALL,key,wkey,PALETTE); return e.size===voxCount(3,2); })());
ok('snowflake R=2,H=3 体素数=voxCount', (()=>{ const e=new Map(); applySnowflakeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,3,FALL,key,wkey,PALETTE); return e.size===voxCount(2,3); })());
ok('snowflake 半径越大覆盖越多', voxCount(1,3) < voxCount(2,3) && voxCount(2,3) < voxCount(3,3));
ok('snowflake 高度越大覆盖越多', voxCount(2,2) < voxCount(2,3));
ok('snowflake 含中心(0,0)', (()=>{ const e=new Map(); applySnowflakeBrush(e,new Map(),new Map(),new Set(),5,5,5,'stone',3,1,FALL,key,wkey,PALETTE); return e.has(key(5,5,5)); })());
ok('snowflake 含主臂(3,0)@R=3', (()=>{ const e=new Map(); applySnowflakeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.has(key(3,0,0)); })());
ok('snowflake 不含臂外(2,2)@R=3', (()=>{ const e=new Map(); applySnowflakeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return !e.has(key(2,2,0)); })());
ok('snowflake 颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applySnowflakeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());
ok('snowflake water 写 waterCol(列数=去重列)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applySnowflakeBrush(new Map(),w,l,f,0,0,0,'water',3,3,FALL,key,wkey,PALETTE); return w.size===colCount(3,3); })());
ok('snowflake lava 写 lavaCol(且 water 为空)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applySnowflakeBrush(new Map(),w,l,f,0,0,0,'lava',3,3,FALL,key,wkey,PALETTE); return l.size===colCount(3,3) && w.size===0; })());
ok('snowflake sand 进 falling', (()=>{ const f=new Set(); applySnowflakeBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',3,3,FALL,key,wkey,PALETTE); return f.size===voxCount(3,3); })());
ok('snowflake stone 不进 falling', (()=>{ const f=new Set(); applySnowflakeBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); return f.size===0; })());
ok('snowflake 擦除后值全 null', (()=>{ const e=new Map(); applySnowflakeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,3,FALL,key,wkey,PALETTE); eraseSnowflakeBrush(e,new Map(),new Map(),new Set(),0,0,0,3,3,key,wkey); for(const v of e.values()) if(v!==null) return false; return e.size===voxCount(3,3); })());
ok('snowflake 擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applySnowflakeBrush(e,w,l,f,0,0,0,'water',3,3,FALL,key,wkey,PALETTE); eraseSnowflakeBrush(e,w,l,f,0,0,0,3,3,key,wkey); return w.size===0 && l.size===0 && f.size===0; })());

// ---- 接线检查 ----
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 writeVoxel 共享原语", /function writeVoxel\(/.test(src));
ok("main.js 定义 clearVoxel 共享原语", /function clearVoxel\(/.test(src));
ok("main.js 定义 applySnowflakeBrush", /function applySnowflakeBrush\(/.test(src));
ok("main.js 定义 eraseSnowflakeBrush", /function eraseSnowflakeBrush\(/.test(src));
ok("main.js 定义 snowflakeInside", /function snowflakeInside\(/.test(src));
ok("main.js 接线 apply", /else if\(brushShape === 'snowflake'\) applySnowflakeBrush/.test(src));
ok("main.js 接线 erase", /else if\(brushShape === 'snowflake'\) eraseSnowflakeBrush/.test(src));
ok("flash 标签含 雪花", /笔刷形状：雪花/.test(src));
ok("index.html 含 snowflake 选项", /value="snowflake"/.test(html));

console.log('snowflake: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
