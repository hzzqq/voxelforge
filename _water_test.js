// VoxelForge 水体流动校验（纯逻辑，不依赖 Three.js/WebGL）：从 main.js 抽取真实 stepWater 源码执行并断言。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const stepWater = new Function(src.match(/function stepWater\([\s\S]*?\n}/)[0] + '\nreturn stepWater;')();

let fail=0, pass=0; const ok=(n,c)=> c?pass++:(fail++,console.log('  FAIL',n));

// 工具：用 2D 地形数组构造 t(x,z)
const vol = (w,t)=>{ let v=0; for(const [k,s] of w){ const [x,z]=k.split(',').map(Number); v += s - t(x,z); } return v; };

// ---- 测试 1：封闭碗状盆地，体积守恒 + 表面趋于水平 ----
{
  const N=9, c=4;
  const T=(x,z)=> Math.max(0, Math.floor(((x-c)*(x-c)+(z-c)*(z-c))/3));
  const t=(x,z)=> T(x,z);
  let w = new Map(); w.set('4,4', 6);          // 中心注水（地形 0，水深 6）
  const V0 = vol(w,t);
  for(let i=0;i<400;i++) w = stepWater(w, t, 16);
  const V1 = vol(w,t);
  ok('盆地: 体积守恒(误差<5%)', Math.abs(V1-V0) <= Math.max(1, V0*0.05));
  // 所有被水覆盖的格水面应一致（±1 取整容差）
  const surf=[...w.values()]; const mn=Math.min(...surf), mx=Math.max(...surf);
  ok('盆地: 水面基本水平(极差<=1)', (mx-mn) <= 1);
  ok('盆地: 仍有水', w.size > 0);
}

// ---- 测试 2：顺坡下流（高→低），水扩散到更低处，且体积不增 ----
{
  const t=(x,z)=> (z===0 ? (6 - x) : 999);   // 一行斜坡：x=0 地形6 → x=6 地形0
  let w = new Map(); w.set('0,0', 8);          // (0,0) 水面8（地形6，水深2）
  const V0 = vol(w,t);
  let everWetBottom=false;
  for(let i=0;i<300;i++){ w = stepWater(w, t, 16); if(w.has('6,0')) everWetBottom=true; }
  const V1 = vol(w,t);
  ok('斜坡: 水顺坡流到最低列(6,0)', everWetBottom);
  ok('斜坡: 体积不增加(守恒/仅浮点泄漏)', V1 <= V0 + 1);
  ok('斜坡: 源头(0,0)水位下降或排空', !w.has('0,0') || w.get('0,0') < 8);
}

// ---- 测试 3：平地积水不凭空消失/暴涨，且趋于稳定 ----
{
  const t=(x,z)=> 0;                            // 全平地
  let w = new Map(); for(let x=0;x<5;x++) for(let z=0;z<5;z++) w.set(x+','+z, 3); // 25 格均匀水深3
  const V0 = vol(w,t);
  let prev=null, stable=false;
  for(let i=0;i<50;i++){ w = stepWater(w, t, 16); const V=vol(w,t); if(prev!==null && V===prev) stable=true; prev=V; }
  ok('平地: 体积守恒', vol(w,t) === V0);
  ok('平地: 收敛稳定', stable);
}

console.log(`\n[VoxelForge water] pass=${pass} fail=${fail}`);
process.exit(fail?1:0);
