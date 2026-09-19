// VoxelForge 按群系天气单元测试：从 main.js 抽取【真实生产函数】
// weatherFor（群系降水表）/ spawnParticle（圆盘出生）/ stepParticle（下落+雪摆动）/
// groundYAt（地形顶/水面顶取高者），断言确定性、群系语义、占比带、几何窗口与地面回收；
// 另对 UI 复选框 / tick 集成 / 材质切换做结构守护。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c)=>{ if(c) pass++; else { fail++; console.log('  FAIL', n); } };

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const ihtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
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
function extractConstArrow(name){
  const m = src.match(new RegExp('const ' + name + ' = [^;]+;'));
  if(!m) throw new Error('找不到常量 ' + name);
  return m[0];
}
let amp = 12;   // 生产默认（main.js: let amp = 12），heightAt 闭包引用
const code = [
  'const waterCol = new Map();',                 // stub：groundYAt 读模块级 waterCol
  extractConstArrow('smooth'),
  extractConstArrow('lerp'),
  extractConstArrow('wkey'),
  extractConstArrow('W_SPAWN_R'),                // 一行带出 W_SPAWN_H/W_RAIN_SPEED/W_SNOW_SPEED
  extractFn('hash'), extractFn('hash3'), extractFn('hash3u'),
  extractFn('vnoise'), extractFn('vnoise3'), extractFn('fbm'), extractFn('fbm3'),
  extractFn('heightAt'),
  extractFn('weatherFor'), extractFn('spawnParticle'), extractFn('stepParticle'), extractFn('groundYAt')
].join('\n');
const bake = new Function('amp', code + '\nreturn { weatherFor, spawnParticle, stepParticle, groundYAt, hash, heightAt, waterCol, wkey };');
const { weatherFor, spawnParticle, stepParticle, groundYAt, heightAt, waterCol, wkey } = bake(amp);

const COLD = ['taiga', 'tundra', 'alpine'];
const WET = ['jungle', 'forest', 'plains', 'beach', 'savanna'];
const ALL = COLD.concat(WET, ['desert']);

// ---- 1) weatherFor：确定性 + 值域 ----
ok('weatherFor 确定性', weatherFor('jungle', 123) === weatherFor('jungle', 123) && weatherFor('taiga', 9) === weatherFor('taiga', 9));
ok('weatherFor 值域 {clear,rain,snow}', (()=>{
  for(let ph = 0; ph < 500; ph++) for(const b of ALL){
    const w = weatherFor(b, ph);
    if(w !== 'clear' && w !== 'rain' && w !== 'snow') return false;
  }
  return true;
})());

// ---- 2) 群系语义：沙漠不降水 / 冷群系雪 / 湿润群系雨 ----
ok('desert 恒 clear（300 相位）', (()=>{
  for(let ph = 0; ph < 300; ph++) if(weatherFor('desert', ph) !== 'clear') return false;
  return true;
})());
ok('冷群系降水窗内必 snow（各 300 相位）', COLD.every(b=>{
  for(let ph = 0; ph < 300; ph++){ const w = weatherFor(b, ph); if(w === 'rain') return false; }
  return true;
}));
ok('湿润群系降水窗内必 rain（各 300 相位）', WET.every(b=>{
  for(let ph = 0; ph < 300; ph++){ const w = weatherFor(b, ph); if(w === 'snow') return false; }
  return true;
}));
{
  let rain = 0, clear = 0;
  for(let ph = 0; ph < 2000; ph++){ const w = weatherFor('jungle', ph); if(w === 'rain') rain++; else if(w === 'clear') clear++; }
  ok('jungle 降水占比落在 28%~42%（期望 ~35%）', rain / 2000 > 0.28 && rain / 2000 < 0.42);
  ok('存在无天气相位窗', clear > 0);
}
ok('beach（水岸）也下雨', (()=>{
  for(let ph = 0; ph < 300; ph++) if(weatherFor('beach', ph) === 'rain') return true;
  return false;
})());

