// 忠实移植 voxel-world/main.js 的 applyFrameBrush / eraseFrameBrush 纯函数并验证几何。
// 回字：XZ 半径 r 的方形外框(仅 |dx|==r 或 |dz|==r)，只填充 y=ny 一层；边框格数 = 8r。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function applyFrameBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALLv, key, wkey, PALETTEv){
  const r = Math.max(1, radius|0);
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    if(Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
    const x = nx+dx, z = nz+dz, y = ny;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTEv[brush]);
    if(FALLv.has(brush)) falling.add(k);
  }
}
function eraseFrameBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    if(Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
    const x = nx+dx, z = nz+dz, y = ny;
    const kk = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(kk, null);
    falling.delete(kk);
  }
}

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

// 几何：边框格数 = 8r
ok('r=1 边框 8 格', (()=>{ const e=new Map(); applyFrameBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.size===8; })());
ok('r=2 边框 16 格', (()=>{ const e=new Map(); applyFrameBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE); return e.size===16; })());
ok('r=3 边框 24 格', (()=>{ const e=new Map(); applyFrameBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return e.size===24; })());
ok('全是边框(|dx|==r 或 |dz|==r)', (()=>{ const e=new Map(); applyFrameBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE);
  for(const k of e.keys()){ const [x,y,z]=k.split(',').map(Number); if(Math.abs(x)!==3 && Math.abs(z)!==3) return false; } return true; })());
ok('不含内部格(0,0)', (()=>{ const e=new Map(); applyFrameBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return !e.has('0,0,0'); })());
ok('只填 y=ny 一层(r=2 所有 y==0)', (()=>{ const e=new Map(); applyFrameBrush(e,new Map(),new Map(),new Set(),0,5,0,'stone',2,FALL,key,wkey,PALETTE);
  for(const k of e.keys()){ if(Number(k.split(',')[1])!==5) return false; } return e.size===16; })());
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyFrameBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.get('1,0,0')==='#7a7a7a'; })());

// 流体：water 写入 waterCol(wkey→y+1)
ok('water 写 waterCol 8 条(r=1)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyFrameBrush(new Map(),w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE);
  return w.size===8 && w.get('1,0')===1; })());
ok('lava 写 lavaCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyFrameBrush(new Map(),w,l,f,0,0,0,'lava',1,FALL,key,wkey,PALETTE);
  return l.size===8 && l.get('-1,0')===1 && w.size===0; })());

// 掉落：sand 进 falling
ok('sand 进 falling 8 条(r=1)', (()=>{ const f=new Set(); applyFrameBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',1,FALL,key,wkey,PALETTE); return f.size===8; })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyFrameBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',1,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除：apply 后 erase 全部置空
ok('擦除后值全 null', (()=>{ const e=new Map(); applyFrameBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  eraseFrameBrush(e,new Map(),new Map(),new Set(),0,0,0,2,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===16; })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyFrameBrush(new Map(),w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE);
  const e=new Map(); applyFrameBrush(e,w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); eraseFrameBrush(e,w,l,f,0,0,0,1,key,wkey); return w.size===0; })());

console.log(`frame: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
