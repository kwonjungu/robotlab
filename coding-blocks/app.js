"use strict";
/* ================================================================
   코딩 3구조 놀이터 — 핵심 로직 + UI
   블록 모델: 평평한 토큰 배열(program). 구조는 시작/끝 토큰 짝으로 표현.
     동작: {op:'fwd'|'left'|'right'}
     반복: {op:'loopStart', count:N} ... {op:'loopEnd'}
     조건: {op:'ifStart'} ... {op:'ifElse'}(선택) ... {op:'ifEnd'}
   parse(): 토큰 배열 → 트리(노드). 짝이 안 맞으면 {error} 반환.
   simulate(): 트리를 실제 로봇 상태로 실행(조건 즉시 평가, 반복 전개).
               maxSteps로 무한/과도 실행 방지.
   node 단위 테스트에서 parse/simulate/isWall/wallAhead를 직접 부른다.
   ================================================================ */

/* ── 방향: 0=위,1=오른,2=아래,3=왼 ── */
const DIRS=[{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}];

/* ── 스테이지 정의 (10개) ──
   size: n×n, start {x,y,dir}, star: 목표, walls:[{x,y}]
   blkMax: 최대 블록 수(제한). recommend: 권장 이하로 풀면 별 하나 더(선택 표시)
   need: {loop, if} — 통과에 이 구조가 반드시 필요(의도된 해법 확인용)
   위계: 1 순차 → 2~3 반복 → 4~5 선택 → 6~10 반복+선택 종합(뒤로 갈수록 미로가 커짐).
   7~10은 순차만으로는 블록 제한(blkMax)에 걸려, 반드시 「반복 안에 만약(막힘?→오른쪽/아니면→앞으로)」
   한 벌(7블록)의 벽 따라 돌기로 풀어야 한다. 각 스테이지 해법은 인접 검증 스크립트로 확인됨. */
