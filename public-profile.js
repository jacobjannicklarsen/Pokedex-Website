// Public profile presentation. Every field comes from the existing privacy projection.
(() => {
 'use strict';
 let disposeSocial=()=>{},favoritesSequence=0;
 function socialControls(target,hero,info,profile){
  const el=element,social=el('div','profile-social'),count=el('div','profile-follower-count'),value=el('strong'),controls=el('div','profile-social-buttons'),status=el('p','profile-social-status');status.setAttribute('role','status');count.append(value,el('span','','Followers'));social.append(count,controls,status);info.append(social);
  let generation=0,identity;const request=(path,options)=>DexhavenAccount.request(path,options);
  function updateCount(number){profile.followerCount=number;count.hidden=!Number.isInteger(number);if(!count.hidden)value.textContent=String(number);const fact=target.querySelector('.profile-follower-fact');if(fact){fact.hidden=count.hidden;if(!count.hidden)fact.querySelector('dd').textContent=String(number);}}
  updateCount(profile.followerCount);social.hidden=count.hidden;
  function session(){
   if(!target.contains(hero))return;const viewer=DexhavenAccount.getUser(),id=viewer?.id||null;if(identity===id)return;identity=id;const token=++generation;controls.replaceChildren();status.textContent='';
   social.hidden=count.hidden&&viewer?.username.toLowerCase()===profile.username.toLowerCase();
   if(!viewer){const login=el('button','text-button','Log in to follow');login.type='button';login.onclick=()=>document.querySelector('#account-button')?.click();controls.append(login);return;}
   if(viewer.username.toLowerCase()===profile.username.toLowerCase())return;
   let following=false,blocked=false,canFollow=false,busy=true;
   const follow=el('button','member-social-button member-follow profile-follow','Follow'),block=el('button','member-social-button member-block profile-block','Block');follow.type=block.type='button';controls.append(follow,block);
   const current=()=>generation===token&&target.contains(hero)&&DexhavenAccount.getUser()?.id===id;
   function paint(){follow.textContent=following?'Unfollow':'Follow';follow.disabled=busy||blocked||!canFollow;follow.title=blocked?'Unblock this trainer to follow them.':!busy&&!canFollow?'This trainer is not accepting followers.':(following?'Unfollow ':'Follow ')+profile.username;follow.setAttribute('aria-pressed',String(following));follow.setAttribute('aria-label',(following?'Unfollow ':'Follow ')+profile.username);block.textContent=blocked?'Unblock':'Block';block.disabled=busy;block.setAttribute('aria-pressed',String(blocked));block.setAttribute('aria-label',(blocked?'Unblock ':'Block ')+profile.username);}
   async function refresh(){const relationship=await request('/social/relationship/'+encodeURIComponent(profile.username));if(!current())return;following=relationship.following;blocked=relationship.blocked;canFollow=relationship.canFollow;}
   async function mutate(kind){
    if(busy)return;busy=true;status.textContent='';paint();
    try{const wasBlocked=blocked,enabled=kind==='follow'?!following:!blocked;await request('/social/'+(kind==='follow'?'following/':'blocked/')+encodeURIComponent(profile.username),{method:kind==='follow'?(following?'DELETE':'PUT'):(blocked?'DELETE':'PUT')});if(!current())return;if(kind==='follow')following=enabled;else{blocked=enabled;if(blocked){following=false;canFollow=false;}}await refresh();if(!current())return;status.textContent=kind==='block'?(wasBlocked?'Trainer unblocked.':'Trainer blocked.'):(following?'Following '+profile.username+'.':'Unfollowed '+profile.username+'.');try{const data=await request('/public/trainers/'+encodeURIComponent(profile.username));if(current())updateCount(data.profile.followerCount);}catch{/* The relationship is saved even if the public count cannot refresh. */}}
    catch(error){if(current())status.textContent=error.message;}
    finally{if(current()){busy=false;paint();}}
   }
   follow.onclick=()=>mutate('follow');block.onclick=()=>mutate('block');paint();refresh().catch(error=>{if(current())status.textContent=error.message;}).finally(()=>{if(current()){busy=false;paint();}});
  }
  const listener=event=>{if(event.detail.ready)session();};addEventListener('dexhaven:session',listener);if(DexhavenAccount.isReady())session();
  return()=>{generation++;removeEventListener('dexhaven:session',listener);};
 }
 function formatDate(value){
  const partial=typeof value==='string'&&/^\d{2}-\d{2}$/.test(value);
  const date=new Date(partial?'2000-'+value+'T00:00:00Z':value);
  if(Number.isNaN(date.getTime()))return '';
  const day=date.getUTCDate(),suffix=day%100>=11&&day%100<=13?'th':({1:'st',2:'nd',3:'rd'}[day%10]||'th');
  return day+suffix+' of '+date.toLocaleDateString('en-GB',{month:'long',timeZone:'UTC'})+(partial?'':' '+date.getUTCFullYear());
 }
 function render(target,p,{preview=false,records,roster,link,button}){
  const el=element;if(!preview)disposeSocial();target.replaceChildren();target.classList.add('public-profile-page');
  const section=(title,cls='',count)=>{const box=el('section','profile-section '+cls),head=el('header','profile-section-heading');head.append(el('h2','',title));if(Number.isInteger(count))head.append(el('span','profile-section-count',String(count)));box.append(head);return box;};
  const role={owner:'OWNER',administrator:'ADMINISTRATOR',moderator:'MODERATOR'}[p.staffRole]||'TRAINER';
  const hero=el('header','trainer-panel public-identity public-profile-hero profile-identity');hero.dataset.profileRole=p.staffRole||'trainer';hero.dataset.memberPreview='off';
  const avatar=el(p.avatarUrl?'img':'span','trainer-avatar'+(p.avatarUrl?'':' avatar-initial'),p.avatarUrl?undefined:p.username[0].toUpperCase());if(p.avatarUrl){avatar.src=p.avatarUrl;avatar.alt=p.username+"'s public profile picture";}hero.append(avatar);
  const info=el('div','trainer-identity-copy'),nameRow=el('div','trainer-name-row'),name=el(preview?'h3':'h1','public-profile-name',p.username),motto=el('p','trainer-motto-inline');motto.dataset.trainerMottoSlot='';motto.hidden=true;TrainerNames.decorate(name,p.staffRole);nameRow.append(name);
  const meta=el('div','trainer-identity-meta'),title=el('span');title.dataset.trainerTitleSlot='';const staff=TrainerNames.badge(p.staffRole);if(staff)meta.append(staff);meta.append(title);if(p.rank){const rank=el('span','profile-rank');TrainerRanks.render(rank,p.rank,{compact:true});meta.append(rank);}
  info.append(el('p','eyebrow profile-role-heading','DEXHAVEN '+role),nameRow,meta,motto);hero.append(info);target.append(hero);TrainerDecorations.apply(hero,p.decoration,p.pinnedBadges||[]);if(p.bannerUrl)ProfileExtras.banner(hero,p.bannerUrl);
  if(!preview)disposeSocial=socialControls(target,hero,info,p);
  const layout=el('div','public-profile-layout'),main=el('div','public-profile-main'),side=el('aside','public-profile-sidebar');side.setAttribute('aria-label','Trainer details');layout.append(main,side);target.append(layout);
  const about=section('Trainer snapshot','profile-about'),facts=el('dl','profile-facts');
  function fact(label,value,className=''){const row=el('div',className),description=el('dd');if(typeof value==='string')description.textContent=value;else description.append(value);row.append(el('dt','',label),description);facts.append(row);}
  fact('Member since',formatDate(p.createdAt),'profile-fact-date');fact('Public teams',String(p.teams.length));if(Number.isInteger(p.followerCount))fact('Followers',String(p.followerCount),'profile-follower-fact');
  if(p.details?.birthday){const value=el('span','profile-birthday-value');value.append(el('span','',formatDate(p.details.birthday)));if(p.details.birthdayVisibility!=='month-day'&&Number.isInteger(p.details.age))value.append(el('span','profile-fact-age','Age '+p.details.age));fact('Birthday',value,'profile-fact-date');}
  for(const [key,label]of [['location','Location'],['gender','Gender'],['occupation','Occupation']])if(p.details?.[key])fact(label,key==='gender'?({man:'Male',woman:'Female',unspecified:'Unspecified'}[p.details[key]]||p.details[key]):p.details[key]);about.append(facts);
  const external=[...(p.details?.website?[{label:'Website',url:p.details.website}]:[]),...(p.details?.social||[])];if(external.length){const links=el('div','profile-public-links');for(const item of external)try{const a=el('a','text-button',item.label+' ↗');a.href=RichBiography.safeURL(item.url);a.target='_blank';a.rel='noopener noreferrer nofollow ugc';links.append(a);}catch{}if(links.children.length)about.append(links);}side.append(about);
  if(p.featuredPokemonId){const partner=section('Featured Pokémon','profile-partner');roster(partner,[p.featuredPokemonId],records,false,'battle');side.append(partner);}
  if(p.bio){const bio=section('Biography','profile-bio');bio.append(p.bioFormat==='limited'?RichBiography.render(el('div','profile-biography'),p.bio):el('div','profile-biography',p.bio));main.append(bio);}
  if(p.activity||p.recentDiscussions?.length){const activity=section('Around the community','profile-activity');if(p.activity){const stats=el('div','profile-activity-stats');for(const [key,label]of [['threads','Discussions'],['replies','Replies'],['reactions','Reactions']]){const item=el('div');item.append(el('strong','',String(p.activity[key])),el('span','',label));stats.append(item);}activity.append(stats);}if(p.recentDiscussions?.length){const recent=el('div','profile-recent-discussions');for(const d of p.recentDiscussions){const entry=el('article','profile-discussion-entry'),context=el('p','profile-discussion-category',(d.category||'Forum')+':'),title=link(d.title,'forums.html#thread='+encodeURIComponent(d.threadId)+(d.postId?'&post='+encodeURIComponent(d.postId):''),'profile-discussion-link'),kind=el('span','profile-activity-kind',d.kind==='posted'?'Posted':'Replied');entry.append(context,title,kind);recent.append(entry);}activity.append(recent);}main.append(activity);}
  const teams=section('Shared teams','profile-teams',p.teams.length);if(!p.teams.length)teams.append(el('p','form-help','This trainer has not shared any teams.'));
  for(const t of [...p.teams].sort((a,b)=>Number(b.featured)-Number(a.featured))){const card=el('article','public-team-card'),heading=el('div','public-team-heading');heading.append(el('h3','',t.name));if(t.featured)heading.append(el('span','profile-featured-tag','Featured team'));card.append(heading);roster(card,t.pokemonIds,records,false,'party',true);card.append(link('View team & analysis ↗',`team/${t.shareId}`,'profile-team-link'));teams.append(card);}main.append(teams);
  if(p.favorites){
   const favorites=section('Shared favourites','profile-favourites',p.favorites.length),items=el('div');items.id='shared-favourites-'+(++favoritesSequence);let shown=0;
   const more=button('Show more favourites',()=>{if(shown>=p.favorites.length){items.replaceChildren();shown=0;showMore();more.focus({preventScroll:true});more.scrollIntoView({block:'nearest',behavior:'instant'});}else showMore();});more.setAttribute('aria-controls',items.id);
   function showMore(){roster(items,p.favorites.slice(shown,shown+12),records);shown=Math.min(p.favorites.length,shown+12);more.hidden=p.favorites.length<=12;more.textContent=shown>=p.favorites.length?'Show less':'Show more favourites ('+(p.favorites.length-shown)+' remaining)';more.setAttribute('aria-expanded',String(shown>12));}
   favorites.append(items,more);if(p.favorites.length)showMore();else{more.hidden=true;favorites.append(el('p','form-help','No shared favourites yet.'));}main.append(favorites);
  }
  if(p.statistics){const progress=section('Shared Pokédex completion','profile-progress'),grid=el('div','profile-completion-grid');for(const g of [{name:'National',...p.statistics.national},...p.statistics.generations]){const item=el('article','profile-completion-item'),bar=el('progress');bar.max=g.total;bar.value=g.caught;bar.setAttribute('aria-label',g.name+' caught progress');item.append(el('span','',g.name),el('strong','',`${g.caught} / ${g.total}`),bar,el('small','',`${g.caughtPercentage.toFixed(2)}% caught · ${g.seen} seen`));grid.append(item);}progress.append(grid);main.append(progress);}
  if(p.achievements){const awards=el('details','profile-section profile-achievements'),summary=el('summary','profile-section-heading');summary.append(el('h2','','Shared achievements'),el('span','profile-section-count',String(p.achievements.length)));awards.append(summary);const grid=el('div','profile-award-grid');for(const a of p.achievements){const item=el('article','profile-award');item.dataset.rarity=a.rarity||'bronze';const mark=el('span','profile-award-icon',a.icon||'✦');mark.setAttribute('aria-hidden','true');const copy=el('div');copy.append(el('h3','',a.name),el('p','',a.description),el('small','',`Unlocked ${new Date(a.unlockedAt).toLocaleDateString()}`));item.append(mark,copy);grid.append(item);}awards.append(grid);if(!p.achievements.length)awards.append(el('p','form-help','No unlocked achievements shared yet.'));main.append(awards);}
 }
 globalThis.DexhavenPublicProfile={render,formatDate};
})();
