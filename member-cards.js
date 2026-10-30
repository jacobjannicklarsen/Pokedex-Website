// Member cards with direct profile links. No hover or focus previews.
(() => {'use strict';
 const base=new URL('.',document.currentScript.src),request=(path,options)=>DexhavenAccount.request(path,options),el=element;
 let lastIdentity=null;
 function button(text,fn){const b=el('button','text-button',text);b.type='button';b.onclick=fn;return b;}
 function card(p,{context='directory'}={}){const article=el('article','member-card trainer-panel'),copy=el('div','trainer-identity-copy'),name=el('h3');const identity=el(p.profileAvailable?'a':'span','',p.username);if(p.profileAvailable)identity.href=new URL('trainer/'+encodeURIComponent(p.username),base).href;identity.dataset.member=p.username;TrainerNames.decorate(identity,p.staffRole);name.append(identity);const avatar=el(p.avatarUrl?'img':'span','trainer-avatar avatar-initial',p.avatarUrl?undefined:p.username[0].toUpperCase());avatar.dataset.member=p.username;if(p.avatarUrl){avatar.src=p.avatarUrl;avatar.alt=p.username+"'s public avatar";avatar.classList.remove('avatar-initial');}if(p.bannerUrl){const banner=el('img','profile-custom-banner');banner.src=p.bannerUrl;banner.alt='';article.append(banner);}article.dataset.staffRole=p.staffRole||'trainer';article.dataset.username=p.username;article.dataset.cardContext=context;copy.append(name);const meta=el('div','trainer-identity-meta');TrainerRanks.role(meta,p.staffRole);const titleSlot=el('span');titleSlot.dataset.trainerTitleSlot='';meta.append(titleSlot);if(p.rank){const rank=el('span');TrainerRanks.render(rank,p.rank,{compact:true});meta.append(rank);}copy.append(meta);const motto=el('p','trainer-motto-inline');motto.dataset.trainerMottoSlot='';motto.hidden=true;copy.append(motto);if(p.createdAt)copy.append(el('p','form-help','Joined '+new Date(p.createdAt).toLocaleDateString()));if(p.activity){const stats=el('div','member-card-stats');for(const [key,label]of [['threads','Discussions'],['replies','Replies'],['reactions','Reactions']]){const item=el('span');item.append(el('strong','',String(p.activity[key])),el('small','',label));stats.append(item);}copy.append(stats);}if(Number.isInteger(p.followerCount))copy.append(el('p','form-help',p.followerCount+' followers'));const top=el('div','member-card-top');const portrait=el(p.profileAvailable?'a':'span','member-card-portrait');if(p.profileAvailable){portrait.href=new URL('trainer/'+encodeURIComponent(p.username),base).href;portrait.setAttribute('aria-label','View '+p.username+"'s trainer profile");}portrait.append(avatar);const stamp=el('span','member-card-stamp');stamp.dataset.staffNameRole=p.staffRole||'trainer';const roleIcon=TrainerNames.icon(p.staffRole);if(roleIcon)stamp.append(roleIcon);stamp.append(el('span','member-card-role-label',({owner:'Owner',administrator:'Administrator',moderator:'Moderator'})[p.staffRole]||'Trainer'));top.append(portrait,stamp);article.append(top,copy);TrainerDecorations.apply(article,p.decoration||{},[]);
  const actions=el('div','member-card-actions');actions.dataset.memberPreview='off';
  if(p.profileAvailable){const a=el('a','action-button','View trainer profile');a.href=new URL('trainer/'+encodeURIComponent(p.username),base).href;actions.append(a);}else actions.append(el('p','form-help','Public profile is not enabled.'));
  const message=el('p','form-error');message.setAttribute('role','status');
  const own=DexhavenAccount.getUser();
  if(own&&own.username!==p.username){
   const social=el('div','member-social-actions');let follow;
   function showFollow(){follow.replaceChildren(socialIcon(p.following?'check':'plus'),document.createTextNode(p.following?'Unfollow':'Follow'));follow.setAttribute('aria-pressed',String(Boolean(p.following)));follow.setAttribute('aria-label',(p.following?'Unfollow ':'Follow ')+p.username);}
   if(p.canFollow){
    follow=button('',async()=>{follow.disabled=true;message.textContent='';try{await request('/social/following/'+encodeURIComponent(p.username),{method:p.following?'DELETE':'PUT'});p.following=!p.following;showFollow();}catch(e){message.textContent=e.message;}finally{follow.disabled=false;}});
    follow.className='member-social-button member-follow';showFollow();social.append(follow);
   }
   const block=button('',async()=>{block.disabled=true;message.textContent='';try{await request('/social/blocked/'+encodeURIComponent(p.username),{method:'PUT'});block.replaceChildren(socialIcon('block'),document.createTextNode('Blocked'));block.setAttribute('aria-label',p.username+' is blocked');if(follow)follow.disabled=true;const n=document.querySelector('#account-message');if(n){n.hidden=false;n.textContent='Trainer blocked. Manage blocks in Account Settings.';}}catch(e){message.textContent=e.message;block.disabled=false;}});
   block.className='member-social-button member-block';block.setAttribute('aria-label','Block '+p.username);block.append(socialIcon('block'),document.createTextNode('Block'));social.append(block);actions.append(social);
  }
  actions.append(message);article.append(actions);return article;
 }
 function socialIcon(kind){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',kind==='plus'?'M10 4v12M4 10h12':kind==='check'?'m4 10 4 4 8-8':'M4.3 4.3l11.4 11.4M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0');svg.append(path);return svg;
 }
 addEventListener('dexhaven:session',e=>{if(!e.detail.ready)return;const id=e.detail.user?.id||null;if(lastIdentity!==id){lastIdentity=id;if(id)request('/settings/activity',{method:'POST'}).catch(()=>{});}});
 globalThis.MemberCards={card};
})();
