function expression(n){
  if(n===0)return '도옹ㅠ';
  if(n<0)return 'ㅠ '+expression(-n);
  if(n<=10)return '도'+'오'.repeat(n-1)+'옹';
  for(let a=10;a>=2;a--)if(n%a===0)return expression(a)+' '+expression(n/a);
  return '도'+'오'.repeat(n-1)+'옹';
}
const output=(...ns)=>ns.map(n=>'뿡뿡 '+expression(n)+'~뿡뿡뿡~').join('');
const block=(label,...ns)=>'ㅋㅋ '+label+'\n'+output(...ns);
/* 이동문을 위해 @이름 표시를 실제 문장 번호의 동현랭 식으로 바꾼다. 문장 번호는 줄이 아니라 `~`로 나눈 조각 순번이다. */
function asm(parts){
  const lines=['나는 동현이냐?'],labels={};let count=1;
  for(const p of parts){if(typeof p==='object'){labels[p.label]=count+1;continue;}for(const l of p.split('\n')){lines.push(l);count+=l.split('~').length;}}
  lines.push('동현이구나');
  return lines.map(l=>l.replace(/@(\w+)/g,(_,k)=>{if(!labels[k])throw Error('없는 표시 '+k);return expression(labels[k]);})).join('\n');
}
const wrap=a=>asm(a);
const reset=(seed=7)=>block('처음은 시드 '+seed+', 다시 실행하면 새 시드로 마을을 초기화한다',1,seed);
const pathogen=(id,name)=>block('병원체: '+name,2,id);
const index=(id,label)=>block(label||(id?`첫 환자 ${id}번`:'첫 환자를 무작위로 고른다'),3,id);
const days=(n,label)=>block(label||`${n}일 동안 지켜본다`,7,n);
const vaccinate=(n,rule,label)=>block(label,5,n,rule);
const speed=(s)=>block('재생 속도 '+['','느리게','보통','빠르게'][s],11,s);
const isolation=(m,label)=>block(label,9,m);
const ve=(p)=>block(`백신 효과 ${p}%`,6,p);
const examples=[
 {id:'measles',title:'01 · 홍역 / 접종이 없는 마을',note:'469명 가운데 아무도 접종하지 않은 마을에 홍역 환자 한 명이 들어온다. 열흘 남짓의 잠복기가 지난 뒤 유행이 어떤 속도로 번지는지, 끝에 몇 명이 남는지 지켜보자.',
  code:wrap([reset(),speed(3),pathogen(1,'홍역'),index(0),days(90)])},
 {id:'measles-90',title:'02 · 홍역 / 접종률 90%',note:'469명 가운데 420명(약 90%)을 무작위로 접종한 마을에 홍역 환자 한 명이 들어온다. 홍역은 접종률이 조금만 모자라도 틈을 파고든다. 03번 예제와 같은 시드 3으로 처음 실행하므로, 접종률만 다른 두 마을을 나란히 비교할 수 있다. 같은 코드를 다시 실행하면 새 시드로 다른 우연을 본다.',
  code:wrap([reset(3),speed(3),pathogen(1,'홍역'),vaccinate(420,1,'무작위로 420명 접종 (약 90%)'),index(0),days(90)])},
 {id:'measles-94',title:'03 · 홍역 / 접종률 94%',note:'02번 예제처럼 시드 3으로 처음 실행하고, 접종 인원만 440명(약 94%)으로 늘린다. 몇 퍼센트의 차이가 결과를 어떻게 가르는지 보자. 다시 실행해 시드가 바뀌면 94%에서도 작은 집단 발생이 생기기도 하는데, 접종하지 않은 사람들이 서로 가까이 모여 있을 때다.',
  code:wrap([reset(3),speed(3),pathogen(1,'홍역'),vaccinate(440,1,'무작위로 440명 접종 (약 94%)'),index(0),days(90)])},
 {id:'flu-luck',title:'04 · 인플루엔자 / 운이 가르는 작은 유행',note:'R0가 1.3 정도인 인플루엔자는 첫 환자가 누구를 만나느냐에 따라 사라지기도, 퍼지기도 한다. 시드 1·2·3으로 같은 마을을 세 번 돌려 보자. 큰 수의 법칙이 통하지 않는 작은 세계다.',
  code:wrap([reset(1),speed(3),pathogen(3,'인플루엔자'),index(0),days(40),reset(2),speed(3),pathogen(3,'인플루엔자'),index(0),days(40),reset(3),speed(3),pathogen(3,'인플루엔자'),index(0),days(40)])},
 {id:'pertussis-targeted',title:'05 · 백일해 / 누구부터 접종할까',note:'백신 200회분으로 무작위 접종과 접촉이 많은 사람부터 접종하는 방법을 비교한다. 같은 수의 백신이라도 접촉망의 어디에 놓느냐가 결과를 바꾼다.',
  code:wrap([reset(),speed(3),pathogen(2,'백일해'),vaccinate(200,1,'무작위로 200명 접종'),index(0),days(120),
    reset(),speed(3),pathogen(2,'백일해'),vaccinate(200,2,'접촉이 많은 사람부터 200명 접종'),index(0),days(120)])},
 {id:'ring',title:'06 · 홍역 / 첫 환자 주변 고리 접종',note:'마을에서 접촉이 가장 많은 330번이 첫 환자가 된다. 먼저 아무 조치 없이, 다음에는 첫 환자의 가까운 접촉자와 그 접촉자 60명에게 고리 접종을 한 뒤 비교한다. 접종은 시간이 흐르기 전에 끝나므로, 실제 접촉자 추적의 지연은 들어 있지 않다.',
  code:wrap([reset(),speed(3),pathogen(1,'홍역'),index(330),days(90),
    reset(),speed(3),pathogen(1,'홍역'),index(330),vaccinate(60,3,'첫 환자 주변 고리에 60명 접종'),days(90)])},
 {id:'isolation',title:'07 · 홍역 / 격리와 접촉자 격리',note:'격리 정책 0(없음)·1(증상자 격리)·2(증상자와 가까운 접촉자 격리)를 같은 시드로 비교한다. 홍역은 증상을 알아채기 전부터 전염되므로 하루 늦은 격리만으로는 부족하다는 점이 드러난다.',
  code:wrap([reset(),speed(3),pathogen(1,'홍역'),index(0),days(90),
    reset(),speed(3),pathogen(1,'홍역'),isolation(1,'증상자 격리'),index(0),days(90),
    reset(),speed(3),pathogen(1,'홍역'),isolation(2,'증상자 격리 + 접촉자 격리'),index(0),days(90)])},
 {id:'efficacy',title:'08 · 홍역 / 백신 효과가 절반이라면',note:'접종률은 같은 94%지만 백신 효과를 97%와 50%로 달리한다. 접종률이 높아도 백신 자체의 효과가 낮으면 집단면역의 문턱을 넘지 못한다.',
  code:wrap([reset(),speed(3),pathogen(1,'홍역'),ve(97),vaccinate(440,1,'440명 접종 · 효과 97%'),index(0),days(90),
    reset(),speed(3),pathogen(1,'홍역'),ve(50),vaccinate(440,1,'440명 접종 · 효과 50%'),index(0),days(90)])},
 {id:'bbc',title:'09 · BBC 팬데믹 / 다큐멘터리의 사흘',note:'2018년 BBC 다큐멘터리가 쓴 설정 그대로다. 첫 환자가 마을을 돌아다니며 25분 만에 전염력이 생기는 가상의 독감을 퍼뜨린다. 느린 속도로 사흘을 재생하며 어느 시간대에 많이 퍼지는지 보자.',
  code:wrap([reset(),speed(1),pathogen(4,'BBC 팬데믹 모의 독감'),index(0),days(3)])},
 {id:'reactive',title:'10 · 백일해 / 관측하고 결정하기',note:'3주를 지켜본 뒤 누적 감염을 꽥꽥으로 읽는다. 10명 이상이면 접촉이 많은 사람부터 150명에게 뒤늦게 접종하고, 그렇지 않으면 그대로 둔다. 동현랭의 조건문이 실험의 방침을 정한다.',
  code:wrap([reset(),speed(3),pathogen(2,'백일해'),index(0),days(21,'먼저 3주를 지켜본다'),
    block('누적 감염(항목 7)을 관측 큐에 담는다',8,7),'ㅋㅋ 꽥꽥으로 읽어 동현에 담고 기록한다\n동현아 꽥꽥\n'+output(10)+'뿡뿡 동현~뿡뿡뿡~',
    'ㅋㅋ 누적 감염이 10명보다 적으면 접종 없이 지켜본다\n뭉치 동현ㅠㅠㅠㅠㅠㅠㅠㅠㅠㅠ? 신중동역 @skip',
    vaccinate(150,2,'뒤늦은 대응: 접촉이 많은 사람부터 150명 접종'),{label:'skip'},days(99,'남은 99일을 지켜본다')])},
 {id:'hub',title:'11 · 백일해 / 첫 환자가 누구인가',note:'사흘 동안 4 m 이내에서 37명을 만난 330번과, 4 m 이내 접촉이 한 명도 기록되지 않은 9번이 각각 첫 환자가 된다. 같은 병원체라도 첫 환자의 자리가 유행의 초반을 바꾼다. 다만 밤 시간과 집 안의 접촉은 기록에 없다.',
  code:wrap([reset(),speed(3),pathogen(2,'백일해'),index(330,'첫 환자 330번 · 접촉이 가장 많은 사람'),days(120),
    reset(),speed(3),pathogen(2,'백일해'),index(9,'첫 환자 9번 · 4 m 이내 접촉 기록이 없는 사람'),days(120)])},
 {id:'daily',title:'12 · 인플루엔자 / 날마다 읽고 기록하기',note:'동현랭의 반복문으로 하루씩 60일을 진행하며 최근 하루의 새 감염 수를 읽어 기록한다. 기록 창에 남는 숫자가 곧 유행 곡선이다. 시드 2는 유행이 자라는 쪽이다.',
  code:wrap([reset(2),speed(3),pathogen(3,'인플루엔자'),index(0),'ㅋㅋ 남은 날 수를 동현에 담는다\n동현아 '+expression(60),{label:'loop'},
    block('하루 진행',7,1),block('최근 하루 새 감염(항목 9)을 관측 큐에 담는다',8,9),'동동현아 꽥꽥\n'+output(10)+'뿡뿡 동동현~뿡뿡뿡~',
    'ㅋㅋ 하루를 빼고, 남은 날이 있으면 되돌아간다\n동현아 동현ㅠ\n뭉치 ㅠ 동현? 신중동역 @loop'])},
 {id:'blank',title:'20 · 빈 코드 / 직접 작성',note:'시작·끝 선언만 있는 빈 코드다. 시간도 흐르지 않고 아무도 아프지 않다. 그 사이에 나만의 마을 실험을 써 보자. 명령표는 동현랭 조작 규약에 있다.',
  code:wrap([])}
];
if(typeof module!=='undefined')module.exports={examples,expression,output,block,wrap};
