// VoxelForge 第一人称物理测试：从 main.js 抽取真实 stepMove / stepSwim / inWaterAt。
// 覆盖：水平惯性（wish 归一化加速、摩擦指数衰减、maxSpeed 等比截断、方向保真）、
// 竖直游泳（空中纯重力、水中浮力缓沉、空格上浮、阻尼衰减、中性浮力）、
// 水面判定（列状态 waterCol、y<=s 边界、坐标取整、s=0 不误判为无水）。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const NODE = process.execPath;
const dir = __dirname;
let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };
const near = (a, b, eps)=> Math.abs(a - b) < (eps == null ? 1e-9 : eps);

// 0) main.js ESM 语法检查（房屋惯例，同 _mirror_test）
try { execSync(`"${NODE}" --check --input-type=module < "${path.join(dir, 'main.js')}"`, { stdio:'pipe' }); ok('main.js ESM 语法 OK', true); }
catch(e){ ok('main.js ESM 语法 OK', false); console.log((e.stderr?e.stderr.toString():e.message).slice(0, 600)); }

const src = fs.readFileSync(path.join(dir, 'main.js'), 'utf8');
function extractFn(name){
  const start = src.indexOf('function ' + name + '(');
  if(start < 0) throw new Error('找不到函数 ' + name);
  let depth = 0, i = src.indexOf('{', start);
  for(; i < src.length; i++){
    const c = src[i];
    if(c === '{') depth++;
    else if(c === '}'){ depth--; if(depth === 0) return src.slice(start, i+1); }
  }
  throw new Error('函数 ' + name + ' 括号不匹配');
}

// 静态接线守卫：tick 行走分支确实走了新物理通道
ok('tick 已接 inWaterAt 水面判定', src.includes('inWaterAt(camera.position.x, camera.position.y - 1.0, camera.position.z, waterCol, wkey)'));
ok('tick 已接 stepMove 惯性积分', src.includes('stepMove(velX, velZ, move.x, move.z, dt, opt)'));
ok('tick 已接 stepSwim 竖直物理', src.includes('stepSwim(velY, !!keys[\' \'], true, dt)') && src.includes('stepSwim(velY, false, false, dt)'));
ok('离地后 onGround 置 false（防腾空跳）', /if\(camera\.position\.y <= gy\)\{ camera\.position\.y = gy; velY = 0; onGround = true; \}\s*\r?\n\s*else \{ onGround = false; \}/.test(src));

// ---- ① stepMove 水平惯性 ----
let stepMove, stepSwim, inWaterAt;
try {
  const bake = new Function(extractFn('stepMove') + '\nreturn stepMove;');
  stepMove = bake();
  ok('stepMove 抽取成功', true);
} catch(e){ ok('stepMove 抽取成功', false); console.log('  ', e.message); }

if(stepMove){
  // 加速：静止起步，wish (1,0)，accel 4，dt 0.5 → vx = 2（friction 0 关闭衰减）
  const a1 = stepMove(0, 0, 1, 0, 0.5, { accel: 4, friction: 0, maxSpeed: 100 });
  ok('静止加速(方向正确)', near(a1.vx, 2) && a1.vz === 0);
  // wish 归一化：(3,0) 与 (1,0) 同效果
  const a2 = stepMove(0, 0, 3, 0, 0.5, { accel: 4, friction: 0, maxSpeed: 100 });
  ok('wish 内部归一化', near(a2.vx, 2) && a2.vz === 0);
  // 对角：各分量 accel/√2，总速度 = accel*dt
  const a3 = stepMove(0, 0, 1, 1, 0.5, { accel: 4, friction: 0, maxSpeed: 100 });
  ok('对角加速(斜向归一)', near(a3.vx, 2/Math.SQRT2) && near(a3.vz, 2/Math.SQRT2) && near(Math.hypot(a3.vx, a3.vz), 2));
  // 摩擦衰减：v0 (2,0)，无输入，friction 2，dt 0.1 → *0.8
  const f1 = stepMove(2, 0, 0, 0, 0.1, { friction: 2 });
  ok('松手摩擦衰减', near(f1.vx, 1.6) && f1.vz === 0);
  // 摩擦夹 0（大 dt 不反号）
  const f2 = stepMove(0.01, 0, 0, 0, 1, { friction: 8 });
  ok('摩擦衰减夹 0 不反号', f2.vx === 0 && f2.vz === 0);
  // 超速截断：v0 (10,0) 无输入无摩擦 maxSpeed 2.5 → (2.5,0)
  const c1 = stepMove(10, 0, 0, 0, 0.1, { friction: 0 });
  ok('超速按 maxSpeed 截断', near(c1.vx, 2.5) && c1.vz === 0);
  // 截断保方向：v0 (3,4) → 5 超限 → 等比缩到 (1.5,2)
  const c2 = stepMove(3, 4, 0, 0, 0.1, { friction: 0 });
  ok('截断保持速度方向', near(c2.vx, 1.5) && near(c2.vz, 2));
  // dt=0 无输入不变化；负方向 wish
  const z1 = stepMove(1.2, -0.7, 0, 0, 0, {});
  ok('dt=0 恒等', near(z1.vx, 1.2) && near(z1.vz, -0.7));
  const n1 = stepMove(0, 0, 0, -2, 0.5, { accel: 4, friction: 0, maxSpeed: 100 });
  ok('负方向加速', n1.vx === 0 && near(n1.vz, -2));
}

