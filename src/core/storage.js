(()=>{
  'use strict';
  const root=globalThis.CyberRace??=(Object.create(null));
  const core=root.core??=(Object.create(null));
  core.loadObject=function loadObject(key,defaults){
    try{
      const parsed=JSON.parse(localStorage.getItem(key)||'{}');
      return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?{...defaults,...parsed}:{...defaults};
    }catch{
      return {...defaults};
    }
  };
  core.saveObject=function saveObject(key,value){
    try{localStorage.setItem(key,JSON.stringify(value));return true;}
    catch{return false;}
  };
})();
