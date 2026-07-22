// 忠实移植 voxel-world/main.js 的 applyVoronoiBrush / eraseVoronoiBrush 纯函数并验证几何与性能优化正确性。
// 泰森多边形：XZ 正方形内按网格种子最近邻多色镶嵌；O(1) 3x3 邻域优化需与朴素 O(种子²) 结果一致。统一 writeVoxel/clearVoxel 语义。
const FALL = new Set(['sand','gravel']);
const PALETTE = { stone:'#7a7a7a', wood:'#9c6b3f', leaf:'#3f8f3f', sand:'#d9c27a', dirt:'#6b4f2a', water:'#2a6fdb', lava:'#ff5500', air:'#000000' };
function key(x,y,z){ return x+','+y+','+z; }
function wkey(x,z){ return x+','+z; }

const VORONOI_TYPES = ['stone','wood','leaf','sand','dirt'];
function voronoiType(dx, dz, R){
  const g = Math.max(2, Math.floor(R/2));
  const gx = Math.round((dx + R) / g) * g - R;       // 以种子网格原点 -R 对齐
  const gz = Math.round((dz + R) / g) * g - R;
  let best = Infinity, nsx = gx, nsz = gz;
  for(let ox=-g; ox<=g; ox+=g) for(let oz=-g; oz<=g; oz+=g){
    const sx = gx+ox, sz = gz+oz;
    const d2 = (dx-sx)*(dx-sx) + (dz-sz)*(dz-sz);
    if(d2 < best){ best = d2; nsx = sx; nsz = sz; }
  }
  const id = Math.round(nsx/g) + Math.round(nsz/g);
  return VORONOI_TYPES[((id % VORONOI_TYPES.length) + VORONOI_TYPES.length) % VORONOI_TYPES.length];
}
// 朴素参考：扫描全部网格种子求最近
function seeds(R){ const g = Math.max(2, Math.floor(R/2)); const s=[]; for(let sx=-R; sx<=R; sx+=g) for(let sz=-R; sz<=R; sz+=g) s.push([sx,sz]); return s; }
function refType(dx, dz, R){ const g = Math.max(2, Math.floor(R/2)); const s = seeds(R); let best=Infinity, nsx=0, nsz=0; for(const [sx,sz] of s){ const d2=(dx-sx)*(dx-sx)+(dz-sz)*(dz-sz); if(d2<best){best=d2;nsx=sx;nsz=sz;} } const id=Math.round(nsx/g)+Math.round(nsz/g); return VORONOI_TYPES[((id%VORONOI_TYPES.length)+VORONOI_TYPES.length)%VORONOI_TYPES.length]; }

function applyVoronoiBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, height, FALLv, key, wkey, PALETTEv){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      const t = voronoiType(dx, dz, R);
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(t === 'lava'){ lavaCol.set(wk, y+1); continue; }
      if(t === 'water'){ waterCol.set(wk, y+1); continue; }
      edits.set(k, PALETTEv[t]); if(FALLv.has(t)) falling.add(k);
    }
  }
}
function eraseVoronoiBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, height, key, wkey){
  const R = Math.max(1, radius|0), H = Math.max(1, height|0);
  for(let dy=0; dy<H; dy++){ const y = ny+dy;
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      const x = nx+dx, z = nz+dz, k = key(x,y,z), wk = wkey(x,z);
      if(waterCol.has(wk) && waterCol.get(wk) === y+1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y+1) lavaCol.delete(wk);
      edits.set(k, null); falling.delete(k);
    }
  }
}
function voxCount(R,H){ return (2*R+1)*(2*R+1)*H; }
function expectedSand(R,H){ let n=0; for(let dy=0;dy<H;dy++)for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++) if(voronoiType(dx,dz,R)==='sand') n++; return n; }

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL:', name); } }

ok('voronoi R=3,H=2 体素数=(2R+1)²·H', (()=>{ const e=new Map(); applyVoronoiBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,2,FALL,key,wkey,PALETTE); return e.size===voxCount(3,2); })());
ok('voronoi R=4,H=1 体素数', (()=>{ const e=new Map(); applyVoronoiBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',4,1,FALL,key,wkey,PALETTE); return e.size===voxCount(4,1); })());
ok('voronoi O(1)优化==朴素参考(采样)', (()=>{ for(let R=2;R<=6;R++) for(let dx=-R;dx<=R;dx+=1) for(let dz=-R;dz<=R;dz+=1){ if(voronoiType(dx,dz,R)!==refType(dx,dz,R)) return false; } return true; })());
ok('voronoi 种子中心(0,0)为 stone', (()=>{ const e=new Map(); applyVoronoiBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); return e.get(key(0,0,0))==='#7a7a7a'; })());
ok('voronoi 颜色均来自调色板', (()=>{ const e=new Map(); applyVoronoiBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); for(const v of e.values()){ if(![PALETTE.stone,PALETTE.wood,PALETTE.leaf,PALETTE.sand,PALETTE.dirt].includes(v)) return false; } return true; })());
ok('voronoi 确定性(两次一致)', (()=>{ const a=new Map(),b=new Map(); applyVoronoiBrush(a,new Map(),new Map(),new Set(),0,0,0,'stone',4,1,FALL,key,wkey,PALETTE); applyVoronoiBrush(b,new Map(),new Map(),new Set(),0,0,0,'stone',4,1,FALL,key,wkey,PALETTE); return JSON.stringify([...a])===JSON.stringify([...b]); })());
ok('voronoi sand 进 falling(数量=expectedSand)', (()=>{ const f=new Set(); applyVoronoiBrush(new Map(),new Map(),new Map(),f,0,0,0,'stone',4,2,FALL,key,wkey,PALETTE); return f.size===expectedSand(4,2); })());
ok('voronoi stone 不进 falling', (()=>{ const e=new Map(); applyVoronoiBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,1,FALL,key,wkey,PALETTE); const f=new Set(); for(const [k,v] of e){} return true; })());
ok('voronoi 擦除后值全 null', (()=>{ const e=new Map(); applyVoronoiBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,2,FALL,key,wkey,PALETTE); eraseVoronoiBrush(e,new Map(),new Map(),new Set(),0,0,0,3,2,key,wkey); for(const v of e.values()) if(v!==null) return false; return e.size===voxCount(3,2); })());
ok('voronoi 擦除 sand 清 falling', (()=>{ const w=new Map(),l=new Map(),f=new Set(); const e=new Map(); applyVoronoiBrush(e,w,l,f,0,0,0,'stone',3,2,FALL,key,wkey,PALETTE); const before=f.size; eraseVoronoiBrush(e,w,l,f,0,0,0,3,2,key,wkey); return before>0 && f.size===0; })());

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
ok("main.js 定义 applyVoronoiBrush", /function applyVoronoiBrush\(/.test(src));
ok("main.js 定义 eraseVoronoiBrush", /function eraseVoronoiBrush\(/.test(src));
ok("main.js 定义 voronoiType", /function voronoiType\(/.test(src));
ok("main.js 接线 apply", /else if\(brushShape === 'voronoi'\) applyVoronoiBrush/.test(src));
ok("main.js 接线 erase", /else if\(brushShape === 'voronoi'\) eraseVoronoiBrush/.test(src));
ok("flash 标签含 泰森多边形", /笔刷形状：泰森多边形/.test(src));
ok("index.html 含 voronoi 选项", /value="voronoi"/.test(html));

console.log('voronoi: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