const STAGES=[
  { name:"스테이지 1 · 순차",
    goal:"블록을 <b>순서대로</b> 놓아 로봇(오른쪽 향함)을 별까지 옮겨요. 「앞으로」만으로도 풀려요.",
    hint:"앞으로 블록을 3개 놓아 보세요.",
    size:6, start:{x:1,y:3,dir:1}, star:{x:4,y:3}, walls:[], blkMax:6,
    need:{loop:false,if:false} },

  { name:"스테이지 2 · 반복 첫걸음",
    goal:"별이 <b>멀리(6칸)</b> 있어요. 「앞으로」를 6개 놓으면 <b>블록 제한(4개)</b>에 걸려요. <b>반복 시작–끝</b> 사이에 「앞으로」를 넣어 6번 반복해요.",
    hint:"반복 시작 6번 → 앞으로 → 반복 끝. 블록 3개면 끝!",
    size:8, start:{x:1,y:4,dir:1}, star:{x:7,y:4}, walls:[], blkMax:4,
    need:{loop:true,if:false} },

  { name:"스테이지 3 · 반복 + 회전",
    goal:"ㄴ자로 꺾인 길이에요. 오른쪽으로 쭉 갔다가 <b>돌아서</b> 위로 올라가요. 각 직선 구간을 <b>반복</b>으로 줄여요.",
    hint:"반복(앞으로) → 왼쪽 90° → 반복(앞으로). 회전은 반복 밖에서 한 번만.",
    size:8, start:{x:1,y:6,dir:1}, star:{x:5,y:2}, walls:[], blkMax:8,
    need:{loop:true,if:false} },

  { name:"스테이지 4 · 선택(막힌 앞)",
    goal:"오른쪽으로 가다 <b>벽</b>을 만나요. 「만약 앞이 막혔다면 오른쪽으로 돌고, 아니면 앞으로」를 <b>반복</b>으로 감싸면 벽 앞에서 스스로 꺾어 아래 별로 내려가요.",
    hint:"반복 시작(여러 번) → 만약(막힘?) → [오른쪽 90°] → 아니면 → [앞으로] → 만약 끝 → 반복 끝.",
    size:7, start:{x:1,y:1,dir:1},
    walls:[{x:4,y:1},{x:4,y:2},{x:4,y:3}], star:{x:3,y:5}, blkMax:8,
    need:{loop:true,if:true} },

  { name:"스테이지 5 · 지그재그",
    goal:"벽이 어긋나게 놓여 지그재그로 가야 해요. <b>반복 안에 만약</b>을 넣어, 벽을 만날 때마다 알아서 꺾게 만들어요.",
    hint:"반복 시작 (많이) → 만약 막혔으면 오른쪽 90° 아니면 앞으로 → 반복 끝. 한 벌로 끝까지!",
    size:8, start:{x:0,y:0,dir:2},
    walls:[{x:0,y:2},{x:2,y:1},{x:2,y:2},{x:2,y:3},{x:4,y:3},{x:4,y:4},{x:4,y:5}],
    star:{x:5,y:7}, blkMax:8,
    need:{loop:true,if:true} },

  { name:"스테이지 6 · 3구조 종합",
    goal:"모퉁이가 있는 미로예요. <b>바깥 반복</b> 안에 <b>만약(막힘?→오른쪽, 아니면→앞으로)</b>을 넣으면 벽을 따라 돌아 별까지 가요. 순차·반복·선택을 <b>모두</b> 쓰는 가장 짧은 코드예요.",
    hint:"반복 시작(넉넉히) → 만약(막힘?) → [오른쪽 90°] → 아니면 → [앞으로] → 만약 끝 → 반복 끝. 이 한 벌로 벽을 따라 돌아요.",
    size:9, start:{x:0,y:0,dir:1},
    walls:[
      {x:3,y:2},{x:3,y:3},{x:3,y:4},{x:3,y:5},
      {x:3,y:6},{x:3,y:7},{x:3,y:8}
    ],
    star:{x:8,y:8}, blkMax:12,
    need:{loop:true,if:true} },

  { name:"스테이지 7 · 벽 따라 한 바퀴",
    goal:"긴 벽이 앞을 가로막아요. 오른쪽으로 가다 벽을 만나면 <b>벽을 따라</b> 아래로 돌아 내려가 별까지 가야 해요. <b>반복 안에 만약(막힘?→오른쪽, 아니면→앞으로)</b> 한 벌이면 벽을 따라 저절로 돌아요.",
    hint:"반복 시작(넉넉히) → 만약(막힘?) → [오른쪽 90°] → 아니면 → [앞으로] → 만약 끝 → 반복 끝. 순차만으로는 블록이 모자라요.",
    size:8, start:{x:0,y:0,dir:1},
    walls:[
      {x:3,y:1},{x:3,y:2},{x:3,y:3},{x:3,y:4},
      {x:3,y:5},{x:3,y:6},{x:3,y:7}
    ],
    star:{x:7,y:7}, blkMax:10,
    need:{loop:true,if:true} },

  { name:"스테이지 8 · ㄷ자 우회",
    goal:"오른쪽 벽과 아래쪽 벽이 <b>ㄷ자</b>로 막았어요. 벽을 만날 때마다 오른쪽으로 꺾으며 <b>벽을 따라</b> 크게 돌아 왼쪽 아래 별로 가요.",
    hint:"똑같은 <b>반복 안에 만약</b> 한 벌이면 돼요. 반복 시작 → 만약(막힘?) → [오른쪽 90°] → 아니면 → [앞으로] → 만약 끝 → 반복 끝.",
    size:8, start:{x:0,y:0,dir:1},
    walls:[
      {x:6,y:1},{x:6,y:2},{x:6,y:3},{x:6,y:4},{x:6,y:5},{x:6,y:6},
      {x:1,y:6},{x:2,y:6},{x:3,y:6},{x:4,y:6},{x:5,y:6}
    ],
    star:{x:0,y:7}, blkMax:7,
    need:{loop:true,if:true} },

  { name:"스테이지 9 · 긴 지그재그",
    goal:"벽이 어긋난 <b>긴 지그재그</b> 길이에요. 스테이지 5보다 굽이가 많아요. 벽을 만날 때마다 스스로 꺾는 <b>반복 안 만약</b> 한 벌로 끝까지 내려가요.",
    hint:"반복 시작(많이) → 만약(막힘?) → [오른쪽 90°] → 아니면 → [앞으로] → 만약 끝 → 반복 끝. 한 벌로 모든 굽이를 통과해요.",
    size:9, start:{x:0,y:0,dir:2},
    walls:[
      {x:0,y:2},{x:2,y:1},{x:2,y:2},{x:2,y:3},
      {x:4,y:3},{x:4,y:4},{x:4,y:5},
      {x:6,y:5},{x:6,y:6},{x:6,y:7},{x:2,y:6},{x:2,y:7}
    ],
    star:{x:7,y:8}, blkMax:10,
    need:{loop:true,if:true} },

  { name:"스테이지 10 · 대형 나선 미로",
    goal:"가장 큰 <b>나선 미로</b>예요. 오른쪽 벽과 아래쪽 벽을 <b>따라 크게 한 바퀴</b> 돌아 왼쪽 맨 아래 별에 닿아요. 지금까지 익힌 <b>반복 안에 만약</b> 한 벌이 여기서도 그대로 통해요.",
    hint:"반복 시작(아주 넉넉히) → 만약(막힘?) → [오른쪽 90°] → 아니면 → [앞으로] → 만약 끝 → 반복 끝. 이 한 벌이 미로가 커져도 벽을 따라 돌아요.",
    size:10, start:{x:0,y:0,dir:1},
    walls:[
      {x:8,y:1},{x:8,y:2},{x:8,y:3},{x:8,y:4},{x:8,y:5},{x:8,y:6},{x:8,y:7},{x:8,y:8},
      {x:1,y:8},{x:2,y:8},{x:3,y:8},{x:4,y:8},{x:5,y:8},{x:6,y:8},{x:7,y:8}
    ],
    star:{x:0,y:9}, blkMax:7,
    need:{loop:true,if:true} }
];

