// 忠实移植 voxel-world/main.js 的 applyCrossBrush / eraseCrossBrush 纯函数并验证几何。
// 十字：XZ 半径 r 的十字形(中心行 dx==0 与中心列 dz==0 各延伸 r，单格宽)，沿 y 填 r 格；格数 = 4r+1。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function applyCrossBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALLv, key, wkey, PALETTEv){
  const r = Math.max(1, radius|0);
  for(let dy=0; dy<r; dy++){
    const y = ny+dy;
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(dx !== 0 && dz !== 0) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseCrossBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let dy=0; dy<r; dy++){
    const y = ny+dy;
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(dx !== 0 && dz !== 0) continue;
      const x = nx+dx, z = nz+dz;
      const kk = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

// 几何：格数 = 4r+1
ok('r=1 十字 5 格', (()=>{ const e=new Map(); applyCrossBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.size===5; })());
ok('r=2 十字 18 格(9格/层 × 2层)', (()=>{ const e=new Map(); applyCrossBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE); return e.size===18; })());
ok('r=3 十字 39 格(13格/层 × 3层)', (()=>{ const e=new Map(); applyCrossBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return e.size===39; })());
ok('全在中心行/列(dx==0 或 dz==0)', (()=>{ const e=new Map(); applyCrossBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE);
  for(const k of e.keys()){ const [x,y,z]=k.split(',').map(Number); if(x!==0 && z!==0) return false; } return true; })());
ok('不含角落(1,0,1)', (()=>{ const e=new Map(); applyCrossBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return !e.has('1,0,1'); })());
ok('填充高度 r(r=2 时 y∈{5,6}，共 18 格)', (()=>{ const e=new Map(); applyCrossBrush(e,new Map(),new Map(),new Set(),0,5,0,'stone',2,FALL,key,wkey,PALETTE);
  for(const k of e.keys()){ const y=Number(k.split(',')[1]); if(y!==5 && y!==6) return false; } return e.size===18; })());
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyCrossBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.get('0,0,0')==='#7a7a7a'; })());

// 流体
ok('water 写 waterCol 5 条(r=1)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyCrossBrush(new Map(),w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); return w.size===5 && w.get('0,0')===1; })());
ok('lava 写 lavaCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyCrossBrush(new Map(),w,l,f,0,0,0,'lava',1,FALL,key,wkey,PALETTE); return l.size===5 && w.size===0; })());
ok('sand 进 falling 5 条(r=1)', (()=>{ const f=new Set(); applyCrossBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',1,FALL,key,wkey,PALETTE); return f.size===5; })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyCrossBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',1,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyCrossBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  eraseCrossBrush(e,new Map(),new Map(),new Set(),0,0,0,2,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===18; })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyCrossBrush(e,w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); eraseCrossBrush(e,w,l,f,0,0,0,1,key,wkey); return w.size===0; })());

console.log(`cross: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
