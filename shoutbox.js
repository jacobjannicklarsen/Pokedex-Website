(() => {
 'use strict';const root=document.querySelector('#shoutbox');if(!root)return;
 const el=element,request=(p,o)=>DexhavenAccount.request('/shoutbox'+p,o);
 let messages=new Map(),next=null,timer,loading=false,identity,revision=0,posting=false,historyMode=false,queued=false,paused=false;
 const status=el('p','form-help'),history=el('div','shoutbox-history'),older=el('button','text-button','Older messages'),form=el('form','shoutbox-form'),label=el('label','','Your message'),input=el('textarea'),counter=el('span','form-help','0 / 500'),send=el('button','action-button','Send'),guest=el('p','shoutbox-guest'),retry=el('button','text-button','Retry');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');history.setAttribute('aria-label','Recent Shoutbox messages');history.tabIndex=0;input.maxLength=500;input.rows=2;input.required=true;input.name='message';label.append(input);send.type='submit';older.type=retry.type='button';retry.hidden=true;retry.onclick=()=>load();input.oninput=()=>{counter.textContent=input.value.length+' / 500';};
 for(const [text,id]of [['Log in','account-button'],['Create an account','register-button']]){const b=el('button','text-button',text);b.type='button';b.onclick=()=>document.getElementById(id).click();guest.append(b);}
 form.append(label,counter,send);root.append(status,retry,older,history,guest,form);
 input.title='Enter to send. Shift+Enter for a new line.';
 input.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.keyCode===229)return;e.preventDefault();if(!posting&&!e.repeat)form.requestSubmit(send);});
 const newest=el('button','text-button','Latest messages');newest.type='button';newest.hidden=true;older.after(newest);newest.onclick=()=>{historyMode=false;messages.clear();next=null;load();};
 function account(){const user=DexhavenAccount.getUser();form.hidden=!user;guest.hidden=Boolean(user);guest.firstChild?.setAttribute('aria-label','Log in to post a Shoutbox message');}
 function render(){
  const atBottom=history.scrollHeight-history.scrollTop-history.clientHeight<50,oldTop=history.scrollTop,oldHeight=history.scrollHeight;history.replaceChildren();
  if(!messages.size)history.append(el('p','form-help','A fresh conversation. Say hello to the community.'));
  for(const m of [...messages.values()].sort((a,b)=>a.id-b.id)){
   const row=el('article','shoutbox-message');row.dataset.messageId=m.id;
   const avatar=el(m.author.avatarUrl?'img':'span','shoutbox-avatar',m.author.avatarUrl?undefined:m.author.username[0]);if(m.author.avatarUrl){avatar.src=m.author.avatarUrl;avatar.alt='';avatar.loading='lazy';}else avatar.setAttribute('aria-hidden','true');
   const copy=el('div','shoutbox-copy'),meta=el('div','shoutbox-meta'),name=el(m.author.profileAvailable?'a':'strong','',m.author.username);if(m.author.profileAvailable)name.href='trainer/'+encodeURIComponent(m.author.username);TrainerNames.decorate(name,m.author.staffRole);const time=el('time','',new Date(m.createdAt).toLocaleString());time.dateTime=m.createdAt;meta.append(name,time);copy.append(meta,el('p','shoutbox-text',m.message));
   if(m.canRemove){const b=el('button','text-button shoutbox-remove','Remove');b.type='button';b.onclick=()=>moderate(m);copy.append(b);}row.append(avatar,copy);history.append(row);
  }
  history.scrollTop=atBottom?history.scrollHeight:oldTop+history.scrollHeight-oldHeight;older.hidden=!next;newest.hidden=!historyMode;
 }
 async function moderate(m){
  const dialog=el('dialog','shoutbox-confirm'),f=el('form','account-form'),h=el('h2','','Remove this message?'),label=el('label','','Moderation reason'),reason=el('textarea'),error=el('p','form-error'),yes=el('button','action-button','Remove message'),cancel=el('button','text-button','Cancel');dialog.setAttribute('aria-labelledby','shoutbox-confirm-title');h.id='shoutbox-confirm-title';reason.required=true;reason.minLength=5;reason.maxLength=300;label.append(reason);yes.type='submit';cancel.type='button';cancel.onclick=()=>dialog.close();f.append(h,el('p','form-help',m.message),label,error,yes,cancel);dialog.append(f);document.body.append(dialog);dialog.onclose=()=>dialog.remove();f.onsubmit=async e=>{e.preventDefault();yes.disabled=true;cancel.disabled=true;try{await request('/messages/'+m.id,{method:'DELETE',body:{reason:reason.value}});messages.delete(m.id);render();status.textContent='Message removed and moderation recorded.';dialog.close();}catch(e){error.textContent=e.message;}finally{yes.disabled=cancel.disabled=false;}};dialog.showModal();reason.focus();
 }
 async function load(before){
  if(loading){queued=before||true;return;}if(document.hidden||paused)return;loading=true;older.disabled=true;const initial=messages.size===0,token=revision;retry.hidden=true;if(before)historyMode=true;
  if(!messages.size)status.textContent='Loading community messages…';
  try{const q=new URLSearchParams();if(before)q.set('before',before);if(messages.size)q.set('ids',[...messages.keys()].join(','));const data=await request('/messages?'+q);if(token!==revision)return;data.items.forEach(m=>messages.set(m.id,m));data.deletedIds.forEach(id=>messages.delete(id));if(before||initial)next=data.next;while(messages.size>200)messages.delete([...messages.keys()].sort((a,b)=>historyMode?b-a:a-b)[0]);render();status.textContent=historyMode?'Viewing older messages. Choose Latest messages to return to the live conversation.':'Messages are public. Updated '+new Date().toLocaleTimeString();}
  catch(e){if(token!==revision)return;status.textContent=e.status===404?'The Shoutbox is unavailable in this preview.':e.status===503?'The Shoutbox is temporarily unavailable. Please try again later.':e.message;retry.hidden=false;}
  finally{loading=false;older.disabled=false;schedule();if(queued){const pending=queued;queued=false;load(pending===true?undefined:pending);}}
 }
 function schedule(){clearTimeout(timer);if(!document.hidden&&!paused)timer=setTimeout(()=>load(),10000);}
 older.onclick=()=>load(next);
 form.onsubmit=async e=>{e.preventDefault();if(posting)return;posting=true;send.disabled=true;const text=input.value;try{await request('/messages',{method:'POST',body:{message:text}});if(input.value===text){input.value='';input.oninput();}if(historyMode){historyMode=false;messages.clear();next=null;}status.textContent='Message sent.';await load();}catch(e){status.textContent=e.message;}finally{posting=false;send.disabled=false;}};
 addEventListener('dexhaven:session',e=>{if(!e.detail.ready)return;const key=e.detail.user?e.detail.user.id+':'+e.detail.user.staff?.roleVersion:'guest';account();if(key!==identity){identity=key;revision++;historyMode=false;messages.clear();next=null;history.replaceChildren();clearTimeout(timer);load();}});
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)load();});
 addEventListener('dexhaven:session-error',()=>{status.textContent='Community messages are unavailable. Open the local installation or try again.';retry.hidden=false;schedule();});
 addEventListener('pagehide',()=>{paused=true;clearTimeout(timer);revision++;});addEventListener('pageshow',()=>{paused=false;if(DexhavenAccount.isReady())load();});
 account();if(DexhavenAccount.isReady())load();
})();