const MAX_STEPS=400; // 무한/과도 실행 방지(원자 명령 수 상한)

/* ── 격자 헬퍼 ── */
function isWall(s,x,y){ return s.walls.some(w=>w.x===x&&w.y===y); }
function offBoard(s,x,y){ return x<0||y<0||x>=s.size||y>=s.size; }
/* 로봇이 (x,y)에서 dir 방향 바로 앞 칸이 막혔는가(벽 또는 경계) */
function wallAhead(s,x,y,dir){
  const nx=x+DIRS[dir].dx, ny=y+DIRS[dir].dy;
  return offBoard(s,nx,ny)||isWall(s,nx,ny);
}

/* ── 파서: 평평한 토큰 → 트리 ──
   노드 종류:
     {t:'act', op}
     {t:'loop', count, body:[...]}
     {t:'if', then:[...], els:[...]}
   반환: {ok:true, tree:[...], usedLoop, usedIf, depth} 또는 {ok:false, error} */
function parse(program){
  let i=0;
  let usedLoop=false, usedIf=false, maxDepth=0;

  function block(depth){
    if(depth>maxDepth) maxDepth=depth;
    const nodes=[];
    while(i<program.length){
      const tk=program[i];
      if(tk.op==='loopEnd'||tk.op==='ifEnd'||tk.op==='ifElse'){
        return nodes; // 상위에서 소비
      }
      if(tk.op==='fwd'||tk.op==='left'||tk.op==='right'){
        nodes.push({t:'act',op:tk.op}); i++;
      }
      else if(tk.op==='loopStart'){
        usedLoop=true;
        const count=Math.max(1,tk.count||1);
        i++; // consume loopStart
        const body=block(depth+1);
        if(i>=program.length||program[i].op!=='loopEnd')
          return {__err:"반복 「끝」 블록이 없어요. 「반복(시작–끝)」은 짝을 맞춰 주세요."};
        i++; // consume loopEnd
        nodes.push({t:'loop',count,body});
      }
      else if(tk.op==='ifStart'){
        usedIf=true;
        i++; // consume ifStart
        const then=block(depth+1);
        if(then.__err) return then;
        let els=[];
        if(i<program.length&&program[i].op==='ifElse'){
          i++; // consume else
          els=block(depth+1);
          if(els.__err) return els;
        }
        if(i>=program.length||program[i].op!=='ifEnd')
          return {__err:"만약 「끝」 블록이 없어요. 「만약」은 짝을 맞춰 주세요."};
        i++; // consume ifEnd
        nodes.push({t:'if',then,els});
      }
      else if(tk.op==='loopEnd'||tk.op==='ifEnd'){
        return {__err:"짝 없는 「끝」 블록이 있어요."};
      }
      else { i++; }
      if(nodes.__err) return nodes;
    }
    return nodes;
  }

  const tree=block(0);
  if(tree&&tree.__err) return {ok:false, error:tree.__err};
  // 소비 후 남은 토큰(짝 안 맞는 끝 등)
  if(i<program.length){
    return {ok:false, error:"짝이 맞지 않는 블록이 있어요. 시작–끝을 확인해 주세요."};
  }
  return {ok:true, tree, usedLoop, usedIf, depth:maxDepth};
}

