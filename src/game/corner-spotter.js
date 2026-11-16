(function attachCyberRaceCornerSpotter(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCornerSpotterModule(){
  'use strict';
  const wrap=(value,n)=>((value%n)+n)%n;
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));

  // Precompute bends once per route. samples are the game's equally spaced,
  // arc-length track points, not the original Catmull-Rom control points.
  function createCornerSpotter(samples){
    const n=Array.isArray(samples)?samples.length:0;
    if(n<16||samples.some(p=>!Number.isFinite(p?.x)||!Number.isFinite(p?.z)))return {turns:[],predict:()=>null};
    const distance=[0];
    for(let i=0;i<n;i++){
      const a=samples[i],b=samples[(i+1)%n];
      distance.push(distance[i]+Math.hypot(b.x-a.x,b.z-a.z));
    }
    const total=distance[n],spacing=total/n;
    if(!Number.isFinite(spacing)||spacing<0.01)return {turns:[],predict:()=>null};
    const halfWindow=clamp(Math.round(34/spacing),2,12);
    const signedAngles=Array.from({length:n},(_,i)=>{
      const a=samples[wrap(i-halfWindow,n)],b=samples[i],c=samples[(i+halfWindow)%n];
      const ax=b.x-a.x,az=b.z-a.z,bx=c.x-b.x,bz=c.z-b.z;
      if(Math.hypot(ax,az)<0.01||Math.hypot(bx,bz)<0.01)return 0;
      return Math.atan2(ax*bz-az*bx,ax*bx+az*bz);
    });
    const signs=signedAngles.map(angle=>angle>0.055?1:angle< -0.055?-1:0);
    const raw=[];
    for(let i=0;i<n;i++){
      const sign=signs[i],last=raw.at(-1);
      if(!sign)continue;
      if(last&&last.sign===sign&&i-last.end<=3){last.end=i;last.members.push(i);}
      else raw.push({sign,start:i,end:i,members:[i]});
    }
    // A corner crossing sample 0 is one bend, not two independent alerts.
    if(raw.length>1&&raw[0].sign===raw.at(-1).sign&&raw[0].start+n-raw.at(-1).end<=3){
      const tail=raw.pop();
      raw[0].start=tail.start;
      raw[0].members.unshift(...tail.members);
    }
    const turns=raw.map(group=>{
      // The local chord spans 2*halfWindow sample steps; divide to avoid
      // counting the same curvature repeatedly across adjacent samples.
      const angle=Math.abs(group.members.reduce((sum,i)=>sum+signedAngles[i],0)/(2*halfWindow));
      return {
        start:group.start,end:group.end,
        direction:group.sign<0?'right':'left',
        severity:angle>=0.75?'sharp':angle>=0.46?'medium':'gentle',
        angle
      };
    }).filter(turn=>turn.angle>=0.25);

    function predict({sampleIndex,speed,forward=true,onRoad=true}={}){
      if(!Number.isFinite(sampleIndex)||!Number.isFinite(speed)||speed<8||!forward||!onRoad||!turns.length)return null;
      const index=wrap(Math.round(sampleIndex),n);
      const horizon=clamp(speed*3.8+45,105,260);
      let best=null;
      for(const turn of turns){
        const span=wrap(turn.end-turn.start,n)+1;
        const inside=wrap(index-turn.start,n)<span;
        const ahead=inside?0:wrap(distance[turn.start]-distance[index],total);
        if(ahead>horizon||best&&ahead>=best.distance)continue;
        best={direction:turn.direction,severity:turn.severity,
          distance:ahead,displayDistance:inside?0:Math.max(10,Math.ceil(ahead/10)*10),
          progress:clamp(1-ahead/horizon,0,1),active:inside};
      }
      return best;
    }
    return {turns,predict};
  }
  return {createCornerSpotter};
});
