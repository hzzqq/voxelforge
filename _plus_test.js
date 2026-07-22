// 忠实移植 voxel-world/main.js 的 applyPlusBrush / erasePlusBrush 纯函数并验证几何。
// 3D 加号(plus)：以命中 (nx,ny,nz) 为中心，沿 X/Y/Z 三条正交轴各延伸 radius 一格厚，构成立体十字；格数 = 6r+1。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function applyPlusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALLv, key, wkey, PALETTEv){
  const r = Math.max(1, radius|0);
  const cells = [];
  for(let d=-r; d<=r; d++){ cells.push([nx+d, ny, nz]); cells.push([nx, ny+d, nz]); cells.push([nx, ny, nz+d]); }
  for(const [x,y,z] of cells){
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTEv[brush]);
    if(FALLv.has(brush)) falling.add(k);
  }
}
function erasePlusBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const cells = [];
  for(let d=-r; d<=r; d++){ cells.push([nx+d, ny, nz]); cells.push([nx, ny+d, nz]); cells.push([nx, ny, nz+d]); }
  for(const [x,y,z] of cells){
    const kk = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(kk, null);
    falling.delete(kk);
  }
}

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

// 几何：格数 = 6r+1
ok('r=1 加号 7 格', (()=>{ const e=new Map(); applyPlusBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.size===7; })());
ok('r=2 加号 13 格', (()=>{ const e=new Map(); applyPlusBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE); return e.size===13; })());
ok('r=3 加号 19 格', (()=>{ const e=new Map(); applyPlusBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return e.size===19; })());
// 每个格都落在某条过中心的正交轴上(至少两个坐标等于中心)
ok('全在过中心的正交轴上', (()=>{ const e=new Map(); applyPlusBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE);
  for(const k of e.keys()){ const [x,y,z]=k.split(',').map(Number); const onAxis = (x===0&&y===0)||(x===0&&z===0)||(y===0&&z===0); if(!onAxis) return false; } return true; })());
ok('含中心与六向端点(r=1)', (()=>{ const e=new Map(); applyPlusBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE);
  return e.has('0,0,0')&&e.has('1,0,0')&&e.has('-1,0,0')&&e.has('0,1,0')&&e.has('0,-1,0')&&e.has('0,0,1')&&e.has('0,0,-1'); })());
ok('不含对角(1,1,0)', (()=>{ const e=new Map(); applyPlusBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return !e.has('1,1,0'); })());
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyPlusBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.get('0,0,0')==='#7a7a7a'; })());

// 流体（waterCol/lavaCol 按 (x,z) 列去重，3D 加号的竖向臂与中心同列 → 5 列）
ok('water 写 waterCol 5 列(r=1)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyPlusBrush(new Map(),w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); return w.size===5 && w.has('0,0'); })());
ok('lava 写 lavaCol 5 列', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyPlusBrush(new Map(),w,l,f,0,0,0,'lava',1,FALL,key,wkey,PALETTE); return l.size===5 && w.size===0; })());
ok('sand 进 falling 7 条(r=1)', (()=>{ const f=new Set(); applyPlusBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',1,FALL,key,wkey,PALETTE); return f.size===7; })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyPlusBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',1,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyPlusBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  erasePlusBrush(e,new Map(),new Map(),new Set(),0,0,0,2,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===13; })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyPlusBrush(e,w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); erasePlusBrush(e,w,l,f,0,0,0,1,key,wkey); return w.size===0; })());

console.log(`plus: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
