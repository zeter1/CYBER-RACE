(function attachPlayerDriving(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createPlayerDriving(){
  'use strict';

  // Plain-data simulation; substeps keep handling consistent across frame rates.
  function stepPlayerDriving(state,input,config,dt){
    const duration=Math.max(0,Math.min(dt,0.1));
    const steps=Math.max(1,Math.ceil(duration/(1/120)));
    const step=duration/steps;
    // Accept both old digital inputs and analog pedal pressure (0..1).
    const pedal=value=>value===true?1:value===false?0:Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
    const throttle=pedal(input.throttle),brake=pedal(input.brake);
    const brakingForward=brake&&state.speed>0;
    const handbrake=Boolean(input.handbrake);
    const steering=Math.max(-1,Math.min(1,input.steering||0));
    const maxSpeed=Math.max(1,state.maxSpeed);
    let {speed,speedLat,steerAngle,heading}=state;
    let deltaX=0,deltaZ=0,drifting=false;
    const damp=Math.exp(-config.DRAG*step);
    const forceTime=config.DRAG>0?(1-damp)/config.DRAG:step;
    for(let i=0;i<steps;i++){
      const previousSpeed=speed;
      if(brake>0){
        if(brakingForward)speed=Math.max(0,speed*damp-config.BRAKE*brake*forceTime);
        else if(throttle>0)speed=Math.min(0,speed*damp+config.BRAKE*throttle*forceTime);
        else speed=Math.max(-config.REVERSE_SPEED,speed*damp-config.ACCEL*0.55*brake*forceTime);
      }else if(throttle>0){
        // Expiring boosts remove thrust above the limit, never teleport speed down.
        speed=speed>maxSpeed?Math.max(maxSpeed,speed*damp):
          Math.min(maxSpeed,speed*damp+config.ACCEL*throttle*forceTime);
      }else speed*=damp;
      if(handbrake){
        speed=Math.sign(speed)*Math.max(0,Math.abs(speed)-config.HANDBRAKE_DECEL*step);
      }
      if(!throttle&&!brake&&Math.abs(speed)<0.1)speed=0;

      const ratio=Math.abs(speed)/config.MAX_SPEED;
      const targetSteer=-steering*config.STEER_MAX/(1+config.STEER_SPEED_SENSITIVITY*ratio*ratio);
      steerAngle+=(targetSteer-steerAngle)*(1-Math.exp(-config.STEER_RESPONSE*step));
      const moving=Math.min(1,Math.abs(speed)/8);
      const yaw=steerAngle*(2.2+ratio*2.5)*moving*(speed<0?-0.65:1);
      const nextHeading=heading+yaw*step;
      const midHeading=(heading+nextHeading)/2;
      drifting=handbrake&&speed>15&&Math.abs(steerAngle)>0.08;
      const grip=handbrake?config.DRIFT_GRIP:config.GRIP;
      const lateralDamp=Math.pow(grip,step*60);
      const lateralRate=-Math.log(grip)*60;
      const lateralForce=drifting?-Math.sign(steerAngle)*22:0;
      const previousLat=speedLat;
      speedLat=speedLat*lateralDamp+lateralForce*(lateralRate>0?(1-lateralDamp)/lateralRate:step);
      speedLat=Math.max(-config.MAX_LATERAL_SPEED,Math.min(config.MAX_LATERAL_SPEED,speedLat));
      const forwardSpeed=(previousSpeed+speed)/2,lateralSpeed=(previousLat+speedLat)/2;
      deltaX+=(Math.sin(midHeading)*forwardSpeed+Math.cos(midHeading)*lateralSpeed)*step;
      deltaZ+=(Math.cos(midHeading)*forwardSpeed-Math.sin(midHeading)*lateralSpeed)*step;
      heading=nextHeading;
    }
    return {speed,speedLat,steerAngle,heading,deltaX,deltaZ,drifting};
  }

  return {stepPlayerDriving};
});
