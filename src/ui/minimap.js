(function attachCyberMinimap(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.ui??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createCyberMinimapModule(){
  'use strict';
  function createMinimap({document,trackPoints,samples,getPlayer,getOpponents}){
    class Minimap{
      constructor(){
        this.canvas=document.createElement('canvas');this.canvas.id='minimap-canvas';this.canvas.width=200;this.canvas.height=200;
        this.ctx=this.canvas.getContext('2d');
        this.canvas.style.cssText='position:fixed; bottom:20px; left:20px; width:140px; height:140px; z-index:20; border-radius:50%; border:2px solid #00f3ff; background:rgba(0,5,15,0.7); box-shadow:0 0 20px rgba(0,243,255,0.3);';
        document.body.appendChild(this.canvas);
        this.minX=Infinity;this.maxX=-Infinity;this.minZ=Infinity;this.maxZ=-Infinity;
        trackPoints.forEach(p=>{this.minX=Math.min(this.minX,p.x);this.maxX=Math.max(this.maxX,p.x);this.minZ=Math.min(this.minZ,p.z);this.maxZ=Math.max(this.maxZ,p.z);});
        const pad=30;this.minX-=pad;this.maxX+=pad;this.minZ-=pad;this.maxZ+=pad;
        this.cachedRoad=document.createElement('canvas');this.cachedRoad.width=200;this.cachedRoad.height=200;
        const c=this.cachedRoad.getContext('2d');c.strokeStyle='rgba(0,243,255,0.25)';c.lineWidth=6;c.beginPath();
        samples.forEach((p,i)=>{const m=this.worldToMap(p.x,p.z);if(i===0)c.moveTo(m.x,m.y);else c.lineTo(m.x,m.y);});
        c.closePath();c.stroke();
      }
      worldToMap(x,z){return{x:(x-this.minX)/(this.maxX-this.minX)*200,y:(1-(z-this.minZ)/(this.maxZ-this.minZ))*200};}
      render(){
        const player=getPlayer(),opponents=getOpponents()||[],ctx=this.ctx;ctx.clearRect(0,0,200,200);ctx.drawImage(this.cachedRoad,0,0);
        opponents.forEach(o=>{if(o.dead)return;const m=this.worldToMap(o.car.group.position.x,o.car.group.position.z);ctx.fillStyle='#ffaa00';ctx.beginPath();ctx.arc(m.x,m.y,3,0,Math.PI*2);ctx.fill();});
        const mp=this.worldToMap(player.pos.x,player.pos.z);ctx.fillStyle='#00ff66';ctx.save();ctx.translate(mp.x,mp.y);ctx.rotate(-player.heading);ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,-4);ctx.lineTo(-4,4);ctx.fill();ctx.restore();
      }
    }
    return new Minimap();
  }
  return {createMinimap};
});
