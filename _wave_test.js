// 忠实移植 voxel-world/main.js 的 applyWaveBrush / eraseWaveBrush 纯函数并验证几何。
// 波形：每根 (x,z) 列高度 y = ny + round(amp·sin((dx+dz)·0.6))，amp = max(1, round(r/2))；
// 每根列恰好 1 格，总格数 = (2r+1)²，且高度随 dx+dz 起伏(非全平)。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function applyWaveBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALLv, key, wkey, PALETTEv){
  const r = Math.max(1, radius|0);
  const amp = Math.max(1, Math.round(r/2));
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    const x = nx+dx, z = nz+dz;
    const y = ny + Math.round(amp * Math.sin((dx+dz) * 0.6));
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTEv[brush]);
    if(FALLv.has(brush)) falling.add(k);
  }
}
function eraseWaveBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const amp = Math.max(1, Math.round(r/2));
  for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
    const x = nx+dx, z = nz+dz;
    const y = ny + Math.round(amp * Math.sin((dx+dz) * 0.6));
    const kk = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(kk, null);
    falling.delete(kk);
  }
}

const count = r => (2*r+1)*(2*r+1);

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('r=1 波形 9 格', (()=>{ const e=new Map(); applyWaveBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.size===count(1); })());
ok('r=2 波形 25 格', (()=>{ const e=new Map(); applyWaveBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE); return e.size===count(2); })());
ok('r=3 波形 49 格', (()=>{ const e=new Map(); applyWaveBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return e.size===count(3); })());
ok('每根列仅 1 格(无可重复坐标)', (()=>{ const e=new Map(); applyWaveBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return e.size===count(3); })());
ok('高度随起伏变化(非全平)', (()=>{ const e=new Map(); applyWaveBrush(e,new Map(),new Map(),new Set(),0,5,0,'stone',3,FALL,key,wkey,PALETTE);
  const ys = new Set([...e.keys()].map(k=>k.split(',')[1]));
  return ys.size > 1; })());
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyWaveBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.get('0,0,0')==='#7a7a7a' || [...e.values()].includes('#7a7a7a'); })());

// 流体（每列 1 格，列数 = (2r+1)²）
ok('water 写 waterCol 9 列(r=1)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyWaveBrush(new Map(),w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); return w.size===9; })());
ok('lava 写 lavaCol 25 列(r=2)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyWaveBrush(new Map(),w,l,f,0,0,0,'lava',2,FALL,key,wkey,PALETTE); return l.size===25 && w.size===0; })());
ok('sand 进 falling 25 条(r=2)', (()=>{ const f=new Set(); applyWaveBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',2,FALL,key,wkey,PALETTE); return f.size===25; })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyWaveBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',2,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyWaveBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  eraseWaveBrush(e,new Map(),new Map(),new Set(),0,0,0,2,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===count(2); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyWaveBrush(e,w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); eraseWaveBrush(e,w,l,f,0,0,0,1,key,wkey); return w.size===0; })());

console.log(`wave: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
