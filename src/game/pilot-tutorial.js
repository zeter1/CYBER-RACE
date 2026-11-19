(function attachPilotTutorial(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  const ns=root.CyberRace??=(Object.create(null));
  Object.assign(ns.game??=(Object.create(null)),api);
})(typeof globalThis!=='undefined'?globalThis:this,function createPilotTutorialModule(){
  'use strict';
  const STEPS=Object.freeze(['drive','gun','nitro']);
  const LABELS=Object.freeze({
    keyboard:{drive:'W / ↑',gun:'ЛКМ',nitro:'ПРОБЕЛ',shield:'Q'},
    touch:{drive:'▲ ГАЗ',gun:'ПУЛИ',nitro:'НИТРО',shield:'ЩИТ'},
    gamepad:{drive:'RT / ↑',gun:'X',nitro:'A',shield:'B'}
  });
  function createPilotTutorial(){
    let enabled=true,stage=-1,completionUntil=-Infinity,shieldUntil=-Infinity,shieldSeen=false;
    const advance=now=>{
      stage++;
      if(stage===STEPS.length){stage=-1;completionUntil=Number.isFinite(now)?now+3:0;return 'completed';}
      return 'advanced';
    };
    return {
      start({enabled:allow=true,done=false,shieldSeen:alreadySeen=false}={}){
        enabled=Boolean(allow);stage=!done&&enabled?0:-1;
        completionUntil=-Infinity;shieldUntil=-Infinity;shieldSeen=Boolean(alreadySeen);
      },
      configure(allow){enabled=Boolean(allow);},
      observeDrive({throttle=0,speed=0}={},now=0){
        if(enabled&&stage===0&&Number.isFinite(throttle)&&throttle>0.1&&
          Number.isFinite(speed)&&speed>=12)return advance(now);
        return null;
      },
      action(action,now=0){
        if(!enabled)return null;
        if(action==='pulse')shieldUntil=-Infinity;
        if((stage===1&&action==='gun')||(stage===2&&action==='nitro'))return advance(now);
        return null;
      },
      noticeThreat({active=false,near=false,canPulse=false,now=0}={}){
        if(!enabled||!active||shieldSeen||!near||!canPulse||!Number.isFinite(now))return false;
        shieldSeen=true;shieldUntil=now+5;return true;
      },
      skip(){
        if(stage<0)return false;
        stage=-1;completionUntil=-Infinity;return true;
      },
      view({active=false,now=0,mode='keyboard',ammo=0,nitro=0}={}){
        if(!enabled||!active||!Number.isFinite(now))return null;
        const labels=LABELS[mode]||LABELS.keyboard;
        if(shieldUntil>now)return {
          kind:'threat',heading:'БОЕВАЯ ПОДСКАЗКА',title:'Ракета на подходе',
          detail:'Защитный импульс перехватывает ближайшие вражеские снаряды.',
          key:labels.shield,skippable:false
        };
        if(stage<0)return completionUntil>now?{
          kind:'complete',heading:'ИНСТРУКТАЖ ПРОЙДЕН',title:'Отличная работа!',
          detail:'Теперь всё зависит от тебя. Удачной гонки!',key:'✓',skippable:false
        }:null;
        const key=STEPS[stage];
        const copy={
          drive:['Начни движение','Набери скорость, удерживая газ.'],
          gun:['Проверь пулемёт',ammo>0?'Сделай один настоящий выстрел.':'Подбери патроны на трассе, чтобы открыть пулемёт.'],
          nitro:['Включи нитро',nitro>0?'Активируй ускорение, когда будешь готов.':'Нужен заряд нитро — подбери бонус на трассе.']
        }[key];
        return {kind:'step',heading:'ИНСТРУКТАЖ · '+(stage+1)+'/3',
          title:copy[0],detail:copy[1],key:labels[key],skippable:true};
      },
      state(){return {enabled,stage,shieldSeen};}
    };
  }
  return {createPilotTutorial};
});