/* ── 시뮬레이션 ──
   트리를 실제 로봇 상태로 실행. 반복 전개·조건 즉시 평가.
   반환: {states:[{x,y,dir,blocked?,turned?,checked?}], win, crash, steps, capped}
   states[0]은 시작 상태. capped=true면 MAX_STEPS 초과로 중단. */
function simulate(parsed, s){
  const tree = parsed.tree ? parsed.tree : parsed; // parse 결과 또는 트리 배열 직접 허용
  let x=s.start.x, y=s.start.y, dir=s.start.dir;
  const states=[{x,y,dir}];
  let win=(x===s.star.x&&y===s.star.y);
  let crash=false, capped=false;
  const ctx={done:false};

  function step(){ return states.length-1; }

  function checkWin(){
    if(x===s.star.x&&y===s.star.y){ win=true; ctx.done=true; }
  }

  function runNodes(nodes){
    for(const n of nodes){
      if(ctx.done) return;
      if(step()>=MAX_STEPS){ capped=true; ctx.done=true; return; }
      runNode(n);
    }
  }
  function runNode(n){
    if(ctx.done) return;
    if(n.t==='act'){
      if(n.op==='left'){ dir=(dir+3)%4; states.push({x,y,dir}); }
      else if(n.op==='right'){ dir=(dir+1)%4; states.push({x,y,dir}); }
      else if(n.op==='fwd'){
        const nx=x+DIRS[dir].dx, ny=y+DIRS[dir].dy;
        if(offBoard(s,nx,ny)||isWall(s,nx,ny)){
          crash=true; states.push({x,y,dir,blocked:true}); ctx.done=true; return;
        }
        x=nx; y=ny; states.push({x,y,dir});
        checkWin();
      }
    }
    else if(n.t==='loop'){
      for(let k=0;k<n.count;k++){
        if(ctx.done) return;
        if(step()>=MAX_STEPS){ capped=true; ctx.done=true; return; }
        runNodes(n.body);
      }
    }
    else if(n.t==='if'){
      const blocked=wallAhead(s,x,y,dir);
      // 조건 평가 표시용 상태(위치/방향 동일, checked 플래그)
      states.push({x,y,dir,checked:true,blocked});
      if(blocked) runNodes(n.then);
      else runNodes(n.els||[]);
    }
  }

  runNodes(tree);
  return {states, win, crash, steps:states.length-1, capped};
}

/* ── node 테스트 훅 ── */
if(typeof module!=='undefined'&&module.exports){
  module.exports={STAGES,DIRS,MAX_STEPS,parse,simulate,isWall,offBoard,wallAhead};
}

/* ================================================================
   여기부터 UI (브라우저 전용). node에서는 document가 없으므로 건너뜀.
   ================================================================ */
