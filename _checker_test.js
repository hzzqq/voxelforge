// 忠实移植 voxel-world/main.js 的 applyCheckerBrush / eraseCheckerBrush 纯函数并验证几何。
// 棋盘：XZ 半径 r 方块内按 (dx+dz) 偶校验填充，沿 y 填 r 格；格数 = r × ((2r+1)²+1)/2。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function applyCheckerBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALLv, key, wkey, PALETTEv){
  const r = Math.max(1, radius|0);
  for(let dy=0; dy<r; dy++){
    const y = ny+dy;
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(((dx + dz) & 1) !== 0) continue;
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseCheckerBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  for(let dy=0; dy<r; dy++){
    const y = ny+dy;
    for(let dx=-r; dx<=r; dx++) for(let dz=-r; dz<=r; dz++){
      if(((dx + dz) & 1) !== 0) continue;
      const x = nx+dx, z = nz+dz;
      const kk = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}

// 棋格数公式：r × ((2r+1)²+1)/2
const count = r => r * (((2*r+1)*(2*r+1)) + 1) / 2;

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('r=1 棋盘 5 格', (()=>{ const e=new Map(); applyCheckerBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.size===count(1); })());
ok('r=2 棋盘 26 格', (()=>{ const e=new Map(); applyCheckerBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE); return e.size===count(2); })());
ok('r=3 棋盘 75 格', (()=>{ const e=new Map(); applyCheckerBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return e.size===count(3); })());
ok('全部为偶校验格(dx+dz 为偶)', (()=>{ const e=new Map(); applyCheckerBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE);
  for(const k of e.keys()){ const [x,y,z]=k.split(',').map(Number); if(((x+z) & 1) !== 0) return false; } return true; })());
ok('奇校验格被排除(1,0,0)', (()=>{ const e=new Map(); applyCheckerBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return !e.has('1,0,0'); })());
ok('偶校验格被包含(1,0,1)', (()=>{ const e=new Map(); applyCheckerBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return e.has('1,0,1'); })());
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyCheckerBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.get('0,0,0')==='#7a7a7a'; })());

// 流体
ok('water 写 waterCol 5 列(r=1)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyCheckerBrush(new Map(),w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); return w.size===5; })());
ok('lava 写 lavaCol 5 列', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyCheckerBrush(new Map(),w,l,f,0,0,0,'lava',1,FALL,key,wkey,PALETTE); return l.size===5 && w.size===0; })());
ok('sand 进 falling 5 条(r=1)', (()=>{ const f=new Set(); applyCheckerBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',1,FALL,key,wkey,PALETTE); return f.size===5; })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyCheckerBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',1,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyCheckerBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  eraseCheckerBrush(e,new Map(),new Map(),new Set(),0,0,0,2,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===count(2); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyCheckerBrush(e,w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); eraseCheckerBrush(e,w,l,f,0,0,0,1,key,wkey); return w.size===0; })());

console.log(`checker: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
