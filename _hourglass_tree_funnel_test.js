// ci346/ci350/ci354 测试：hourglass（沙漏）/ tree（树木）/ funnel（漏斗）3D 笔刷 —— 纯函数 + 接线校验
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// 从生产代码提取三个 inside 判定（单一真相源，避免移植漂移）
function extract(name){
  const m = main.match(new RegExp(`function ${name}\\(dx, dz, dy, R, H\\)\\{[\\s\\S]*?\\n\\}`));
  assert.ok(m, '可提取生产 ' + name);
  return eval('(' + m[0] + ')');
}
const hourglassInside = extract('hourglassInside');
const treeInside = extract('treeInside');
const funnelInside = extract('funnelInside');

// ---- hourglass：端面全宽、腰部最细、上下对称 ----
{
  const R = 4, H = 9, mid = 4;
  assert.ok(hourglassInside(R, 0, 0, R, H), '底面含 (R,0)');
  assert.ok(hourglassInside(R, 0, H-1, R, H), '顶面含 (R,0)');
  assert.ok(hourglassInside(0, 0, mid, R, H), '腰部含中心');
  assert.ok(!hourglassInside(2, 0, mid, R, H), '腰部不含 (2,0)（收腰）');
  for(let dy=0; dy<H; dy++){
    for(let dx=-R; dx<=R; dx++) for(let dz=-R; dz<=R; dz++){
      assert.strictEqual(hourglassInside(dx,dz,dy,R,H), hourglassInside(dx,dz,H-1-dy,R,H), `上下对称 (${dx},${dz},${dy})`);
    }
  }
  // 截面积: 端面 > 腰部
  const area = (dy)=>{ let n=0; for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++) if(hourglassInside(dx,dz,dy,R,H)) n++; return n; };
  assert.ok(area(0) > area(mid), '端面截面 > 腰部截面');
}

// ---- tree：下部树干细柱、上部球冠、冠宽 > 干宽 ----
{
  const R = 4, H = 12, trunkH = Math.round(H * 0.6);
  assert.ok(treeInside(0, 0, 0, R, H), '树干底含中心');
  assert.ok(treeInside(1, 0, 1, R, H), '树干含 (1,0)（半径1圆柱）');
  assert.ok(!treeInside(2, 0, 1, R, H), '树干不含 (2,0)');
  const crownMid = Math.round(trunkH + (H - 1 - trunkH) / 2);
  assert.ok(treeInside(R, 0, crownMid, R, H), '冠心层含 (R,0)（全半径）');
  const area = (dy)=>{ let n=0; for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++) if(treeInside(dx,dz,dy,R,H)) n++; return n; };
  assert.ok(area(crownMid) > area(1) * 3, '冠层截面远大于干层');
}

// ---- funnel：下颈上锥、锥口全宽、颈部细 ----
{
  const R = 5, H = 10, neckH = Math.round(H * 0.4);
  assert.ok(funnelInside(0, 0, 0, R, H), '颈底含中心');
  assert.ok(funnelInside(1, 0, 0, R, H), '颈含 (1,0)');
  assert.ok(!funnelInside(2, 0, 0, R, H), '颈不含 (2,0)');
  assert.ok(funnelInside(R, 0, H-1, R, H), '锥口(顶层)含 (R,0)');
  const area = (dy)=>{ let n=0; for(let dx=-R;dx<=R;dx++) for(let dz=-R;dz<=R;dz++) if(funnelInside(dx,dz,dy,R,H)) n++; return n; };
  assert.ok(area(H-1) > area(neckH), '锥口截面 > 锥底截面（开口向上）');
  assert.ok(area(H-1) > area(0), '锥口截面 > 颈部截面');
  // 锥段单调不减
  let prev = 0;
  for(let dy=neckH; dy<H; dy++){ const a = area(dy); assert.ok(a >= prev, `锥段截面单调不减 dy=${dy}`); prev = a; }
}

// ---- 接线校验 ----
{
  for(const [shape, fn, label] of [
    ['hourglass', 'Hourglass', '沙漏(双锥)'],
    ['tree', 'Tree', '树木'],
    ['funnel', 'Funnel', '漏斗'],
  ]){
    assert.ok(main.includes(`function apply${fn}Brush(`), `main.js 有 apply${fn}Brush`);
    assert.ok(main.includes(`function erase${fn}Brush(`), `main.js 有 erase${fn}Brush`);
    assert.ok(main.includes(`brushShape === '${shape}') apply${fn}Brush(`), `${shape} dispatch apply 已接线`);
    assert.ok(main.includes(`brushShape === '${shape}') erase${fn}Brush(`), `${shape} dispatch erase 已接线`);
    assert.ok(main.includes(`'笔刷形状：${label}'`), `${shape} flash 文案已接线`);
    assert.ok(html.includes(`<option value="${shape}">${label}</option>`), `${shape} index.html option 已接线`);
  }
}

console.log('hourglass/tree/funnel: all assertions passed (4 组)');
