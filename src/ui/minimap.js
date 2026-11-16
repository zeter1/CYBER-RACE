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
        this.canvas=document.createElement('canvas');this.canvas.id='minimap-canvas';this.canvas.width=400;this.canvas.height=400;
        this.ctx=this.canvas.getContext('2d');
        this.canvas.setAttribute('aria-label','Мини-карта трассы и соперников');
        document.body.appendChild(this.canvas);
        this.minX=Infinity;this.maxX=-Infinity;this.minZ=Infinity;this.maxZ=-Infinity;
        samples.forEach(p=>{this.minX=Math.min(this.minX,p.x);this.maxX=Math.max(this.maxX,p.x);this.minZ=Math.min(this.minZ,p.z);this.maxZ=Math.max(this.maxZ,p.z);});
        const pad=30;this.minX-=pad;this.maxX+=pad;this.minZ-=pad;this.maxZ+=pad;
        this.cachedRoad=document.createElement('canvas');this.cachedRoad.width=400;this.cachedRoad.height=400;
        const c=this.cachedRoad.getContext('2d');c.scale(2,2);c.strokeStyle='#8195a6';c.lineWidth=5;c.lineJoin='round';c.beginPath();
        samples.forEach((p,i)=>{const m=this.worldToMap(p.x,p.z);if(i===0)c.moveTo(m.x,m.y);else c.lineTo(m.x,m.y);});
        c.closePath();c.stroke();
        const finish=this.worldToMap(samples[0].x,samples[0].z);
        for(let row=0;row<3;row++)for(let col=0;col<3;col++){
          c.fillStyle=(row+col)%2?'#15202d':'#f4f8fc';
          c.fillRect(finish.x-4.5+col*3,finish.y-4.5+row*3,3,3);
        }
        c.fillStyle='#dbe5ef';c.font='bold 9px sans-serif';c.textAlign='center';c.fillText('N',100,14);
      }
      worldToMap(x,z){
        const span=Math.max(this.maxX-this.minX,this.maxZ-this.minZ,1);
        return {x:100+(x-(this.minX+this.maxX)/2)/span*126,y:100-(z-(this.minZ+this.maxZ)/2)/span*126};
      }
      render(){
        const player=getPlayer(),opponents=getOpponents()||[],ctx=this.ctx;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,400,400);ctx.drawImage(this.cachedRoad,0,0);ctx.scale(2,2);
        opponents.forEach(o=>{if(o.dead)return;const m=this.worldToMap(o.car.group.position.x,o.car.group.position.z);ctx.fillStyle='#f5e633';ctx.beginPath();ctx.arc(m.x,m.y,3.3,0,Math.PI*2);ctx.fill();});
        const mp=this.worldToMap(player.pos.x,player.pos.z);ctx.fillStyle='#56dff2';ctx.strokeStyle='#f6f9fc';ctx.lineWidth=1.3;ctx.save();ctx.translate(mp.x,mp.y);ctx.rotate(player.heading-Math.PI/2);ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(-5,-4.5);ctx.lineTo(-3,0);ctx.lineTo(-5,4.5);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      }
    }
    return new Minimap();
  }
  return {createMinimap};
});