if(typeof document!=='undefined'){ (function(){
const $=id=>document.getElementById(id);

/* ── 상태 ── */
let stageIdx=0;
let program=[];   // 평평한 토큰 배열
let xp=0;
const cleared=new Set();
const badges={seq:false,loop:false,if:false};
let running=false;

const OPINFO={
  fwd:{lab:"앞으로",color:"#3D5AFE"},
  left:{lab:"왼쪽 90°",color:"#7C3AED"},
  right:{lab:"오른쪽 90°",color:"#F59E0B"},
  loopStart:{lab:"반복 시작",color:"#12B76A"},
  loopEnd:{lab:"반복 끝",color:"#12B76A"},
  ifStart:{lab:"만약 앞이 막혔다면",color:"#FF4D4D"},
  ifElse:{lab:"아니면",color:"#FF4D4D"},
  ifEnd:{lab:"만약 끝",color:"#FF4D4D"}
};

function stage(){return STAGES[stageIdx];}

/* ── 도움말 토글 ── */
$('helpBtn').addEventListener('click',()=>{
  const p=$('helpPanel'); const open=p.hasAttribute('hidden');
  if(open){ p.removeAttribute('hidden'); }else{ p.setAttribute('hidden',''); }
  $('helpBtn').setAttribute('aria-expanded', open?'true':'false');
  $('helpBtn').lastChild.textContent = open ? ' 도움말 닫기' : ' 어떻게 쓰나요? (사용법 열기)';
});

/* ── 스테이지 칩 생성 ── */
(function buildStageChips(){
  const bar=document.querySelector('.stagebar');
  STAGES.forEach((_,i)=>{
    const b=document.createElement('button');
    b.className='schip'; b.type='button'; b.dataset.stage=i; b.textContent=(i+1);
    b.addEventListener('click',()=>loadStage(i));
    bar.appendChild(b);
  });
})();

/* ── 격자 렌더 ── */
let robotPose={x:0,y:0,dir:1};

function computeCell(size){
  const wrap=$('board').parentElement;
  const avail=wrap ? wrap.clientWidth : 360;
  const usable=Math.max(0, avail-6);
  let cell=Math.floor(usable/size);
  cell=Math.min(52, cell);
  cell=Math.max(24, cell);
  return cell;
}
function applyCell(){
  const s=stage(); const board=$('board');
  const cell=computeCell(s.size);
  board.style.setProperty('--n', s.size);
  board.style.setProperty('--cell', cell+'px');
  board.dataset.cell=cell;
}
function buildBoard(){
  const s=stage(); const board=$('board');
  board.innerHTML=''; applyCell();
  for(let y=0;y<s.size;y++){
    for(let x=0;x<s.size;x++){
      const c=document.createElement('div');
      c.className='cell';
      if(isWall(s,x,y)) c.classList.add('wall');
      if(s.star.x===x&&s.star.y===y){
        c.innerHTML='<span class="star"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5.9 20.4l1.4-6.8L2.2 9l6.9-.7L12 2z" fill="var(--amber)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/></svg></span>';
      }
      board.appendChild(c);
    }
  }
  const r=document.createElement('div');
  r.className='robot'; r.id='robot';
  r.innerHTML='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="7" width="14" height="11" rx="3" fill="var(--point)" stroke="var(--ink)" stroke-width="2"/><circle cx="9.5" cy="12" r="1.6" fill="#fff"/><circle cx="14.5" cy="12" r="1.6" fill="#fff"/><path d="M12 7V3M9 3h6" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/><path d="M12 18v2" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/><path d="M17.5 10.5l3 1.5-3 1.5z" fill="var(--amber)" stroke="var(--ink)" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  board.appendChild(r);
  placeRobot(s.start.x,s.start.y,s.start.dir,false);
}
function placeRobot(x,y,dir,anim){
  const s=stage();
  x=Math.max(0,Math.min(s.size-1,x));
  y=Math.max(0,Math.min(s.size-1,y));
  robotPose={x,y,dir};
  const board=$('board'); const cell=+board.dataset.cell||48;
  const r=$('robot'); if(!r) return;
  if(!anim){ r.style.transition='none'; requestAnimationFrame(()=>{r.style.transition='';}); }
  r.style.transform='translate('+(x*cell)+'px,'+(y*cell)+'px) rotate('+(dir*90)+'deg)';
}
let resizeRAF=0;
function onResize(){
  if(resizeRAF) return;
  resizeRAF=requestAnimationFrame(()=>{
    resizeRAF=0; applyCell();
    placeRobot(robotPose.x,robotPose.y,robotPose.dir,false);
  });
}
window.addEventListener('resize',onResize);
window.addEventListener('orientationchange',onResize);

/* ── 프로그램 리스트 렌더 (들여쓰기/색으로 구조 표시 + 삽입 커서) ── */
function renderProg(){
  const list=$('progList');
  Array.from(list.children).forEach(n=>{ if(n.id!=='emptyMsg') n.remove(); });
  cursor=Math.max(0,Math.min(program.length,cursor));
  $('emptyMsg').style.display=program.length?'none':'block';

  const p=parse(program);

  // 커서 캐럿(위치 pos)을 그리는 헬퍼
  function caret(pos){
    const li=document.createElement('li');
    li.className='caret'+(pos===cursor?' on':'');
    li.setAttribute('role','button'); li.tabIndex=0;
    li.setAttribute('aria-label','여기에 블록 넣기');
    li.innerHTML=pos===cursor?'<span class="dot">▸ 여기에 넣기</span>':'<span class="dot">▸</span>';
    const setC=()=>{ cursor=pos; renderProg(); };
    li.addEventListener('click',setC);
    li.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();setC();} });
    list.appendChild(li);
  }

  let depth=0;
  caret(0);
  program.forEach((b,i)=>{
    const li=document.createElement('li');
    li.className='pitem'; li.dataset.i=i;
    const info=OPINFO[b.op];
    let indent=depth;
    if(b.op==='loopEnd'||b.op==='ifEnd'||b.op==='ifElse') indent=Math.max(0,depth-1);
    if(indent>=1) li.classList.add('inner');
    if(indent>=2) li.classList.add('inner2');

    if(b.op==='loopStart'||b.op==='loopEnd') li.classList.add('brk');
    if(b.op==='ifStart'||b.op==='ifEnd'||b.op==='ifElse'){ li.classList.add('brk','brk-if','in-if'); }

    let extra='';
    if(b.op==='loopStart') extra=`<span style="font-weight:900">${b.count}번</span>`;

    li.innerHTML=`<span class="idx">${i+1}</span>
      <span class="swatch" style="background:${info?info.color:'#999'}"></span>
      <span class="lab">${info?info.lab:b.op} ${extra}</span>
      <span class="stepbtns"></span>`;

    const btns=li.querySelector('.stepbtns');
    if(b.op==='loopStart'){
      const minus=mkMini('−','반복 횟수 줄이기',()=>{ if(b.count>1){b.count--; renderProg();} });
      const plus=mkMini('+','반복 횟수 늘리기',()=>{ if(b.count<30){b.count++; renderProg();} });
      btns.appendChild(minus); btns.appendChild(plus);
    }
    const del=mkMini('✕','블록 삭제',()=>deleteBlock(i)); del.classList.add('del');
    btns.appendChild(del);

    list.appendChild(li);
    caret(i+1);

    if(b.op==='loopStart'||b.op==='ifStart') depth++;
    else if(b.op==='loopEnd'||b.op==='ifEnd') depth=Math.max(0,depth-1);
  });

  $('blkCount').textContent=program.length;
  $('blkMax').textContent=stage().blkMax;
  $('countPill').classList.toggle('over', program.length>stage().blkMax);

  if(!p.ok && program.length){ setState(p.error,'bad'); }
}
function mkMini(txt,label,fn){
  const b=document.createElement('button');
  b.type='button'; b.className='mini'; b.textContent=txt; b.setAttribute('aria-label',label);
  b.onclick=fn; return b;
}

