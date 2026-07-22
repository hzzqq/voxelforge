// 忠实移植 voxel-world/main.js 的 applyLatticeBrush / eraseLatticeBrush 纯函数并验证几何。
// 晶格：以命中点为心，XYZ 三轴各以步长 2 取 [-r,r] 内偶数偏移，形成 3D 立方体网格；
// 格数 = (1+2⌊r/2⌋)³。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', dirt:'#6b4f2a', wood:'#9c6b3f', water:'#2a6fdb', lava:'#ff5500', sand:'#d9c27a', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

function applyLatticeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALLv, key, wkey, PALETTEv){
  const r = Math.max(1, radius|0);
  const f = Math.floor(r/2);
  for(let dy=-2*f; dy<=2*f; dy+=2){
    const y = ny+dy;
    for(let dx=-2*f; dx<=2*f; dx+=2) for(let dz=-2*f; dz<=2*f; dz+=2){
      const x = nx+dx, z = nz+dz;
      const k = key(x,y,z), wk = wkey(x,z);
      if(brush === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseLatticeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const f = Math.floor(r/2);
  for(let dy=-2*f; dy<=2*f; dy+=2){
    const y = ny+dy;
    for(let dx=-2*f; dx<=2*f; dx+=2) for(let dz=-2*f; dz<=2*f; dz+=2){
      const x = nx+dx, z = nz+dz;
      const kk = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}

// 晶格数公式：(1+2⌊r/2⌋)³
const count = r => Math.pow(1 + 2*Math.floor(r/2), 3);

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('r=1 晶格 1 格', (()=>{ const e=new Map(); applyLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.size===count(1); })());
ok('r=2 晶格 27 格', (()=>{ const e=new Map(); applyLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE); return e.size===count(2); })());
ok('r=3 晶格 27 格', (()=>{ const e=new Map(); applyLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return e.size===count(3); })());
ok('r=4 晶格 125 格', (()=>{ const e=new Map(); applyLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',4,FALL,key,wkey,PALETTE); return e.size===count(4); })());
ok('中心格(0,0,0)恒被包含', (()=>{ for(const r of [1,2,3,4]){ const e=new Map(); applyLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',r,FALL,key,wkey,PALETTE); if(!e.has('0,0,0')) return false; } return true; })());
ok('全部为偶偏移格(dx/dz/dy 均偶)', (()=>{ const e=new Map(); applyLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE);
  for(const k of e.keys()){ const [x,y,z]=k.split(',').map(Number); if((x&1)!==0||(y&1)!==0||(z&1)!==0) return false; } return true; })());
ok('奇数偏移格被排除(1,0,0)', (()=>{ const e=new Map(); applyLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return !e.has('1,0,0'); })());
ok('偶数偏移格被包含(2,0,2)', (()=>{ const e=new Map(); applyLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE); return e.has('2,0,2'); })());
ok('颜色写入 PALETTE[stone]', (()=>{ const e=new Map(); applyLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE); return e.get('0,0,0')==='#7a7a7a'; })());

// 流体（waterCol/lavaCol 按 (x,z) 列去重，故列数 = (1+2⌊r/2⌋)²）
ok('water 写 waterCol 1 列(r=1)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyLatticeBrush(new Map(),w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); return w.size===1; })());
ok('lava 写 lavaCol 9 列(r=2)', (()=>{ const w=new Map(),l=new Map(),f=new Set(); applyLatticeBrush(new Map(),w,l,f,0,0,0,'lava',2,FALL,key,wkey,PALETTE); return l.size===9 && w.size===0; })());
ok('sand 进 falling 27 条(r=2)', (()=>{ const f=new Set(); applyLatticeBrush(new Map(),new Map(),new Map(),f,0,0,0,'sand',2,FALL,key,wkey,PALETTE); return f.size===27; })());
ok('stone 不进 falling', (()=>{ const f=new Set(); applyLatticeBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',2,FALL,key,wkey,PALETTE); return f.size===0; })());

// 擦除
ok('擦除后值全 null', (()=>{ const e=new Map(); applyLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  eraseLatticeBrush(e,new Map(),new Map(),new Set(),0,0,0,2,key,wkey);
  for(const v of e.values()) if(v!==null) return false; return e.size===count(2); })());
ok('擦除 water 清 waterCol', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyLatticeBrush(e,w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE); eraseLatticeBrush(e,w,l,f,0,0,0,1,key,wkey); return w.size===0; })());

console.log(`lattice: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