// ---- 3) spawnParticle：圆盘出生几何 ----
{
  const p1 = spawnParticle(5, 42, 100, 50, -30);
  const p2 = spawnParticle(5, 42, 100, 50, -30);
  ok('spawnParticle 确定性', p1.x === p2.x && p1.y === p2.y && p1.z === p2.z);
  let inR = true, inY = true;
  for(let i = 0; i < 40; i++){
    const p = spawnParticle(i, 7, 0, 0, 0);
    if(Math.hypot(p.x, p.z) > 26 + 1e-9) inR = false;
    if(p.y < 6 - 1e-9 || p.y > 6 + 18 + 1e-9) inY = false;
  }
  ok('水平半径 ≤ W_SPAWN_R(26)', inR);
  ok('高度窗 [cy+6, cy+6+W_SPAWN_H]', inY);
  const uniq = new Set();
  for(let i = 0; i < 30; i++){ const p = spawnParticle(i, 7, 10, 20, 30); uniq.add(p.x.toFixed(4) + ',' + p.z.toFixed(4)); }
  ok('出生点散布（30 粒子 ≥ 25 唯一）', uniq.size >= 25);
}

// ---- 4) stepParticle：下落速度 / 雪摆动 / 地面回收 ----
{
  const p = { x: 3, y: 50, z: 7 };
  const alive = stepParticle(p, 0.1, 'rain', 20, 1.0);
  ok('雨速精确 y-=22*dt', p.y === 47.8);
  ok('雨 x/z 不变（垂直下落）', p.x === 3 && p.z === 7);
  ok('高于地面返回 true', alive === true);
  const s = { x: 3, y: 50, z: 7 };
  stepParticle(s, 0.1, 'snow', 20, 1.0);
  ok('雪速精确 y-=3.2*dt', s.y === 49.68);
  const s2 = { x: 3, y: 50, z: 7 };
  let swayed = false;
  for(let t = 0; t < 6; t += 0.13){ const q = { x: 3, y: 50, z: 7 }; stepParticle(q, 0.1, 'snow', 20, t); if(q.x !== 3) { swayed = true; break; } }
  ok('雪水平摆动随 t 变化', swayed);
  const g1 = { x: 0, y: 20.05, z: 0 };
  ok('落穿地面返回 false', stepParticle(g1, 0.1, 'rain', 20, 1.0) === false && g1.y <= 20);
  const g2 = { x: 0, y: 23, z: 0 };
  ok('地面上方保持 true', stepParticle(g2, 0.1, 'rain', 20, 1.0) === true && g2.y === 20.8);
}

// ---- 5) groundYAt：地形顶/水面顶取高者 + 0.5 ----
{
  let okTerrain = true;
  const pts = [[3, 4], [-1, -1], [0, 0], [17, -9], [100, 100]];
  for(const [x, z] of pts){
    if(groundYAt(x + 0.3, z + 0.7) !== heightAt(x, z) + 0.5) okTerrain = false;
  }
  ok('无水列 = heightAt+0.5（含负坐标 floor）', okTerrain);
  const h34 = heightAt(3, 4);
  waterCol.set(wkey(3, 4), h34 + 4);
  ok('水柱高于地形 = 水面顶+0.5', groundYAt(3.2, 4.7) === h34 + 4.5);
  waterCol.set(wkey(3, 4), h34 - 2);
  ok('水低于地形 = 地形顶+0.5（取高者）', groundYAt(3.2, 4.7) === h34 + 0.5);
  waterCol.delete(wkey(3, 4));
}

// ---- 6) 结构守护：UI / tick 集成 / 材质切换 ----
ok('UI: index.html weather 复选框（默认勾选）', /id="weather"[^>]*checked/.test(ihtml));
ok('UI: 帮助文案含天气说明', ihtml.includes('按群系天气') && ihtml.includes('相位窗'));
ok('main: weatherFor 函数定义', src.includes('function weatherFor(biome, phase)'));
ok('main: tick 集成 weatherOn 分支', src.includes('if(weatherOn){'));
ok('main: 地下不渲染降水守卫', src.includes('const underground = py < groundYAt(px, pz) + 0.5;'));
ok('main: 粒子位置回写 needsUpdate', src.includes('wGeo.attributes.position.needsUpdate = true'));
ok('main: 雨/雪材质切换', src.includes('0x8fb3d9') && src.includes('wMat.size = 0.22'));
ok('main: onchange 开关接线', src.includes("$('weather').onchange = e=>{ weatherOn = e.target.checked; };"));

console.log('weather: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
