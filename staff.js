(() => {
 'use strict';
 const root=document.querySelector('#staff-content');if(!root)return;
 const roles=[['owner','Owner','Guides the direction of Dexhaven and manages the community team.'],['administrator','Administrators','Keep the community organised and help manage the forums.'],['moderator','Moderators','Care for discussions and help keep conversations welcoming.']];
 let ticket=0,identity,items=[],next=null,selected='all',query='',busy=false;
 let list,status,search,filters,more,error;
 function button(text,fn,cls='text-button'){const b=element('button',cls,text);b.type='button';b.onclick=fn;return b;}
 function staffRow(person){
  const row=element('article','member-card staff-row');row.dataset.username=person.username;row.dataset.staffRole=person.staffRole;
  const portrait=element(person.profileAvailable?'a':'span','member-card-portrait staff-row-portrait');if(person.profileAvailable){portrait.href='trainer/'+encodeURIComponent(person.username);portrait.setAttribute('aria-label','View '+person.username+"'s trainer profile");}
  const avatar=element(person.avatarUrl?'img':'span','trainer-avatar avatar-initial',person.avatarUrl?undefined:person.username[0].toUpperCase());if(person.avatarUrl){avatar.src=person.avatarUrl;avatar.alt='';avatar.loading='lazy';avatar.classList.remove('avatar-initial');}portrait.append(avatar);
  const copy=element('div','staff-row-copy'),heading=element('h3'),name=element(person.profileAvailable?'a':'span','',person.username);if(person.profileAvailable)name.href='trainer/'+encodeURIComponent(person.username);TrainerNames.decorate(name,person.staffRole);heading.append(name);copy.append(heading);
  const subtitle=[person.decoration?.title,person.details?.location?'From '+person.details.location:null].filter(Boolean).join(' \u00b7 ');
  if(subtitle||person.decoration?.motto)copy.append(element('p','staff-row-description',subtitle||person.decoration.motto));
  const facts=element('div','staff-row-facts');if(person.activity)for(const [key,label]of [['threads','Discussions'],['replies','Replies'],['reactions','Reactions']]){const stat=element('span');stat.append(document.createTextNode(label+': '),element('strong','',String(person.activity[key])));facts.append(stat);}
  if(person.rank){const rank=element('span');rank.append(document.createTextNode('Caught: '),element('strong','',String(person.rank.caught)));facts.append(rank);}
  if(person.createdAt)facts.append(element('span','','Joined '+new Date(person.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})));if(facts.children.length)copy.append(facts);
  const actions=element('div','staff-row-actions'),badge=TrainerNames.badge(person.staffRole);if(badge)actions.append(badge);if(person.profileAvailable){const profile=element('a','staff-row-profile','View profile');profile.href='trainer/'+encodeURIComponent(person.username);actions.append(profile);}else actions.append(element('span','staff-row-private','Private profile'));
  row.append(portrait,copy,actions);return row;
 }
 function shell(){
  root.replaceChildren();
  const tools=element('div','staff-directory-tools'),label=element('label','staff-search','Find a staff member');search=element('input');search.type='search';search.placeholder='Search by username';search.maxLength=24;search.value=query;search.oninput=()=>{query=search.value;render();};label.append(search);
  filters=element('div','staff-role-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label','Filter staff by role');
  for(const [role,title]of [['all','All staff'],...roles]){const b=button(title,()=>{selected=role;render();});b.dataset.staffFilter=role;filters.append(b);}
  tools.append(label,filters,button('Clear filters',()=>{query='';selected='all';search.value='';render();search.focus();},'text-button staff-clear'));root.append(tools);
  status=element('p','staff-directory-status form-help');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
  error=element('div','staff-directory-error');error.setAttribute('role','status');error.hidden=true;root.append(error);
  list=element('div','staff-directory-list');root.append(list);
  more=button('Load more staff',()=>load(next),'action-button staff-more');more.hidden=true;root.append(more);
 }
 function render(){
  const matches=items.filter(p=>(selected==='all'||p.staffRole===selected)&&p.username.toLowerCase().includes(query.trim().toLowerCase()));
  for(const b of filters.children){const role=b.dataset.staffFilter,count=items.filter(p=>role==='all'||p.staffRole===role).length,title=role==='all'?'All staff':roles.find(r=>r[0]===role)[1];b.replaceChildren(document.createTextNode(title+' '),element('span','staff-filter-count',String(count)));b.setAttribute('aria-pressed',String(role===selected));}
  status.textContent=busy&&!items.length?'Loading the staff directory…':matches.length+' '+(matches.length===1?'staff member':'staff members')+(query||selected!=='all'?' matching your filters':'')+(next?' · More staff available below':'');
  list.replaceChildren();
  for(const [role,title,description]of roles){const members=matches.filter(p=>p.staffRole===role);if(!members.length)continue;const section=element('section','staff-group');section.dataset.staffGroup=role;section.setAttribute('aria-labelledby','staff-heading-'+role);const heading=element('header','staff-group-heading'),titleRow=element('div'),h=element('h2','',title);h.id='staff-heading-'+role;h.prepend(TrainerNames.icon(role));titleRow.append(h,element('span','staff-group-count',String(members.length)));heading.append(titleRow,element('p','form-help',description));const grid=element('div','staff-grid staff-rows');members.forEach(p=>grid.append(staffRow(p)));section.append(heading,grid);list.append(section);}
  if(!matches.length&&!busy&&error.hidden){const empty=element('div','discovery-empty');empty.append(element('h2','',items.length?'No matching staff':'The directory is quiet for now'),element('p','form-help',items.length?'Try another username or choose a different role.':'Staff members will appear here when roles are assigned.'));if(query||selected!=='all')empty.append(button('Clear filters',()=>{query='';selected='all';search.value='';render();search.focus();}));list.append(empty);}
  more.hidden=!next;more.disabled=busy;more.textContent=busy?'Loading staff…':'Load more staff';
 }
 async function load(after=0){
  if(after&&busy)return;
  const token=++ticket;busy=true;root.setAttribute('aria-busy','true');
  if(!after){items=[];next=null;selected='all';query='';shell();}
  error.hidden=true;error.replaceChildren();render();
  try{
   const data=await DexhavenAccount.request('/public/staff'+(after?'?after='+encodeURIComponent(after):''));if(token!==ticket)return;
   items=[...new Map([...items,...data.items].map(p=>[p.username,p])).values()];next=data.next;
  }catch(e){if(token!==ticket)return;error.hidden=false;error.append(element('p','form-error',e.message),button('Retry directory',()=>load(after)));}
  finally{if(token===ticket){busy=false;root.setAttribute('aria-busy','false');render();}}
 }
 addEventListener('dexhaven:session',e=>{if(!e.detail.ready)return;const key=e.detail.user?e.detail.user.id+':'+e.detail.user.staff?.roleVersion:'guest';if(identity!==key){identity=key;load();}});
 if(DexhavenAccount.isReady()){const u=DexhavenAccount.getUser();identity=u?u.id+':'+u.staff?.roleVersion:'guest';load();}
})();
