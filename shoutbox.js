(() => {
 'use strict';
 const root=document.querySelector('#shoutbox');if(!root)return;
 const el=element,request=(path,options)=>DexhavenAccount.request('/shoutbox'+path,options);
 let messages=new Map(),next=null,timer,loading=false,identity,revision=0,posting=false,historyMode=false,queued=false,paused=false,renderedNewest=null,scrollAfterSend=false,cooldownUntil=0,cooldownTimer;
 const unseen=new Set();
 const toolbar=el('div','shoutbox-toolbar'),channel=el('div','shoutbox-channel'),channelName=el('span','shoutbox-channel-name','General'),messageCount=el('span','shoutbox-channel-count');
 const older=el('button','text-button shoutbox-older','Older messages'),newest=el('button','text-button shoutbox-latest','Latest messages');older.type=newest.type='button';older.hidden=newest.hidden=true;channel.append(channelName,messageCount);toolbar.append(channel,older,newest);
 const feedback=el('div','shoutbox-feedback'),status=el('p','shoutbox-status'),retry=el('button','text-button shoutbox-retry','Try again');status.setAttribute('role','status');status.setAttribute('aria-live','polite');retry.type='button';retry.hidden=true;feedback.append(status,retry);
 const conversation=el('div','shoutbox-conversation'),history=el('div','shoutbox-history'),list=el('div','shoutbox-messages'),jump=el('button','shoutbox-jump','Jump to latest');history.setAttribute('aria-label','Recent Shoutbox messages');history.tabIndex=0;jump.type='button';jump.hidden=true;history.append(list);conversation.append(history,jump);
 const form=el('form','shoutbox-form'),label=el('label','shoutbox-input-label'),input=el('textarea'),send=el('button','action-button shoutbox-send','Send'),footer=el('div','shoutbox-composer-footer'),hint=el('span','shoutbox-input-hint','Enter to send \u00b7 Shift+Enter for a new line'),counter=el('span','shoutbox-counter','0 / 500');
 hint.id='shoutbox-input-hint';counter.id='shoutbox-counter';label.append(el('span','shoutbox-label-text','Your message'),input);input.name='message';input.rows=2;input.maxLength=500;input.required=true;input.placeholder='Message #general\u2026';input.setAttribute('aria-describedby','shoutbox-input-hint shoutbox-counter');input.title='Enter to send. Shift+Enter for a new line.';send.type='submit';send.disabled=true;footer.append(hint,counter);form.append(label,send,footer);
 const guest=el('div','shoutbox-guest');guest.append(el('p','','Join the conversation.'));
 for(const [text,id]of [['Log in','account-button'],['Create an account','register-button']]){const button=el('button','text-button',text);button.type='button';button.onclick=()=>document.getElementById(id)?.click();guest.append(button);}
 root.dataset.memberPreview='off';root.append(toolbar,feedback,conversation,guest,form);
 function updateSendState(){const remaining=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));send.disabled=posting||remaining>0||!input.value.trim();if(!posting)send.textContent=remaining?'Wait '+remaining+'s':'Send';hint.textContent=remaining?'A short pause after 4 messages in 10 seconds.':'Enter to send \u00b7 Shift+Enter for a new line';}
 function updateComposer(){counter.textContent=input.value.length+' / 500';counter.dataset.nearLimit=String(input.value.length>=450);updateSendState();input.style.height='auto';input.style.height=Math.min(144,Math.max(54,input.scrollHeight))+'px';}
 input.oninput=updateComposer;
 input.addEventListener('keydown',event=>{if(event.key!=='Enter'||event.shiftKey||event.isComposing||event.keyCode===229)return;event.preventDefault();if(!send.disabled&&!posting&&!event.repeat&&input.value.trim())form.requestSubmit(send);});
 function setCooldown(seconds){clearTimeout(cooldownTimer);cooldownUntil=Date.now()+Math.max(0,Number(seconds)||0)*1000;const tick=()=>{updateSendState();if(cooldownUntil>Date.now())cooldownTimer=setTimeout(tick,250);};tick();}
 function account(){const user=DexhavenAccount.getUser();root.hidden=!user;form.hidden=!user;guest.hidden=Boolean(user);if(user)updateComposer();}
 function atBottom(){return history.scrollHeight-history.scrollTop-history.clientHeight<40;}
 function syncJump(){const bottom=atBottom();if(bottom)unseen.clear();jump.hidden=bottom||historyMode;jump.textContent=unseen.size?unseen.size+' new message'+(unseen.size===1?'':'s')+' \u00b7 Jump to latest':'Jump to latest';}
 history.addEventListener('scroll',syncJump,{passive:true});
 jump.onclick=()=>{unseen.clear();history.scrollTo({top:history.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});};
 function render({prepend=false,forceBottom=false}={}){
  const bottom=atBottom(),oldTop=history.scrollTop,viewportTop=history.getBoundingClientRect().top;
  const anchor=[...list.children].find(row=>row.getBoundingClientRect().bottom>viewportTop),anchorId=anchor?.dataset.messageId,anchorTop=anchor?.getBoundingClientRect().top;
  const focused=document.activeElement,focusRow=list.contains(focused)?focused.closest('[data-message-id]'):null,focusId=focusRow?.dataset.messageId,focusSelector=focused?.classList.contains('shoutbox-remove')?'.shoutbox-remove':'.shoutbox-username';
  const sorted=[...messages.values()].sort((a,b)=>a.id-b.id);
  if(!prepend&&!forceBottom&&!bottom&&renderedNewest!==null)for(const m of sorted)if(m.id>renderedNewest)unseen.add(m.id);
  list.replaceChildren();
  if(!sorted.length){const empty=el('div','shoutbox-empty');empty.append(el('strong','','Start something good.'),el('p','','A quick hello, a team idea, your latest discovery.'));list.append(empty);}
  for(const m of sorted){
   const row=el('article','shoutbox-message');row.dataset.messageId=m.id;row.dataset.own=String(m.author.username===DexhavenAccount.getUser()?.username);
   const copy=el('p','shoutbox-copy'),name=el(m.author.profileAvailable?'a':'strong','shoutbox-username',m.author.username);if(m.author.profileAvailable)name.href='trainer/'+encodeURIComponent(m.author.username);TrainerNames.decorate(name,m.author.staffRole);
   const date=new Date(m.createdAt),time=el('time','shoutbox-time',date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false}));time.dateTime=m.createdAt;time.title=date.toLocaleString();time.setAttribute('aria-label',date.toLocaleString());copy.append(name,document.createTextNode(': '),el('span','shoutbox-text',m.message));row.append(copy,time);
   if(m.canRemove){const remove=el('button','text-button shoutbox-remove','\u00d7');remove.type='button';remove.title='Remove message';remove.setAttribute('aria-label','Remove message from '+m.author.username);remove.onclick=()=>moderate(m);row.append(remove);}list.append(row);
  }
  renderedNewest=sorted.at(-1)?.id??null;
  if(focusId)list.querySelector('[data-message-id="'+focusId+'"] '+focusSelector)?.focus({preventScroll:true});
  if(forceBottom||bottom&&!prepend)history.scrollTop=history.scrollHeight;
  else{const restored=anchorId&&list.querySelector('[data-message-id="'+anchorId+'"]');history.scrollTop=restored?oldTop+restored.getBoundingClientRect().top-anchorTop:oldTop;}
  older.hidden=!next;newest.hidden=!historyMode;messageCount.textContent=sorted.length?sorted.length+' message'+(sorted.length===1?'':'s'):'';messageCount.setAttribute('aria-label',sorted.length+' loaded messages');syncJump();
 }
 async function moderate(message){
  const dialog=el('dialog','shoutbox-confirm'),moderation=el('form','account-form'),heading=el('h2','','Remove this message?'),field=el('label','','Moderation reason'),reason=el('textarea'),error=el('p','form-error'),yes=el('button','action-button','Remove message'),cancel=el('button','text-button','Cancel');dialog.setAttribute('aria-labelledby','shoutbox-confirm-title');heading.id='shoutbox-confirm-title';reason.required=true;reason.minLength=5;reason.maxLength=300;field.append(reason);yes.type='submit';cancel.type='button';cancel.onclick=()=>dialog.close();moderation.append(heading,el('p','form-help',message.message),field,error,yes,cancel);dialog.append(moderation);document.body.append(dialog);dialog.onclose=()=>dialog.remove();moderation.onsubmit=async event=>{event.preventDefault();yes.disabled=cancel.disabled=true;try{await request('/messages/'+message.id,{method:'DELETE',body:{reason:reason.value}});messages.delete(message.id);unseen.delete(message.id);render();status.textContent='Message removed and moderation recorded.';dialog.close();}catch(e){error.textContent=e.message;}finally{yes.disabled=cancel.disabled=false;}};dialog.showModal();reason.focus();
 }
 async function load(before){
  if(!DexhavenAccount.getUser()){root.hidden=true;clearTimeout(timer);return;}if(loading){queued=before||true;return;}if(document.hidden||paused)return;
  loading=true;older.disabled=true;const initial=messages.size===0,token=revision;retry.hidden=true;if(before)historyMode=true;
  if(initial)status.textContent='Loading community messages\u2026';
  try{
   const query=new URLSearchParams();if(before)query.set('before',before);if(messages.size)query.set('ids',[...messages.keys()].join(','));
   const data=await request('/messages?'+query);if(token!==revision)return;
   setCooldown(data.cooldownSeconds);data.items.forEach(message=>messages.set(message.id,message));data.deletedIds.forEach(id=>{messages.delete(id);unseen.delete(id);});if(before||initial)next=data.next;
   while(messages.size>200)messages.delete([...messages.keys()].sort((a,b)=>historyMode?b-a:a-b)[0]);
   render({prepend:Boolean(before),forceBottom:initial||scrollAfterSend});scrollAfterSend=false;
   status.textContent=historyMode?'Viewing older messages. Choose Latest messages to return.':'';
  }catch(e){if(token!==revision)return;status.textContent=e.status===404?'The Shoutbox is unavailable in this preview.':e.status===503?'The Shoutbox is temporarily unavailable. Please try again later.':e.message;retry.hidden=false;}
  finally{loading=false;older.disabled=false;schedule();if(queued){const pending=queued;queued=false;load(pending===true?undefined:pending);}}
 }
 function schedule(){clearTimeout(timer);if(!document.hidden&&!paused&&DexhavenAccount.getUser())timer=setTimeout(()=>load(),10000);}
 older.onclick=()=>load(next);retry.onclick=()=>load();newest.onclick=()=>{historyMode=false;messages.clear();unseen.clear();renderedNewest=null;next=null;load();};
 form.onsubmit=async event=>{
  event.preventDefault();if(posting||cooldownUntil>Date.now()||!input.value.trim())return;
  posting=true;send.textContent='Sending\u2026';form.setAttribute('aria-busy','true');updateComposer();const text=input.value,token=revision;
  try{const result=await request('/messages',{method:'POST',body:{message:text}});if(token!==revision)return;setCooldown(result.cooldownSeconds);if(input.value===text){input.value='';updateComposer();}if(historyMode){historyMode=false;messages.clear();next=null;}scrollAfterSend=true;status.textContent='Message sent.';await load();}
  catch(e){if(token===revision){status.textContent=e.message;if(e.code==='SHOUTBOX_COOLDOWN')setCooldown(e.retryAfterSeconds);}}
  finally{if(token===revision){posting=false;send.textContent='Send';form.setAttribute('aria-busy','false');updateComposer();input.focus({preventScroll:true});}}
 };
 addEventListener('dexhaven:session',event=>{if(!event.detail.ready)return;const key=event.detail.user?event.detail.user.id+':'+event.detail.user.staff?.roleVersion:'guest';if(key!==identity){identity=key;revision++;historyMode=false;messages.clear();unseen.clear();renderedNewest=null;next=null;scrollAfterSend=false;cooldownUntil=0;clearTimeout(cooldownTimer);posting=false;input.value='';send.textContent='Send';form.setAttribute('aria-busy','false');list.replaceChildren();messageCount.textContent='';jump.hidden=true;clearTimeout(timer);account();load();}else account();});
 document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden)load();});
 addEventListener('dexhaven:session-error',()=>{status.textContent='Community messages are unavailable. Open the local installation or try again.';retry.hidden=false;schedule();});
 addEventListener('pagehide',()=>{paused=true;clearTimeout(timer);clearTimeout(cooldownTimer);revision++;});addEventListener('pageshow',()=>{paused=false;posting=false;send.textContent='Send';form.setAttribute('aria-busy','false');updateComposer();if(DexhavenAccount.isReady())load();});
 account();if(DexhavenAccount.isReady())load();
})();
