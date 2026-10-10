// Pure chart-data helpers (no DOM).
export function decimateMinMax(xs=[],ys=[],buckets=1){
  const n=Math.min(xs.length,ys.length);if(n<=2*buckets||buckets<1)return {x:xs,y:ys};
  const x=[],y=[],size=n/buckets;
  for(let b=0;b<buckets;b++){
    const s=Math.floor(b*size),e=Math.min(n,Math.floor((b+1)*size));if(e<=s)continue;
    let lo=s,hi=s;for(let i=s+1;i<e;i++){if(ys[i]<ys[lo])lo=i;if(ys[i]>ys[hi])hi=i}
    for(const i of lo===hi?[lo]:lo<hi?[lo,hi]:[hi,lo]){x.push(xs[i]);y.push(ys[i])}
  }
  return {x,y};
}
export function niceTicks(min,max,count=5){
  if(!Number.isFinite(min)||!Number.isFinite(max))return [];
  if(min===max)return [min];if(min>max)[min,max]=[max,min];
  const raw=(max-min)/Math.max(1,count),mag=10**Math.floor(Math.log10(raw)),f=raw/mag,step=(f<=1?1:f<=2?2:f<=5?5:10)*mag;
  const out=[],start=Math.ceil(min/step-1e-9)*step,dec=Math.max(0,-Math.floor(Math.log10(step))+1);
  for(let v=start;v<=max+step*1e-9;v+=step)out.push(Number(v.toFixed(dec)));
  return out;
}
export function percentile(values=[],p=50){
  const a=values.filter(Number.isFinite).sort((m,n)=>m-n);if(!a.length)return null;
  const r=Math.min(100,Math.max(0,p))/100*(a.length-1),lo=Math.floor(r),hi=Math.ceil(r);
  return a[lo]+(a[hi]-a[lo])*(r-lo);
}
export function rateTimeline(timestamps=[],binMs=1000){
  if(!timestamps.length||!(binMs>0))return [];
  const t0=Math.min(...timestamps),t1=Math.max(...timestamps),n=Math.floor((t1-t0)/binMs)+1,c=new Array(n).fill(0);
  for(const t of timestamps)c[Math.floor((t-t0)/binMs)]++;
  return c.map((k,i)=>({t:t0+i*binMs,rate:k*1000/binMs}));
}
export function histogramBins(values=[],bins=10){
  const a=values.filter(Number.isFinite);bins=Math.max(1,Math.floor(bins));if(!a.length)return {edges:[],counts:[]};
  const min=Math.min(...a),max=Math.max(...a),w=(max-min)/bins||1,edges=Array.from({length:bins+1},(_,i)=>min+i*w),counts=new Array(bins).fill(0);
  for(const v of a)counts[Math.min(bins-1,Math.floor((v-min)/w))]++;
  return {edges,counts};
}
export function boxStats(values=[]){
  const q1=percentile(values,25);if(q1===null)return null;
  const a=values.filter(Number.isFinite),q3=percentile(values,75);
  return {min:Math.min(...a),q1,median:percentile(values,50),q3,max:Math.max(...a),iqr:q3-q1};
}
