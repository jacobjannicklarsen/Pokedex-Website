// Staff tools reuse the account transport. Every capability is enforced again by Express.
(() => {
 'use strict';
 const root=document.querySelector('#admin-content');if(!root)return;
 let context=null,tab='overview',ticket=0,identity='',content,notice,tabs,dialog,query='',cursor=null,auditCursor=null,users=[];
 const labels={owner:'Owner',administrator:'Administrator',moderator:'Moderator',trainer:'Trainer'};
 const can=permission=>context?.permissions.includes(permission);
 const request=(url,options)=>DexhavenAccount.request('/admin'+url,options);
 function button(text,fn,className='action-button'){const b=element('button',className,text);b.type='button';b.onclick=fn;return b;}
 function message(text,error=false){if(!notice)return;notice.hidden=false;notice.textContent=text;notice.classList.toggle('is-error',error);}
 function gate(title,text){ticket++;dialog?.close();dialog?.remove();context=null;root.replaceChildren();const box=element('div','admin-gate');box.append(element('h2','',title),element('p','form-help',text),button('Check access again',()=>DexhavenAccount.refresh().then(()=>start(true)).catch(e=>gate('Server unavailable',e.message)),'text-button'));if(!DexhavenAccount?.getUser())box.append(button('Log in',()=>document.querySelector('#account-button').click()));root.append(box);}
 async function start(force=false){
  const user=DexhavenAccount.getUser(),key=user?`${user.id}:${user.staff?.roleVersion}:${user.staff?.permissions.join(',')}`:'guest';
  if(!force&&key===identity)return;identity=key;
  if(!user)return gate('Staff access required','Sign in with an authorized staff account. Ordinary Trainers keep all their Trainer Hub tools.');
  if(!user.staff?.available)return gate('Administration is not ready','The manual v0.6.2 migration has not been applied. Your existing trainer tools remain available.');
  if(!user.staff.permissions.includes('panel.access'))return gate('This area is for staff','Your account has no Administration permission. Continue your journey in the Trainer Hub.');
  const current=++ticket;dialog?.close();dialog?.remove();root.replaceChildren(element('p','form-help','Loading authorized staff tools…'));
  try{const result=await request('/context');if(current!==ticket)return;context=result;shell();await load();}catch(e){if(current===ticket)gate('Administration unavailable',e.message);}
 }
 function shell(){
  root.replaceChildren();const bar=element('div','admin-toolbar'),role=element('div');TrainerRanks.role(role,context.role);role.append(element('span','form-help','Account role · not your trainer rank'));
  bar.append(role,button('Refresh access',()=>DexhavenAccount.refresh().then(()=>start(true)).catch(e=>message(e.message,true)),'text-button'));root.append(bar);
  tabs=element('nav','admin-tabs');tabs.setAttribute('aria-label','Administration sections');
  const allowed=[['overview','Overview','overview.read'],['users','User management','users.read'],['audit','Audit logs','audit.read'],['forums','Forum moderation','forums.moderate']].filter(([, ,permission])=>can(permission));
  if(!allowed.some(([key])=>key===tab))tab=allowed[0]?.[0];
  for(const [key,text]of allowed){const b=button(text,()=>{tab=key;cursor=null;auditCursor=null;load();},'');b.dataset.adminTab=key;tabs.append(b);}root.append(tabs);
  notice=element('p','admin-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.hidden=true;root.append(notice);
  content=element('div','admin-view');content.setAttribute('aria-busy','false');root.append(content);
  if(!allowed.length)content.append(element('p','form-help','No management tools are enabled for your account. Contact the Owner.'));
 }
 function auditList(items,target){
  const list=element('ol','admin-audit');for(const item of items){const row=element('li');row.dataset.auditId=item.id;
   row.append(element('strong','',`${item.actor} → ${item.target} · ${item.action}`));const time=element('time','',new Date(item.createdAt).toLocaleString());time.dateTime=item.createdAt;row.append(time);
   const details=Object.entries(item.metadata).map(([key,value])=>`${key}: ${Array.isArray(value)?value.join(', '):String(value)}`).join('\n');row.append(element('p','form-help',details));list.append(row);
  }if(!items.length)target.append(element('p','form-help','No authorized activity to show yet.'));target.append(list);
 }
 async function load(){
  if(!context||!tab)return;const current=++ticket;dialog?.close();content.replaceChildren(element('p','form-help','Loading…'));content.setAttribute('aria-busy','true');tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.adminTab===tab?'page':'false'));
  try{
   const params=new URLSearchParams();let data;
   if(tab==='overview')data=await request('/overview');
   if(tab==='users'){if(query)params.set('q',query);if(cursor)params.set('after',cursor);data=await request('/users?'+params);}
   if(tab==='audit'){if(auditCursor)params.set('before',auditCursor);data=await request('/audit?'+params);}
   if(current!==ticket||!context)return;content.replaceChildren();
   if(tab==='overview'){
    const cards=element('div','admin-overview');for(const [key,label,description]of [['trainers','Registered Trainers','All Dexhaven accounts'],['staff','Staff accounts','Assigned Moderator, Administrator and Owner roles'],['restricted','Currently restricted','Active temporary suspensions']]){const card=element('article');card.append(element('p','',label),element('strong','',data[key]),element('p','form-help',description));cards.append(card);}content.append(cards,element('h2','account-subheading','Recent authorized activity'));auditList(data.recent,content);
   }
   if(tab==='forums')await ForumAdmin.render(content,context,()=>current===ticket&&tab==='forums');
   if(tab==='users')renderUsers(data);
   if(tab==='audit'){content.append(element('h2','account-subheading','Audit trail'),element('p','form-help',context.role==='owner'?'Complete administrative records. Records cannot be edited here.':context.role==='moderator'?'Only your own administrative actions are visible.':'Permitted actions involving Trainers and Moderators. Owner/permission records are excluded.'));auditList(data.items,content);const more=button('Older records',()=>{auditCursor=data.next;load();},'text-button admin-pagination');more.disabled=data.next===null;content.append(more);}
  }catch(error){if(current!==ticket)return;content.replaceChildren(element('p','form-error',error.message),button('Retry',load));message(error.message,true);if([401,403].includes(error.status)){gate('Access changed',error.message);DexhavenAccount.refresh().catch(()=>{});}}
  finally{if(current===ticket&&content)content.setAttribute('aria-busy','false');}
 }
 function renderUsers(data){
  const search=element('form','admin-search'),label=element('label','','Find a trainer'),input=element('input');input.type='search';input.name='q';input.maxLength=64;input.placeholder='Username or account ID';input.value=query;label.append(input);
  const submit=element('button','action-button','Search');submit.type='submit';search.append(label,submit);search.onsubmit=e=>{e.preventDefault();query=input.value.trim();cursor=null;load();};content.append(search,element('p','form-help',`${data.total} matching accounts · ${data.items.length} on this page`));
  content.append(element('p','form-help','Only basic account identity, staff role and restriction status are shown. Staff tools do not open private biographies, teams, favourites, emails or collection records.'));
  const list=element('div','admin-users');users=data.items;
  for(const user of users){const row=element('article','admin-user');row.dataset.userId=user.id;const info=element('div');info.append(element('h3','',user.username));TrainerRanks.role(info,user.role);info.append(element('p','form-help',`Account #${user.id} · Joined ${new Date(user.createdAt).toLocaleDateString()}`));
   if(user.restriction){const restriction=element('p','admin-status restricted',`Suspended until ${new Date(user.restriction.expiresAt).toLocaleString()}. ${user.restriction.reason} · Issued by account #${user.restriction.issuedBy}`);info.append(restriction);}else info.append(element('p','admin-status','Active account'));
   const controls=element('div','admin-user-actions');if(user.actions.roleOptions.length)controls.append(button('Change role',()=>openAction(user,'role')));if(user.actions.canPermissions)controls.append(button('Staff permissions',()=>openAction(user,'permissions')));if(user.actions.canRestrict)controls.append(button('Suspend',()=>openAction(user,'suspend')));if(user.actions.canRevoke)controls.append(button('Revoke suspension',()=>openAction(user,'revoke')));
   if(!controls.children.length)controls.append(element('p','form-help',user.role==='owner'?'Protected Owner account':'No permitted changes'));
   row.append(info,controls);list.append(row);
  }if(!users.length)list.append(element('p','form-help','No matching Trainers. Try another username or ID.'));content.append(list);
  const pages=element('div','team-actions admin-pagination'),first=button('First page',()=>{cursor=null;load();},'text-button'),next=button('Next page',()=>{cursor=data.next;load();},'text-button');first.disabled=!cursor;next.disabled=data.next===null;pages.append(first,next);content.append(pages);
 }
 function openAction(user,kind){
  const opener=document.activeElement;dialog?.remove();dialog=element('dialog','admin-dialog');dialog.setAttribute('aria-labelledby','admin-dialog-title');
  const title=element('h2','',({role:'Change role',permissions:'Manage staff permissions',suspend:'Suspend account',revoke:'Revoke suspension'})[kind]);title.id='admin-dialog-title';dialog.append(title,element('p','form-help',`${user.username} · #${user.id}. Confirm only after reviewing this account and your reason.`));
  const form=element('form','admin-form');const body={version:user.version};let roleSelect,hours,permissions;
  if(kind==='role'){const label=element('label','','New staff role');roleSelect=element('select');roleSelect.name='role';for(const role of user.actions.roleOptions){const o=element('option','',labels[role]);o.value=role;roleSelect.append(o);}roleSelect.value=user.role;label.append(roleSelect);form.append(label,element('p','form-help',context.role==='owner'?'Your role change resets the permission subset to the new role defaults. Trainer progression is unaffected.':'Owner-assigned permission limits remain in force after your role change. Trainer progression is unaffected.'));}
  if(kind==='permissions'){const fields=element('fieldset');fields.append(element('legend','','Enabled permissions · role maximum'));permissions=[];for(const permission of user.actions.allowedPermissions){const label=element('label','privacy-option'),input=element('input');input.type='checkbox';input.name='permissions';input.value=permission;input.checked=user.permissions.includes(permission);permissions.push(input);label.append(input,document.createTextNode(permission));fields.append(label);}form.append(fields);}
  if(kind==='suspend'){const label=element('label','',`Duration in hours (1–${user.actions.maxHours})`);hours=element('input');hours.type='number';hours.name='hours';hours.min=1;hours.max=user.actions.maxHours;hours.step=1;hours.value=1;hours.required=true;label.append(hours);form.append(label,element('p','form-help','Suspension blocks authenticated access, including existing sessions. Expiration is automatic. It does not publish or delete account data.'));}
  if(kind==='revoke')form.append(element('p','form-help',`Remove the active suspension ending ${new Date(user.restriction.expiresAt).toLocaleString()}. Its history will remain in the audit trail.`));
  const reasonLabel=element('label','','Reason (5–300 characters)'),reason=element('textarea');reason.name='reason';reason.rows=3;reason.minLength=5;reason.maxLength=300;reason.required=true;reasonLabel.append(reason);form.append(reasonLabel,element('p','form-help','Use a clear account-management reason. Do not include passwords, tokens or other secrets.'));
  const confirmedLabel=element('label','privacy-option'),confirmed=element('input');confirmed.type='checkbox';confirmed.name='confirmed';confirmed.required=true;confirmedLabel.append(confirmed,document.createTextNode('I have reviewed this change and its effect on this account.'));form.append(confirmedLabel);
  const status=element('p','form-help');status.setAttribute('role','status');status.setAttribute('aria-live','polite');const actions=element('div','team-actions'),cancel=button('Cancel',()=>dialog.close(),'text-button'),submit=element('button','action-button','Confirm change');submit.type='submit';actions.append(cancel,submit);form.append(status,actions);dialog.append(form);document.body.append(dialog);
  let busy=false;dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>opener?.isConnected&&opener.focus(),{once:true});
  form.onsubmit=async event=>{
   event.preventDefault();if(busy)return;busy=true;status.className='form-help';status.textContent='Saving and recording the change…';form.setAttribute('aria-busy','true');for(const control of form.elements)control.disabled=true;
   const current=ticket;
   try{
    const value={...body,reason:reason.value};if(kind==='role')value.role=roleSelect.value;if(kind==='permissions')value.permissions=permissions.filter(i=>i.checked).map(i=>i.value);if(kind==='suspend')value.hours=Number(hours.value);if(kind==='revoke')value.restrictionId=user.restriction.id;
    const path={role:'role',permissions:'permissions',suspend:'restrictions',revoke:'restrictions/revoke'}[kind];await request(`/users/${user.id}/${path}`,{method:'POST',body:value});
    if(current!==ticket)return;dialog.close();await load();message('Change saved. The administrative audit record was committed.');content.querySelector(`.admin-user[data-user-id="${user.id}"] button`)?.focus();
   }catch(error){if(current!==ticket)return;status.className='form-error';status.textContent=error.message;message(error.message,true);if([401,403].includes(error.status))DexhavenAccount.refresh().catch(()=>{});}
   finally{busy=false;form.removeAttribute('aria-busy');for(const control of form.elements)control.disabled=false;}
  };
  dialog.showModal();(roleSelect||hours||reason).focus();
 }
 globalThis.addEventListener('dexhaven:session',event=>{if(event.detail.ready)start();});
 globalThis.addEventListener('dexhaven:session-error',event=>gate('Administration unavailable',event.detail.message));
 if(globalThis.DexhavenAccount?.getUser())start();
})();
