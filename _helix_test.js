// 忠实移植 voxel-world/main.js 的 applyHelixBrush / eraseHelixBrush 纯函数并验证几何。
// 螺旋：沿 (2r+1) 步螺旋上升，角度按 turns 圈递增、XZ 半径 r、y 从 ny-r 升至 ny+r；
// 因 y 随 i 严格递增，每步 (x,y,z) 均不同，总格数 = 2r+1。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function applyHelixBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALLv, key, wkey, PALETTEv){
  const r = Math.max(1, radius|0);
  const N = 2*r + 1;
  const turns = Math.max(1, Math.round(r/2));
  const height = 2*r + 1;
  for(let i=0; i<N; i++){
    const ang = (i / N) * turns * 2 * Math.PI;
    const x = nx + Math.round(r * Math.cos(ang));
    const z = nz + Math.round(r * Math.sin(ang));
    const y = ny + Math.floor((i / N) * height) - r;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
    if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
    edits.set(k, PALETTEv[brush]);
    if(FALLv.has(brush)) falling.add(k);
  }
}
function eraseHelixBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const N = 2*r + 1;
  const turns = Math.max(1, Math.round(r/2));
  const height = 2*r + 1;
  for(let i=0; i<N; i++){
    const ang = (i / N) * turns * 2 * Math.PI;
    const x = nx + Math.round(r * Math.cos(ang));
    const z = nz + Math.round(r * Math.sin(ang));
    const y = ny + Math.floor((i / N) * height) - r;
    const kk = key(x,y,z), wk = wkey(x,z);
    if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
    if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
    edits.set(kk, null);
    falling.delete(kk);
  }
}

const count = r => 2*r + 1;

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('r=1 螺旋 3 格', (()=>{ const e=new Map(); applyHelixBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.size===count(1); })());
ok('r=2 螺旋 5 格', (()=>{ const e=new Map(); applyHelixBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE); return e.size===count(2); })());
ok('r=3 螺旋 7 格', (()=>{ const e=new Map(); applyHelixBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return e.size===count(3); })());
ok('y 随步严格递增(螺旋上升)', (()=>{ const e=new Map(); applyHelixBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE);
  const ys = [...e.keys()].map(k=>+k.split(',')[1]).sort((a,b)=>a-b);
  for(let i=1;i<ys.length;i++) if(ys[i] <= ys[i-1]) return false; return true; })());
ok('XZ 投影铺开(不止 1 个水平位置)', (()=>{ const e=new Map(); applyHelixBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE);
  const pos = new Set([...e.keys()].map(k=>{ const p=k.split(','); return p[0]+','+p[2]; }));
  return pos.size > 1; })());
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyHelixBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return [...e.values()].includes('#7a7a7a'); })());

// 流体 / 掉落
ok('water 写 waterCol(r=1)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyHelixBrush(new Map(),w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); return w.size===count(1); })());
ok('lava 写 lavaCol(r=2)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyHelixBrush(new Map(),w,l,f,0,0,0,'lava',2,FALL,key,wkey,PALETTE); return l.size===count(2) && w.size===0; })());
ok('sand 进 falling(r=2)', (()=>{ const f=new Set(); applyHelixBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',2,FALL,key,wkey,PALETTE); return f.size===count(2); })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyHelixBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',2,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyHelixBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  eraseHelixBrush(e,new Map(),new Map(),new Set(),0,0,0,2,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===count(2); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyHelixBrush(e,w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); eraseHelixBrush(e,w,l,f,0,0,0,1,key,wkey); return w.size===0; })());

console.log(`helix: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
