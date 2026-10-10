// MIDI clock generator (lookahead scheduler) and clock measurement. Pure logic, no DOM.
const clampBpm=b=>Math.min(300,Math.max(30,Number.isFinite(+b)?+b:120));

export function createClockScheduler({send,now,setTimer,clearTimer,lookaheadMs=60,tickMs=20}){
  let running=false,bpm=120,next=0,timer=null,ticksSent=0,startedAt=null;
  const interval=()=>60000/bpm/24;
  function pump(){
    timer=null;if(!running)return;
    const horizon=now()+lookaheadMs;
    while(next<horizon){send([0xF8],next);ticksSent++;next+=interval()}
    timer=setTimer(pump,tickMs);
  }
  function begin(){running=true;next=now();pump()}
  return {
    start(b,{sendStart=true}={}){
      if(timer!==null){clearTimer(timer);timer=null}
      bpm=clampBpm(b);startedAt=now();ticksSent=0;
      if(sendStart)send([0xFA],startedAt);
      begin();
    },
    stop(){send([0xFC],now());running=false;if(timer!==null){clearTimer(timer);timer=null}},
    cont(){send([0xFB],now());if(!running){if(startedAt===null)startedAt=now();begin()}},
    setBpm(b){bpm=clampBpm(b)},
    sendSpp(sixteenths){const v=Math.min(16383,Math.max(0,Math.round(+sixteenths||0)));send([0xF2,v&127,v>>7],now())},
    isRunning:()=>running,
    stats:()=>({ticksSent,bpm,startedAt})
  };
}

// Pair sent/received tick times by index (dropping the first), remove constant latency and linear drift, report spread.
export function clockMeasure(sentTimes=[],receivedTimes=[],bpmSet=120){
  const n=Math.min(sentTimes.length,receivedTimes.length)-1,lost=Math.max(0,sentTimes.length-receivedTimes.length);
  const empty={ticks:Math.max(0,n),bpmMeasured:null,driftPpm:null,jitterRmsMs:null,maxDeviationMs:null,lost};
  if(n<3)return empty;
  const s=sentTimes.slice(1,n+1),r=receivedTimes.slice(1,n+1);
  const meanInt=(r[n-1]-r[0])/(n-1),expInt=60000/bpmSet/24;
  const d=r.map((x,i)=>x-s[i]),mi=(n-1)/2,md=d.reduce((a,b)=>a+b,0)/n;
  let num=0,den=0;for(let i=0;i<n;i++){num+=(i-mi)*(d[i]-md);den+=(i-mi)**2}
  const slope=num/den,res=d.map((x,i)=>x-(md+slope*(i-mi)));
  return {ticks:n,bpmMeasured:60000/(meanInt*24),driftPpm:(meanInt-expInt)/expInt*1e6,jitterRmsMs:Math.sqrt(res.reduce((a,b)=>a+b*b,0)/n),maxDeviationMs:Math.max(...res.map(Math.abs)),lost};
}