/* 짝 있는 구조 블록의 대응 인덱스 찾기 */
function matchIndex(idx){
  const b=program[idx];
  if(b.op==='loopStart'||b.op==='ifStart'){
    const openOp=b.op, closeOp=b.op==='loopStart'?'loopEnd':'ifEnd';
    let d=0;
    for(let j=idx;j<program.length;j++){
      if(program[j].op===openOp) d++;
      else if(program[j].op===closeOp){ d--; if(d===0) return j; }
    }
  } else if(b.op==='loopEnd'||b.op==='ifEnd'){
    const closeOp=b.op, openOp=b.op==='loopEnd'?'loopStart':'ifStart';
    let d=0;
    for(let j=idx;j>=0;j--){
      if(program[j].op===closeOp) d++;
      else if(program[j].op===openOp){ d--; if(d===0) return j; }
    }
  }
  return -1;
}
/* 구조 블록 삭제 시 시작–(아니면)–끝 전부 제거, 안의 내용은 남김 */
function deleteBlock(i){
  if(running) return;
  const b=program[i];
  if(b.op==='loopStart'||b.op==='loopEnd'||b.op==='ifStart'||b.op==='ifEnd'){
    const start=(b.op==='loopStart'||b.op==='ifStart')?i:matchIndex(i);
    const end=(b.op==='loopEnd'||b.op==='ifEnd')?i:matchIndex(i);
    if(start<0||end<0){ program.splice(i,1); renderProg(); return; }
    const toRemove=new Set([start,end]);
    // if면 사이의 ifElse도 제거
    if(program[start].op==='ifStart'){
      for(let j=start+1;j<end;j++) if(program[j].op==='ifElse') toRemove.add(j);
    }
    program=program.filter((_,k)=>!toRemove.has(k));
  } else {
    program.splice(i,1);
  }
  cursor=program.length;
  renderProg();
  setState('블록을 지웠어요.');
}

