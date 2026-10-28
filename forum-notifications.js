(() => {
 'use strict';
 const host=document.querySelector('.header-actions');if(!host)return;
 let generation=0,identity=null,timer,paused=false;
 const link=document.createElement('a');link.href='forums.html#notifications=1';link.className='forum-notification-link';link.hidden=true;
 const bell=document.createElement('span');bell.className='forum-notification-bell';
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
 const shape=document.createElementNS(icon.namespaceURI,'path');shape.setAttribute('d','M18 8a6 6 0 0 0-12 0c0 6-2.5 6.5-2.5 8.5h17C20.5 14.5 18 14 18 8ZM10 20a2.2 2.2 0 0 0 4 0M12 2V1');icon.append(shape);bell.append(icon);
 const label=document.createElement('span');label.className='forum-notification-label';label.textContent='Notifications';
 const count=document.createElement('span');count.className='forum-notification-count';count.hidden=true;count.setAttribute('aria-hidden','true');
 link.append(bell,label,count);host.prepend(link);
 function currentView(){if(location.pathname.endsWith('/forums.html')&&new URLSearchParams(location.hash.slice(1)).has('notifications'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
 function describe(unread){const text=unread===null?'Notifications':unread?`${unread} unread notification${unread===1?'':'s'}`:'Notifications — all caught up';link.setAttribute('aria-label',text);link.title=text;}
 function schedule(){clearTimeout(timer);if(!paused&&!document.hidden&&globalThis.DexhavenAccount?.getUser())timer=setTimeout(refresh,60000);}
 async function refresh(){
  const user=globalThis.DexhavenAccount?.getUser();if(!user){link.hidden=true;clearTimeout(timer);return;}
  const current=++generation,id=user.id;link.hidden=false;currentView();
  try{const data=await DexhavenAccount.request('/notifications');if(current!==generation||DexhavenAccount.getUser()?.id!==id)return;const unread=Math.max(0,Number(data.unread)||0);count.hidden=!unread;count.textContent=unread>99?'99+':String(unread);link.dataset.unread=String(unread>0);describe(unread);}
  catch{if(current===generation&&DexhavenAccount.getUser()?.id===id){link.setAttribute('aria-label','Notifications — unread count unavailable');link.title='Open notifications. The unread count could not refresh.';}}
  finally{if(current===generation)schedule();}
 }
 function session(){const id=globalThis.DexhavenAccount?.getUser()?.id||null;if(identity!==id){identity=id;generation++;link.hidden=!id;count.hidden=true;count.textContent='';link.dataset.unread='false';describe(null);clearTimeout(timer);if(id)refresh();}}
 describe(null);currentView();
 addEventListener('dexhaven:session',e=>{if(e.detail.ready)session();});addEventListener('dexhaven:notifications',refresh);addEventListener('hashchange',currentView);
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden&&!paused)refresh();});
 addEventListener('pagehide',()=>{paused=true;generation++;clearTimeout(timer);});addEventListener('pageshow',()=>{paused=false;if(globalThis.DexhavenAccount?.isReady())refresh();});
 if(globalThis.DexhavenAccount?.isReady())session();
})();