// ---- ② stepSwim 竖直物理 ----
try {
  const bake = new Function('GRAV', extractFn('stepSwim') + '\nreturn stepSwim;');
  stepSwim = bake(22);
  ok('stepSwim 抽取成功', true);
} catch(e){ ok('stepSwim 抽取成功', false); console.log('  ', e.message); }

if(stepSwim){
  // 空中纯重力：与旧实现 velY -= GRAV*dt 完全一致
  ok('空中纯重力(回归等价旧实现)', stepSwim(5, false, false, 0.5) === -6 && stepSwim(5, true, false, 0.5) === -6);
  // 水中缓沉：vy=0, dt=0.1 → -(22-19)*0.1=-0.3 → *0.7 = -0.21，远小于空中 -2.2
  const s1 = stepSwim(0, false, true, 0.1);
  ok('水中浮力缓沉', near(s1, -0.21) && Math.abs(s1) < Math.abs(-2.2));
  // 空格上浮：-0.3 + 14*0.1 = 1.1 → *0.7 = 0.77 > 0
  const s2 = stepSwim(0, true, true, 0.1);
  ok('水中空格上浮', near(s2, 0.77) && s2 > 0);
  // 阻尼衰减：drag 0 → -0.3；drag 3 → -0.21，幅度更小
  const s3 = stepSwim(0, false, true, 0.1, { drag: 0 });
  ok('阻尼可关(对照)', near(s3, -0.3) && Math.abs(s1) < Math.abs(s3));
  // 中性浮力：buoy=grav 且 drag=0 → vy 不变
  ok('中性浮力(可配置)', stepSwim(1.5, false, true, 0.3, { buoy: 22, drag: 0 }) === 1.5);
  // 大 dt 阻尼夹 0 不反号：vy -0.5，dt 10 → *(max(0,1-30)) = 0
  const s4 = stepSwim(-0.5, false, true, 10);
  ok('阻尼夹 0 不反号', s4 === 0);
  // 自定义重力（空中）
  ok('自定义 grav 生效', stepSwim(5, false, false, 0.5, { grav: 10 }) === 0);
}

// ---- ③ inWaterAt 水面判定 ----
try {
  const bake = new Function(extractFn('inWaterAt') + '\nreturn inWaterAt;');
  inWaterAt = bake();
  ok('inWaterAt 抽取成功', true);
} catch(e){ ok('inWaterAt 抽取成功', false); console.log('  ', e.message); }

if(inWaterAt){
  const wkey = (x,z)=> x + ',' + z;
  const water = new Map([[wkey(5,7), 12], [wkey(0,0), 0]]);
  ok('身体低于水面 = 在水中(含贴边 y==s)', inWaterAt(5, 12, 7, water, wkey) === true);
  ok('高于水面 = 不在水中', inWaterAt(5, 13, 7, water, wkey) === false);
  ok('无水列 = 不在水中', inWaterAt(9, 1, 9, water, wkey) === false);
  ok('坐标四舍五入取整', inWaterAt(5.4, 11, 6.6, water, wkey) === true && inWaterAt(5.6, 11, 6.4, water, wkey) === false);
  ok('s=0 是有效水面(不误判)', inWaterAt(0, 0, 0, water, wkey) === true && inWaterAt(0, 1, 0, water, wkey) === false);
}

console.log(`[VoxelForge fps-move] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