/* ── 삽입 커서 ──
   cursor: program 배열에서 "다음 블록이 들어갈 자리"(0..program.length).
   구조 블록을 넣으면 커서가 그 안(시작 바로 뒤)으로 이동해 자연히 안에 쌓임.
   프로그램 리스트의 각 항목 앞뒤 캐럿을 눌러 커서를 옮길 수 있다. */
let cursor=0;

/* 커서 위치가 몇 단계 구조 안인지 (중첩 제한 판정용) */
function depthAt(pos){
  let d=0;
  for(let i=0;i<pos;i++){
    const op=program[i].op;
    if(op==='loopStart'||op==='ifStart') d++;
    else if(op==='loopEnd'||op==='ifEnd') d--;
  }
  return d;
}

/* ── 블록 추가 (커서 위치에) ── */
function addBlock(op){
  if(running) return;
  let add;
  if(op==='loop') add=[{op:'loopStart',count:2},{op:'loopEnd'}];
  else if(op==='if') add=[{op:'ifStart'},{op:'ifElse'},{op:'ifEnd'}];
  else add=[{op}];

  if(program.length+add.length>stage().blkMax){
    setState('블록 제한('+stage().blkMax+'개)을 넘어요. 반복으로 줄여 봐요!','bad'); return;
  }
  const pos=Math.max(0,Math.min(program.length,cursor));
  program.splice(pos,0,...add);
  // 구조 블록: 커서를 시작 바로 뒤(=안쪽)로. 동작 블록: 커서를 방금 넣은 것 뒤로.
  if(op==='loop'||op==='if'){ cursor=pos+1; setState('구조 블록을 넣었어요. 커서(▸)가 안으로 들어갔어요. 이제 동작 블록을 넣어요.'); }
  else cursor=pos+add.length;
  renderProg();
}
/* 현재 열린 깊이(=커서 자리의 깊이) */
function currentOpenDepth(){ return depthAt(Math.max(0,Math.min(program.length,cursor))); }

/* ── 팔레트 클릭 & 드래그 ── */
let suppressClick=false; // 드래그-드롭으로 이미 추가한 경우 뒤이은 click 무시
$('palette').querySelectorAll('.blk').forEach(b=>{
  b.addEventListener('click',()=>{ if(suppressClick){ suppressClick=false; return; } tryAdd(b.dataset.op); });
});
function tryAdd(op){
  // 중첩 1단계까지 허용: 바깥(반복/만약) 안에 구조 블록 하나(if나 loop)까지는 OK.
  // 이미 2단계(구조 안의 구조 안)면 더는 구조 블록을 못 넣음.
  if((op==='loop'||op==='if') && currentOpenDepth()>=2){
    setState('중첩은 1단계까지예요. 안쪽 반복/만약 안에는 동작 블록만 넣어요.','bad'); return;
  }
  addBlock(op);
}
let dragOp=null, ghost=null;
$('palette').querySelectorAll('.blk').forEach(b=>{
  b.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0) return;
    dragOp=b.dataset.op;
    startGhost(b,e);
    const move=ev=>{ if(ghost){ghost.style.left=ev.clientX+'px'; ghost.style.top=ev.clientY+'px';} overList(ev);};
    const up=ev=>{
      document.removeEventListener('pointermove',move);
      document.removeEventListener('pointerup',up);
      $('progList').classList.remove('drag');
      if(ghost){ghost.remove();ghost=null;}
      const el=document.elementFromPoint(ev.clientX,ev.clientY);
      const inList=(el&&($('progList').contains(el)||el===$('progList')))||(el&&el.closest&&el.closest('#progList'));
      if(inList){ suppressClick=true; tryAdd(dragOp); }
      dragOp=null;
    };
    document.addEventListener('pointermove',move);
    document.addEventListener('pointerup',up);
  });
});
function startGhost(b,e){
  ghost=b.cloneNode(true); ghost.classList.add('drag-ghost');
  ghost.style.left=e.clientX+'px'; ghost.style.top=e.clientY+'px';
  document.body.appendChild(ghost);
}
function overList(ev){
  const el=document.elementFromPoint(ev.clientX,ev.clientY);
  const over=el&&(el===$('progList')||(el.closest&&el.closest('#progList')));
  $('progList').classList.toggle('drag',!!over);
}

