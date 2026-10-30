(() => {
 'use strict';
 const host=document.querySelector('.header-actions');if(!host)return;
 let generation=0,identity=null,timer,paused=false,items=[],next=null,loading=false;
 function el(tag,className,text){const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;}
 const dropdown=el('div','forum-notification-dropdown');dropdown.hidden=true;
 const trigger=el('button','forum-notification-link');trigger.type='button';
 trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','notification-dropdown');
 const bell=el('span','forum-notification-bell');
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
 const shape=document.createElementNS(icon.namespaceURI,'path');shape.setAttribute('d','M18 8a6 6 0 0 0-12 0c0 6-2.5 6.5-2.5 8.5h17C20.5 14.5 18 14 18 8ZM10 20a2.2 2.2 0 0 0 4 0M12 2V1');icon.append(shape);bell.append(icon);
 const label=el('span','forum-notification-label','Notifications');
 const count=el('span','forum-notification-count');count.hidden=true;count.setAttribute('aria-hidden','true');
 trigger.append(bell,label,count);
 const panel=el('section','forum-notification-panel');panel.id='notification-dropdown';panel.hidden=true;panel.setAttribute('aria-labelledby','notification-heading');
 const heading=el('h2','','Notifications');heading.id='notification-heading';
 const list=el('div','forum-notification-list');
 const status=el('p','forum-notification-status');status.setAttribute('role','status');
 const more=el('button','text-button','Show older notifications');more.type='button';more.hidden=true;
 const retry=el('button','text-button','Try again');retry.type='button';retry.hidden=true;
 panel.append(heading,list,status,retry,more);dropdown.append(trigger,panel);host.prepend(dropdown);
 function close(restoreFocus=false){panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(restoreFocus)trigger.focus();}
 function describe(unread){const text=unread===null?'Notifications':unread?`${unread} unread notification${unread===1?'':'s'}`:'Notifications — all caught up';trigger.setAttribute('aria-label',text);trigger.title=text;}
 function badge(unread){unread=Math.max(0,Number(unread)||0);count.hidden=!unread;count.textContent=unread>99?'99+':String(unread);trigger.dataset.unread=String(unread>0);describe(unread);}
 function schedule(){clearTimeout(timer);if(!paused&&!document.hidden&&globalThis.DexhavenAccount?.getUser())timer=setTimeout(refresh,60000);}
 function render(){
  list.replaceChildren();
  for(const n of items){
   const row=el('article','forum-notification-item');row.dataset.unread=String(!n.read);
   const kinds={mention:'You were mentioned',moderation:'Moderation update',follower:'New follower',announcement:'Announcement',watched:'Watched discussion'};
   row.append(el('p','forum-notification-kind',kinds[n.kind]||'New reply'));
   const target=n.threadId?`forums.html#thread=${encodeURIComponent(n.threadId)}${n.postId?'&post='+encodeURIComponent(n.postId):''}`:n.memberUsername?'forums.html#member='+encodeURIComponent(n.memberUsername):null;
   const title=el(target?'a':'p','forum-notification-title',n.title);if(target)title.href=target;row.append(title);
   const date=new Date(n.createdAt);if(!Number.isNaN(date.getTime())){const time=el('time','forum-notification-time',date.toLocaleString());time.dateTime=date.toISOString();row.append(time);}
   if(!n.read){
    const read=el('button','text-button','Mark as read');read.type='button';
    read.addEventListener('click',async()=>{
     const id=identity;read.disabled=true;
     try{await DexhavenAccount.request(`/notifications/${encodeURIComponent(n.id)}/read`,{method:'PUT'});if(identity!==id)return;n.read=true;row.dataset.unread='false';read.remove();(row.querySelector('a')||trigger).focus();globalThis.dispatchEvent(new Event('dexhaven:notifications'));}
     catch{if(identity===id){status.textContent='Could not mark this notification as read. Please try again.';read.disabled=false;}}
    });row.append(read);
   }
   list.append(row);
  }
  status.textContent=items.length?'':'You are all caught up. Follow a discussion to hear what happens next.';
  more.hidden=!next;retry.hidden=true;
 }
 async function refresh(page=1){
  // Event listeners pass an Event rather than a page number.
  if(typeof page!=='number')page=1;
  const user=globalThis.DexhavenAccount?.getUser();if(!user){dropdown.hidden=true;close();clearTimeout(timer);return;}
  const current=++generation,id=user.id;dropdown.hidden=false;loading=true;more.disabled=true;retry.hidden=true;
  if(!items.length)status.textContent='Loading notifications…';
  panel.setAttribute('aria-busy','true');
  try{
   const data=await DexhavenAccount.request('/notifications'+(page>1?'?page='+page:''));
   if(current!==generation||DexhavenAccount.getUser()?.id!==id)return;
   badge(data.unread);items=page>1?[...items,...data.items.filter(n=>!items.some(item=>item.id===n.id))]:data.items;next=data.next;
   // Keep keyboard focus stable during background count updates.
   if(page>1||!panel.contains(document.activeElement))render();
  }
  catch{if(current===generation&&DexhavenAccount.getUser()?.id===id){status.textContent='Notifications could not load. Please try again.';retry.hidden=false;trigger.title='Notifications could not refresh.';}}
  finally{if(current===generation){loading=false;more.disabled=false;panel.setAttribute('aria-busy','false');schedule();}}
 }
 trigger.addEventListener('click',()=>{if(!panel.hidden){close();return;}panel.hidden=false;trigger.setAttribute('aria-expanded','true');if(items.length)render();if(!loading)refresh();});
 more.addEventListener('click',()=>{if(next&&!loading)refresh(next);});retry.addEventListener('click',()=>refresh());
 document.addEventListener('click',event=>{if(!dropdown.contains(event.target))close();});
 dropdown.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopPropagation();close(true);}});
 dropdown.addEventListener('focusout',()=>{setTimeout(()=>{if(!dropdown.contains(document.activeElement))close();},0);});
 panel.addEventListener('click',event=>{if(event.target.closest('a'))close();});
 function session(){const id=globalThis.DexhavenAccount?.getUser()?.id||null;if(identity!==id){identity=id;generation++;close();dropdown.hidden=!id;count.hidden=true;count.textContent='';trigger.dataset.unread='false';items=[];next=null;loading=false;list.replaceChildren();status.textContent='';more.hidden=true;retry.hidden=true;describe(null);clearTimeout(timer);if(id)refresh();}}
 describe(null);
 addEventListener('dexhaven:session',e=>{if(e.detail.ready)session();});addEventListener('dexhaven:notifications',refresh);
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden&&!paused)refresh();});
 addEventListener('pagehide',()=>{paused=true;generation++;loading=false;clearTimeout(timer);close();});addEventListener('pageshow',()=>{paused=false;if(globalThis.DexhavenAccount?.isReady())refresh();});
 if(globalThis.DexhavenAccount?.isReady())session();
})();
