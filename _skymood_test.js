// VoxelForge 天空氛围单元测试：从 main.js 抽取【真实生产函数】skyMood（群系雾色 ×
// 天气密度 × 昼夜修正）/ lerpMood（平滑过渡），断言群系色表特征、天气雾距/变暗表、
// dayFactor 钳制与插值；另对 sky shader uDim 与 tick 氛围块四路联动做结构守护。
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
const { skyMood, lerpMood } =
  new Function(extractFn('skyMood') + '\n' + extractFn('lerpMood') + '\nreturn { skyMood, lerpMood };')();

const BIOMES = ['desert', 'jungle', 'savanna', 'taiga', 'tundra', 'alpine', 'beach', 'plains', 'forest'];
const WEATHERS = ['clear', 'rain', 'snow'];

// ---- 1) skyMood：确定性 + 值域 ----
ok('skyMood 确定性', JSON.stringify(skyMood('desert', 'rain', 0.5)) === JSON.stringify(skyMood('desert', 'rain', 0.5)));
ok('27 组合雾色值域 [0,1]', (()=>{
  for(const b of BIOMES) for(const w of WEATHERS) for(const d of [0, 0.5, 1]){
    const m = skyMood(b, w, d);
    for(const v of m.fog) if(!(v >= 0 && v <= 1)) return false;
  }
  return true;
})());
ok('dayFactor 越界钳制（-1→0.18 系数 / 2→1 系数）', (()=>{
  const a = skyMood('plains', 'clear', -1), b = skyMood('plains', 'clear', 0), c = skyMood('plains', 'clear', 2), d = skyMood('plains', 'clear', 1);
  return JSON.stringify(a.fog) === JSON.stringify(b.fog) && JSON.stringify(c.fog) === JSON.stringify(d.fog);
})());
ok('dayFactor=null 视为正午', JSON.stringify(skyMood('plains', 'clear', null).fog) === JSON.stringify(skyMood('plains', 'clear', 1).fog));

// ---- 2) 群系色表特征 ----
{
  const desert = skyMood('desert', 'clear', 1).fog;
  ok('desert 暖黄（r>b）', desert[0] > desert[2]);
  const taiga = skyMood('taiga', 'clear', 1).fog;
  ok('taiga 冷白蓝（b>r）', taiga[2] > taiga[0]);
  const jungle = skyMood('jungle', 'clear', 1).fog;
  ok('jungle 青绿（g>r）', jungle[1] > jungle[0]);
  const pl = skyMood('plains', 'clear', 1).fog, fo = skyMood('forest', 'clear', 1).fog;
  ok('plains/forest 共用默认淡蓝', JSON.stringify(pl) === JSON.stringify(fo));
  const cold = skyMood('alpine', 'clear', 1).fog;
  ok('tundra/alpine 与 taiga 同冷色表', JSON.stringify(cold) === JSON.stringify(skyMood('tundra', 'clear', 1).fog));
}

// ---- 3) 天气表：雾距 / 变暗 ----
{
  const t = (w)=>skyMood('plains', w, 1);
  ok('clear 雾距 60..220 · dim 1', t('clear').fogNear === 60 && t('clear').fogFar === 220 && t('clear').dim === 1);
  ok('rain 雾距 24..90 · dim 0.55（近而浓）', t('rain').fogNear === 24 && t('rain').fogFar === 90 && t('rain').dim === 0.55);
  ok('snow 雾距 30..120 · dim 0.85', t('snow').fogNear === 30 && t('snow').fogFar === 120 && t('snow').dim === 0.85);
  ok('未知天气回退晴朗表', skyMood('plains', 'fog', 1).fogNear === 60 && skyMood('plains', 'fog', 1).dim === 1);
}

// ---- 4) 昼夜修正 ----
{
  const day = skyMood('plains', 'clear', 1).fog, night = skyMood('plains', 'clear', 0).fog;
  ok('夜雾色 = 日雾色 × 0.18', Math.abs(night[0] - day[0] * 0.18) < 1e-12);
  ok('d=0.5 → 系数 0.59', Math.abs(skyMood('plains', 'clear', 0.5).fog[0] - day[0] * 0.59) < 1e-12);
}

// ---- 5) lerpMood：平滑过渡 ----
{
  const a = { fog: [0.1, 0.2, 0.3], fogNear: 10, fogFar: 100, dim: 0.5 };
  const b = skyMood('desert', 'rain', 1);
  ok('k=1 直达目标', JSON.stringify(lerpMood(a, b, 1).fog) === JSON.stringify(b.fog) && lerpMood(a, b, 1).dim === b.dim);
  ok('k=0 保持当前', JSON.stringify(lerpMood(a, b, 0).fog) === JSON.stringify(a.fog) && lerpMood(a, b, 0).fogNear === 10);
  const mid = lerpMood(a, b, 0.5);
  ok('k=0.5 全字段中点插值', Math.abs(mid.fog[0] - (a.fog[0] + b.fog[0]) / 2) < 1e-12
    && Math.abs(mid.fogNear - (a.fogNear + b.fogNear) / 2) < 1e-12
    && Math.abs(mid.fogFar - (a.fogFar + b.fogFar) / 2) < 1e-12
    && Math.abs(mid.dim - (a.dim + b.dim) / 2) < 1e-12);
}

// ---- 6) 结构守护：shader uDim / tick 氛围块四路联动 ----
ok('shader: uDim uniform 声明 + col *= uDim', src.includes('uniform float uDay; uniform float uDim;') && src.includes('col *= uDim;'));
ok('tick: 氛围块读 weatherOn 关闭时按晴朗', src.includes('const wt = weatherOn ? weatherType : \'clear\';'));
ok('tick: 雾色 setRGB 联动', src.includes('scene.fog.color.setRGB(moodCur.fog[0], moodCur.fog[1], moodCur.fog[2]);'));
ok('tick: 雾距 near/far 联动', src.includes('scene.fog.near = moodCur.fogNear;') && src.includes('scene.fog.far = moodCur.fogFar;'));
ok('tick: 天空 uDim 联动', src.includes('skyMat.uniforms.uDim.value = moodCur.dim;'));
ok('tick: 灯光乘 dim（昼夜/常亮双分支）', src.includes('hemi.intensity = moodCur.dim * (dayNight ? 0.25 + dayFactor * 0.8 : 0.95);'));
ok('tick: moodCur 向目标平滑（dt 限幅）', src.includes('moodCur = lerpMood(moodCur, target, Math.min(1, dt * 2.5));'));
ok('UI: 帮助文案含氛围说明', ihtml.includes('雨/雪同步压暗天空与浓雾') && ihtml.includes('雾色随群系变化'));

console.log('skymood: ' + pass + ' pass / ' + fail + ' fail');
process.exit(fail ? 1 : 0);
