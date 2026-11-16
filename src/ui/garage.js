(()=>{
 'use strict';
 const root=globalThis.CyberRace;
 root.ui.createGarage=function createGarage({document,getSelection,tuning,onPurchase,onApply,onOpen,onClose}){
  const {CAR_PROFILES,GARAGE_PAINTS,garagePaint,UPGRADES,buildProfile}=root.game;
  const byId=id=>document.getElementById(id),dialog=byId('garage-dialog'),opener=byId('garage-btn'),canvas=byId('garage-car-art'),preview=byId('garage-preview'),context=canvas.getContext('2d');
  const upgradeCards=new Map(),classSpecs=new Map(),crops=new Map(),painted=new Map();let draft,view='front',generation=0,artDataPromise;
  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const descriptions={universal:'Универсальный и сбалансированный.',interceptor:'Лёгкий, быстрый и манёвренный.',armored:'Максимальная защита и выносливость.'};
  for(const profile of Object.values(CAR_PROFILES)){
   const label=make('label','garage-class'),radio=make('input');radio.type='radio';radio.name='garage-class';radio.value=profile.id;radio.setAttribute('aria-label',profile.name+' — '+profile.description);
   radio.addEventListener('change',()=>{draft.classId=profile.id;update();});
   const spec=make('span','garage-class-spec');label.append(radio,make('span','garage-class-description',descriptions[profile.id]),spec);byId('garage-classes').append(label);classSpecs.set(profile.id,spec);
  }
  for(const paint of GARAGE_PAINTS){
   const label=make('label','garage-swatch'),radio=make('input');radio.type='radio';radio.name='garage-paint';radio.value=paint.id;radio.setAttribute('aria-label',paint.name);label.title=paint.name;
   radio.addEventListener('change',()=>{draft.paintId=paint.id;update();});label.append(radio);byId('garage-paints').append(label);
  }
  for(const [type,upgrade] of Object.entries(UPGRADES)){
   const card=make('article','garage-upgrade');card.dataset.upgrade=type;
   const title=make('h3','garage-sr',upgrade.name),levelRow=make('div','garage-upgrade-level'),level=make('span'),pips=make('span','garage-level-pips');pips.setAttribute('aria-hidden','true');for(let i=0;i<3;i++)pips.append(make('i'));levelRow.append(level,pips);
   const effect=make('p','garage-upgrade-effect'),button=make('button');button.type='button';button.dataset.buyUpgrade=type;
   button.addEventListener('click',()=>{const result=tuning.purchase(draft.classId,type);byId('garage-purchase-status').textContent=result.ok?upgrade.name+' · уровень '+result.level+' куплен за '+result.price+' кр.':result.reason==='max'?'Улучшение уже максимально.':'Недостаточно кредитов.';if(result.ok)onPurchase?.();update();});
   card.append(title,levelRow,effect,button);byId('garage-upgrades').append(card);upgradeCards.set(type,{level,pips,effect,button});
  }
  const viewButtons=[...dialog.querySelectorAll('[data-garage-view]')];
  for(const button of viewButtons)button.addEventListener('click',()=>{view=button.dataset.garageView;for(const item of viewButtons)item.setAttribute('aria-pressed',String(item===button));renderPreview();});
  function loadData(){
   if(root.ui.garageArtData)return Promise.resolve(root.ui.garageArtData);
   if(!artDataPromise)artDataPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='assets/garage/cars.js';
    script.onload=()=>{if(root.ui.garageArtData)resolve(root.ui.garageArtData);else{script.remove();reject(Error('Missing garage art'));}};
    script.onerror=()=>{script.remove();reject(Error('Garage art unavailable'));};
    document.head.append(script);
   }).catch(error=>{artDataPromise=null;throw error;});
   return artDataPromise;
  }
  function loadCrops(classId){
   if(crops.has(classId))return crops.get(classId);
   const pending=loadData().then(data=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{
     try{
      const cells=[];
      for(let index=0;index<3;index++){
       const left=Math.round(index*image.width/3),right=Math.round((index+1)*image.width/3),width=right-left,height=image.height;
       const cell=document.createElement('canvas');cell.width=width;cell.height=height;const ctx=cell.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,left,0,width,height,0,0,width,height);
       const pixels=ctx.getImageData(0,0,width,height);let minX=width,minY=height,maxX=0,maxY=0;
       for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels.data[(y*width+x)*4+3]>24){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
       if(minX>maxX)throw Error('Empty car view');
       const cropped=document.createElement('canvas');cropped.width=maxX-minX+1;cropped.height=maxY-minY+1;cropped.getContext('2d').drawImage(cell,minX,minY,cropped.width,cropped.height,0,0,cropped.width,cropped.height);cells.push(cropped);
      }
      resolve(cells);
     }catch(error){reject(error);}
    };image.onerror=()=>reject(Error('Car image unavailable'));image.src=data[classId];
   })).catch(error=>{crops.delete(classId);throw error;});
   crops.set(classId,pending);return pending;
  }
  function hsl(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,l=(max+min)/2;let h=0,s=0;if(delta){s=delta/(1-Math.abs(2*l-1));h=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;h=(h*60+360)%360;}return [h,s,l];}
  function rgb(h,s,l){const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;const values=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return values.map(v=>Math.round((v+m)*255));}
  function paintCrop(source,classId,paintId,index){
   const key=classId+':'+paintId+':'+index;if(painted.has(key))return painted.get(key);
   const output=document.createElement('canvas');output.width=source.width;output.height=source.height;const ctx=output.getContext('2d');ctx.drawImage(source,0,0);
   if(paintId!=='violet'){
    const value=garagePaint(paintId).color,[targetH,targetS,targetL]=hsl((value>>16)&255,(value>>8)&255,value&255),pixels=ctx.getImageData(0,0,output.width,output.height),p=pixels.data;
    // Only purple body pixels are recolored. Neutral wheels/glass, cyan lights,
    // amber details and transparent surroundings retain their source pixels.
    for(let i=0;i<p.length;i+=4){if(!p[i+3]||Math.max(p[i],p[i+1],p[i+2])-Math.min(p[i],p[i+1],p[i+2])<12)continue;const [h,s,l]=hsl(p[i],p[i+1],p[i+2]);if(h<235||h>325||s<.12||l<.055)continue;
     const weight=Math.min(1,(s-.12)/.15)*Math.min(1,(h-235)/12,(325-h)/12);
     const light=Math.max(0,Math.min(1,l<=.46?l*targetL/.46:targetL+(1-targetL)*(l-.46)/.54)),[r,g,b]=rgb(targetH,targetS,light);
     p[i]=Math.round(p[i]+(r-p[i])*weight);p[i+1]=Math.round(p[i+1]+(g-p[i+1])*weight);p[i+2]=Math.round(p[i+2]+(b-p[i+2])*weight);
    }ctx.putImageData(pixels,0,0);
   }
   painted.set(key,output);if(painted.size>12)painted.delete(painted.keys().next().value);return output;
  }
  async function renderPreview(){
   if(!dialog.open||!draft)return;const token=++generation,{classId,paintId}=draft,index={front:0,side:1,rear:2}[view];byId('garage-art-status').textContent='';
   try{
    const sources=await loadCrops(classId);if(token!==generation||!dialog.open)return;const source=paintCrop(sources[index],classId,paintId,index),ratio=Math.min(devicePixelRatio||1,1.5),width=Math.max(1,Math.round(preview.clientWidth*ratio)),height=Math.max(1,Math.round(preview.clientHeight*ratio));
    canvas.width=width;canvas.height=height;const scale=Math.min(width*.82/source.width,height*.82/source.height),w=source.width*scale,h=source.height*scale;
    context.clearRect(0,0,width,height);context.drawImage(source,(width-w)/2,height*.97-h,w,h);preview.setAttribute('aria-label',CAR_PROFILES[classId].name+', '+garagePaint(paintId).name+', вид '+{front:'спереди',side:'сбоку',rear:'сзади'}[view]);preview.dataset.ready='true';preview.dataset.classId=classId;preview.dataset.paintId=paintId;preview.dataset.view=view;
   }catch{if(token!==generation||!dialog.open)return;context.clearRect(0,0,canvas.width,canvas.height);preview.dataset.ready='false';byId('garage-art-status').textContent='Изображение недоступно. Выбор машины, цвета и покупки работают.';}
  }
  function update(){
   const build=tuning.getBuild(draft.classId),profile=buildProfile(build),levels=build.levels,balance=tuning.snapshot().wallet;
   byId('garage-credits').textContent=balance+' кр.';byId('garage-storage-note').textContent=tuning.canPersist()?'':'Сохранение недоступно: покупки и кредиты останутся только в этой вкладке.';
   for(const [type,upgrade] of Object.entries(UPGRADES)){
    const level=levels[type],price=upgrade.prices[level],card=upgradeCards.get(type),next=level<3?buildProfile({classId:draft.classId,levels:{...levels,[type]:level+1}}):null;
    card.level.textContent='Уровень: '+level+' / 3';[...card.pips.children].forEach((pip,i)=>pip.classList.toggle('filled',i<level));
    if(type==='engine')card.effect.textContent='Скорость '+Math.round(profile.driving.MAX_SPEED*3.6)+(next?' → '+Math.round(next.driving.MAX_SPEED*3.6):'')+' км/ч\nРазгон +'+level*7+(next?' → +'+(level+1)*7:'')+'%';
    if(type==='tires')card.effect.textContent='Отклик +'+(level*5.5).toFixed(1)+(next?' → +'+((level+1)*5.5).toFixed(1):'')+'%\nЛучше сцепление';
    if(type==='armor')card.effect.textContent='Прочность '+profile.maxHealth+(next?' → '+next.maxHealth:'')+' HP';
    card.button.disabled=level===3||balance<price;card.button.replaceChildren();const label=level===3?'МАКСИМУМ':balance<price?'НЕ ХВАТАЕТ '+(price-balance)+' кр.':'Купить сразу · ';
    card.button.append(document.createTextNode(label));if(level<3&&balance>=price)card.button.append(make('strong','',price+' кр.'));card.button.setAttribute('aria-label',upgrade.name+': '+card.button.textContent);
   }
   byId('garage-classes').querySelectorAll('input').forEach(el=>{el.checked=el.value===draft.classId;});byId('garage-paints').querySelectorAll('input').forEach(el=>{el.checked=el.value===draft.paintId;});
   for(const [id,spec] of classSpecs){const p=buildProfile(tuning.getBuild(id));spec.textContent=Math.round(p.driving.MAX_SPEED*3.6)+' км/ч · '+p.maxHealth+' HP';}
   byId('garage-model-name').textContent=profile.name;byId('garage-model-code').textContent=profile.tag;byId('garage-paint-name').textContent=garagePaint(draft.paintId).name;byId('garage-build-preview').textContent='Двигатель '+levels.engine+' · Шины '+levels.tires+' · Броня '+levels.armor;
   const selected=getSelection(),dirty=selected.classId!==draft.classId||selected.paintId!==draft.paintId;byId('garage-selection-status').textContent=dirty?'Выбор изменён':'Выбор не изменён';byId('garage-selection-status').dataset.dirty=String(dirty);
   const stock=CAR_PROFILES.universal.driving,accel=(levels.engine?'+'+levels.engine*7+'% · ':'')+(profile.driving.ACCEL>stock.ACCEL?'Быстрый':profile.driving.ACCEL<stock.ACCEL?'Плавный':'Средний'),handling=(levels.tires?'+'+(levels.tires*5.5).toFixed(1)+'% · ':'')+(profile.driving.STEER_MAX>stock.STEER_MAX?'Острая':profile.driving.STEER_MAX<stock.STEER_MAX?'Тяжёлая':'Средняя');
   const stats=byId('garage-stats');stats.replaceChildren();for(const [name,value,max,text] of [['Скорость',profile.driving.MAX_SPEED*3.6,58*1.09*3.6,Math.round(profile.driving.MAX_SPEED*3.6)+' км/ч'],['Разгон',profile.driving.ACCEL,42*1.21,accel],['Прочность',profile.maxHealth,203,profile.maxHealth+' HP'],['Управляемость',profile.driving.STEER_MAX,.66,handling]]){const row=make('div'),meter=make('meter');meter.min=0;meter.max=max;meter.value=value;meter.setAttribute('aria-label',name);meter.setAttribute('aria-valuetext',text);row.append(make('dt','garage-sr',name),make('dd','',text),meter);stats.append(row);}fitText();renderPreview();
  }
  function fitText(){
   if(!dialog.open)return;
   for(const el of dialog.querySelectorAll('#garage-credits,#garage-model-name,#garage-stats dd,.garage-upgrade button')){
    el.style.fontSize='';const size=parseFloat(getComputedStyle(el).fontSize),ratio=Math.min(1,el.clientWidth/Math.max(1,el.scrollWidth),el.clientHeight/Math.max(1,el.scrollHeight));
    if(ratio<1)el.style.fontSize=(size*ratio*.97)+'px';
   }
  }
  function close(){dialog.close();}
  opener.addEventListener('click',()=>{if(opener.disabled||dialog.open)return;draft={...getSelection()};byId('garage-purchase-status').textContent='';onOpen();dialog.showModal();dialog.querySelector('.garage-viewport').scrollLeft=0;update();byId('garage-classes').querySelector('input:checked')?.focus({preventScroll:true});});
  byId('garage-close').addEventListener('click',close);byId('garage-cancel').addEventListener('click',close);byId('garage-apply').addEventListener('click',()=>{onApply({...draft});close();});
  dialog.addEventListener('close',()=>{generation++;onClose();opener.focus({preventScroll:true});});dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();return;}if(event.key!=='Tab')return;const controls=[...dialog.querySelectorAll('button,input:checked')].filter(el=>!el.disabled&&el.getClientRects().length),first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}});
  for(const type of ['pointerdown','mousedown','mouseup','click','touchstart','touchend'])dialog.addEventListener(type,event=>event.stopPropagation());new ResizeObserver(()=>{fitText();renderPreview();}).observe(preview);
  return {isOpen:()=>dialog.open,refreshFromStorage(){
   if(!dialog.open)return;
   byId('garage-purchase-status').textContent='Баланс и улучшения обновлены из другой вкладки.';
   update();
  }};
 };
})();