/* ── 실행 ── */
$('runBtn').onclick=runProgram;
$('resetBtn').onclick=()=>{ if(running)return; const s=stage(); placeRobot(s.start.x,s.start.y,s.start.dir,false); setState('처음 위치로 돌아왔어요.'); };
$('clearBtn').onclick=()=>{ if(running)return; program=[]; cursor=0; renderProg(); setState('프로그램을 비웠어요.'); };

function setState(msg,kind){
  const el=$('state'); el.className='state'+(kind?' '+kind:''); el.innerHTML=msg;
}

async function runProgram(){
  if(running) return;
  if(program.length===0){ setState('먼저 블록을 쌓아요!','bad'); return; }
  const s=stage();
  const parsed=parse(program);
  if(!parsed.ok){ setState(parsed.error,'bad'); return; }
  const sim=simulate(parsed,s);

  running=true; $('runBtn').disabled=true; $('resetBtn').disabled=true; $('clearBtn').disabled=true;
  setState('로봇이 움직여요…');
  placeRobot(s.start.x,s.start.y,s.start.dir,false);
  const reduce=window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const delay=reduce?40:300;

  for(let i=1;i<sim.states.length;i++){
    await sleep(delay);
    const st=sim.states[i];
    if(st.checked){
      // 조건 평가 순간 — 이동 없음, 짧은 메시지
      setState(st.blocked?'앞이 <b>막혔어요</b> → 만약(참) 실행':'앞이 <b>뚫렸어요</b> → 아니면 실행');
      await sleep(reduce?20:160);
      continue;
    }
    placeRobot(st.x,st.y,st.dir,true);
    if(st.blocked){ setState('앞이 <b>벽</b>이라 더 못 가요. 「만약(막힘?)」이나 회전을 넣어 봐요.','bad'); }
  }

  running=false; $('runBtn').disabled=false; $('resetBtn').disabled=false; $('clearBtn').disabled=false;
  if(sim.win){ onWin(parsed); }
  else if(sim.capped){ setState('너무 오래 돌아요(무한 반복?). 반복 횟수나 조건을 살펴봐요.','bad'); }
  else if(!sim.crash){ setState('별에 닿지 못했어요. 블록 순서를 살펴봐요.','bad'); }
}

function onWin(parsed){
  const usedLoop=parsed.usedLoop;
  const usedIf=parsed.usedIf;
  setState('별 도착! <b>성공</b> 🎉 — 블록 '+program.length+'개로 풀었어요.','ok');
  if(!badges.seq){ badges.seq=true; gotBadge('seq'); }
  if(usedLoop&&!badges.loop){ badges.loop=true; gotBadge('loop'); }
  if(usedIf&&!badges.if){ badges.if=true; gotBadge('if'); }
  if(!cleared.has(stageIdx)){
    cleared.add(stageIdx);
    let gain=20; if(usedLoop)gain+=10; if(usedIf)gain+=10;
    xp+=gain; $('xp').textContent=xp;
    updateProgress();
    document.querySelector('.schip[data-stage="'+stageIdx+'"]').classList.add('cleared');
  }
}
function gotBadge(k){ $('badge-'+k).classList.add('got'); }
function updateProgress(){
  const n=cleared.size;
  $('progfill').style.width=(n/STAGES.length*100)+'%';
  document.querySelector('.progtrack').setAttribute('aria-valuenow',n);
}

/* ── 스테이지 전환 ── */
function loadStage(i){
  stageIdx=i; program=[]; cursor=0; running=false;
  document.querySelectorAll('.schip').forEach(c=>c.classList.toggle('on',+c.dataset.stage===i));
  $('stageName').textContent=stage().name;
  $('goalTxt').innerHTML=stage().goal;
  $('stageHintTxt').textContent=stage().hint;
  buildBoard(); renderProg();
  setState('블록을 쌓고 실행을 눌러요.');
}

/* ── 자기 점검 체크박스 ── */
document.querySelectorAll('.selfcheck .cbx').forEach(cb=>{
  const toggle=()=>cb.setAttribute('aria-checked', cb.getAttribute('aria-checked')==='true'?'false':'true');
  cb.addEventListener('click',toggle);
  cb.addEventListener('keydown',e=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); toggle(); } });
});

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

/* ── 시작 ── */
loadStage(0);
updateProgress();

})(); }
