// 验证 voxel-world/main.js 的 worldBounds 纯函数(世界包围盒查询)与接线。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL:', n); } };
const key = (x,y,z) => `${x},${y},${z}`;

// 忠实移植 worldBounds
function worldBounds(edits){
  if(edits.size === 0) return null;
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(const [k,v] of edits){
    if(v == null) continue;
    const [x,y,z] = k.split(',').map(Number);
    if(x<minX) minX=x; if(y<minY) minY=y; if(z<minZ) minZ=z;
    if(x>maxX) maxX=x; if(y>maxY) maxY=y; if(z>maxZ) maxZ=z;
  }
  if(minX===Infinity) return null;
  return { min:{x:minX,y:minY,z:minZ}, max:{x:maxX,y:maxY,z:maxZ}, size:{x:maxX-minX+1,y:maxY-minY+1,z:maxZ-minZ+1} };
}

ok('空世界返回 null', worldBounds(new Map()) === null);
ok('仅挖空(null)世界返回 null', worldBounds(new Map([[key(0,0,0), null]])) === null);
{
  const e = new Map([[key(0,0,0), 1]]);
  const b = worldBounds(e);
  ok('单 voxel 尺寸 1×1×1', b.size.x===1 && b.size.y===1 && b.size.z===1);
  ok('单 voxel min==max', b.min.x===0 && b.max.x===0 && b.min.y===0 && b.max.y===0 && b.min.z===0 && b.max.z===0);
}
{
  const e = new Map();
  e.set(key(2,5,3), 1); e.set(key(-1,0,7), 1); e.set(key(4,2,-2), 1); e.set(key(0,0,0), null); // 挖空不参与
  const b = worldBounds(e);
  ok('min 正确', b.min.x===-1 && b.min.y===0 && b.min.z===-2);
  ok('max 正确', b.max.x===4 && b.max.y===5 && b.max.z===7);
  ok('size = max-min+1', b.size.x===6 && b.size.y===6 && b.size.z===10);
  ok('挖空(null)被排除', !Object.values(b.min).includes(0) || b.max.x>=4);
}
{
  const e = new Map(); for(let i=0;i<10;i++) e.set(key(i,0,0),1);
  const b = worldBounds(e);
  ok('沿 X 连续 10 格 → size.x=10', b.size.x===10 && b.min.x===0 && b.max.x===9);
}

const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok('main.js 定义 worldBounds', /function worldBounds\(/.test(main));
ok('main.js 按钮调用 worldBounds', /\$\('boundsBtn'\)\.onclick/.test(main) && /worldBounds\(edits\)/.test(main));
ok('index.html 含 查询包围盒 按钮', /id="boundsBtn"/.test(html));

console.log(`\nworldBounds: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
