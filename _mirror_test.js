// VoxelForge 镜像笔刷：纯函数移植 + 源接线校验。
// 验证 mirrorEdits 沿轴以 center 为镜面反射坐标，原块+镜像块齐全，镜面自身不重复，且不改入参。
const fs = require('fs');
const path = require('path');
const NODE = 'C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2/node.exe';
const { execSync } = require('child_process');

const dir = __dirname;
let fail = 0, pass = 0;
const ok = (n, c)=> c ? pass++ : (fail++, console.log('  FAIL', n));

// ---- 纯函数移植（对应 GLSL/JS 逻辑）----
function key(x,y,z){ return x+','+y+','+z; }
function mirrorEdits(edits, axis, center){
  const next = new Map(edits);
  for(const [k, v] of edits){
    const [x,y,z] = k.split(',').map(Number);
    let mx=x, my=y, mz=z;
    if(axis==='x') mx=2*center-x;
    else if(axis==='y') my=2*center-y;
    else mz=2*center-z;
    const mk=key(mx,my,mz);
    if(mk===k) continue;
    next.set(mk, v);
  }
  return next;
}
function mk(mapLike){ const m = new Map(); for(const [k,v] of Object.entries(mapLike)) m.set(k,v); return m; }

// 1) 轴 X 反射
let r = mirrorEdits(mk({ '3,0,0':'#0f0' }), 'x', 0);
ok('X 反射：原块保留', r.get('3,0,0') === '#0f0');
ok('X 反射：镜像块生成(-3,0,0)', r.get('-3,0,0') === '#0f0');
ok('X 反射：仅 2 项', r.size === 2);

// 2) 轴 Y 反射（带非零镜面 center=2）
r = mirrorEdits(mk({ '0,5,0':'#00f' }), 'y', 2);
ok('Y 反射 center=2：镜像块(0,-1,0)', r.get('0,-1,0') === '#00f');

// 3) 轴 Z 反射
r = mirrorEdits(mk({ '0,0,7':'#f00' }), 'z', 3);
ok('Z 反射 center=3：镜像块(0,0,-1)', r.get('0,0,-1') === '#f00');

// 4) 镜面上的点(恰在 center)不重复
r = mirrorEdits(mk({ '2,0,0':'#abc' }), 'x', 2);
ok('镜面点不重复：size 仍为 1', r.size === 1 && r.get('2,0,0') === '#abc');

// 5) 多块全部反射
r = mirrorEdits(mk({ '1,1,1':'#111', '4,2,0':'#222' }), 'x', 0);
ok('多块：各生成镜像', r.get('-1,1,1')==='#111' && r.get('-4,2,0')==='#222' && r.size===4);

// 6) 空值(null 挖空)也镜像
r = mirrorEdits(mk({ '1,0,0':null }), 'x', 0);
ok('null 也镜像：(-1,0,0) 为 null', r.get('-1,0,0') === null && r.size===2);

// 7) 不修改入参
const inp = mk({ '3,0,0':'#0f0' });
const before = JSON.stringify([...inp.entries()]);
mirrorEdits(inp, 'x', 0);
ok('不改入参', JSON.stringify([...inp.entries()]) === before && inp.size === 1);

// 8) 非法轴退化为 Z
r = mirrorEdits(mk({ '0,0,5':'#fff' }), '??', 1);
ok('非法轴 → Z 反射(0,0,-3)', r.get('0,0,-3') === '#fff');

// ---- 源接线校验 ----
const main = fs.readFileSync(path.join(dir, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
ok('main.js 定义 mirrorEdits', /function mirrorEdits\(/.test(main));
ok('editAt 调用 mirrorEdits', /edits = mirrorEdits\(edits, mirrorAxis, mirrorCenter, key\)/.test(main));
ok('editAt 镜像时 rebuildAll', /if\(mirrorOn\)\{[\s\S]*?rebuildAll\(\);/.test(main));
ok('声明 mirrorOn/axis/center 状态', /let mirrorOn = false, mirrorAxis = 'x', mirrorCenter = 0;/.test(main));
ok('index.html 镜像开关', /id="mirrorOn"/.test(html));
ok('index.html 镜像轴选择', /id="mirrorAxis"/.test(html));
ok('index.html 镜面坐标输入', /id="mirrorCenter"/.test(html));
ok('JS 绑定 mirrorOn 开关', /\$\('mirrorOn'\)\.onchange/.test(main));
ok('JS 绑定 mirrorAxis', /\$\('mirrorAxis'\)\.onchange/.test(main));
ok('JS 绑定 mirrorCenter', /\$\('mirrorCenter'\)\.oninput/.test(main));

// ---- ESM 语法检查 ----
try { execSync(`"${NODE}" --check --input-type=module < "${path.join(dir,'main.js')}"`, { stdio:'pipe' }); ok('main.js ESM 语法 OK', true); }
catch(e){ ok('main.js ESM 语法 OK', false); console.log(e.stdout?.toString(), e.stderr?.toString()); }

console.log(`\n[Voxel mirror] pass=${pass} fail=${fail}`);
process.exit(fail?1:0);
