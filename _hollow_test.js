// ci130 VoxelForge 掏空外壳 hollowBox —— 纯函数忠实移植 + 行为断言 + 源码接线
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL:', n); } };

const key = (x,y,z) => `${x},${y},${z}`;
const PALETTE = { grass:'#2e8b2e', dirt:'#7a5230' };

// 忠实移植 main.js 的 hollowBox 纯函数
function hollowBox(edits, x0,y0,z0,x1,y1,z1){
  const out = new Map(edits);
  const a = [Math.min(x0,x1), Math.min(y0,y1), Math.min(z0,z1)];
  const b = [Math.max(x0,x1), Math.max(y0,y1), Math.max(z0,z1)];
  for(let x=a[0]; x<=b[0]; x++)
    for(let y=a[1]; y<=b[1]; y++)
      for(let z=a[2]; z<=b[2]; z++){
        const onBoundary = x===a[0]||x===b[0]||y===a[1]||y===b[1]||z===a[2]||z===b[2];
        if(!onBoundary) out.set(key(x,y,z), null);
      }
  return out;
}

// 1. 实心 3x3x3 掏空后只剩外壳：27 - 内部1(1,1,1) = 26 块实心保留
{
  let edits = new Map();
  for(let x=0;x<=2;x++) for(let y=0;y<=2;y++) for(let z=0;z<=2;z++) edits.set(key(x,y,z), PALETTE.grass);
  const out = hollowBox(edits, 0,0,0, 2,2,2);
  let solid = 0; for(const v of out.values()) if(v === PALETTE.grass) solid++;
  ok('3x3x3 掏空保留 26 块外壳', solid === 26);
  ok('中心 (1,1,1) 被掏空为 null', out.get(key(1,1,1)) === null);
  ok('角点 (0,0,0) 是外壳(保留)', out.get(key(0,0,0)) === PALETTE.grass);
  ok('面心 (1,0,1) 是外壳(保留)', out.get(key(1,0,1)) === PALETTE.grass);
}

// 2. 更大的 3x3x3x3 (x:0..2,y:0..2,z:0..2,w:0..2 → 4^3=64)：内部 2x2x2=8 被掏空，保留 56
{
  let edits = new Map();
  for(let x=0;x<=3;x++) for(let y=0;y<=3;y++) for(let z=0;z<=3;z++) edits.set(key(x,y,z), PALETTE.dirt);
  const out = hollowBox(edits, 0,0,0, 3,3,3);
  let solid = 0; for(const v of out.values()) if(v === PALETTE.dirt) solid++;
  ok('4x4x4 掏空保留 56 块(64-8内部)', solid === 56);
  ok('内部 (1,1,1) 掏空', out.get(key(1,1,1)) === null);
  ok('内部 (2,2,2) 掏空', out.get(key(2,2,2)) === null);
  ok('边内部 (1,2,2) 掏空', out.get(key(1,2,2)) === null);
  ok('外壳 (0,2,2) 保留', out.get(key(0,2,2)) === PALETTE.dirt);
}

// 3. 反序对角参数等处理（等价）
{
  let edits = new Map();
  for(let x=0;x<=2;x++) for(let y=0;y<=2;y++) for(let z=0;z<=2;z++) edits.set(key(x,y,z), PALETTE.grass);
  const out = hollowBox(edits, 2,2,2, 0,0,0);
  ok('反序对角掏空中心', out.get(key(1,1,1)) === null && out.get(key(0,0,0)) === PALETTE.grass);
}

// 4. 单层(某维相同) 没有内部 → 全部保留
{
  let edits = new Map();
  for(let x=0;x<=3;x++) for(let z=0;z<=3;z++) edits.set(key(x,5,z), PALETTE.grass);
  const out = hollowBox(edits, 0,5,0, 3,5,3);
  let solid = 0; for(const v of out.values()) if(v === PALETTE.grass) solid++;
  ok('单层(4x1x4=16) 无内部，全部保留', solid === 16);
}

// 5. 不修改入参（纯函数）
{
  let edits = new Map();
  for(let x=0;x<=2;x++) for(let y=0;y<=2;y++) for(let z=0;z<=2;z++) edits.set(key(x,y,z), PALETTE.grass);
  const snap = JSON.stringify([...edits.entries()]);
  hollowBox(edits, 0,0,0, 2,2,2);
  ok('原 edits 未被修改', JSON.stringify([...edits.entries()]) === snap);
}

// 6. 盒外原块保留、盒内非外壳块被掏空
{
  let edits = new Map([
    [key(0,0,0), PALETTE.grass], [key(1,1,1), PALETTE.grass], [key(9,9,9), PALETTE.dirt]
  ]);
  const out = hollowBox(edits, 0,0,0, 2,2,2);
  ok('盒外块 (9,9,9) 保留', out.get(key(9,9,9)) === PALETTE.dirt);
  ok('盒内内部 (1,1,1) 掏空', out.get(key(1,1,1)) === null);
  ok('盒内外壳 (0,0,0) 保留', out.get(key(0,0,0)) === PALETTE.grass);
}

// 7. 盒子内原本就是 null 的内部，掏空后仍为 null（不凭空造块）
{
  const out = hollowBox(new Map(), 0,0,0, 2,2,2);
  let nulls = 0; for(const v of out.values()) if(v === null) nulls++;
  ok('空盒掏空仅产生 1 个 null(中心)', nulls === 1 && out.get(key(1,1,1)) === null);
}

// 源码接线
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok('main 定义 hollowBox', /function hollowBox\(/.test(main));
ok('main 定义 hollowBoxAt（交互）', /function hollowBoxAt\(/.test(main));
ok('pointerdown 分发 hollow', /else if\(mode === 'hollow'\) hollowBoxAt/.test(main));
ok('hollowBtn 绑定', /\$\('hollowBtn'\)\.onclick/.test(main));
ok('index.html 含掏空外壳按钮', /id="hollowBtn"/.test(html));

console.log(`\nci130 hollowBox: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
