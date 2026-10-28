(() => {'use strict';
 const request=(p,o)=>DexhavenAccount.request(p,o),el=element;
 function link(text,href,cls=''){const a=el('a',cls,text);a.href=href;return a;}
 function entry(p){const row=el('article','discovery-post');row.append(link(p.title,`forums.html#thread=${p.threadId}&post=${p.id}`),el('p','form-help',`${p.category||''} · ${new Date(p.createdAt).toLocaleString()}`));if(p.author){const name=el('span','',p.author.username);name.dataset.member=p.author.username;row.append(name);}if(p.body)row.append(el('p','form-help',p.body));return row;}
 function syncNavigation(params=new URLSearchParams(location.hash.slice(1))){
  const section=['trending','latest','members','member'].find(key=>params.has(key));
  document.querySelectorAll('.community-subnav a').forEach(a=>{
   const url=new URL(a.href,location.href),hash=new URLSearchParams(url.hash.slice(1));
   const selected=url.pathname===location.pathname&&(section?hash.has(section==='member'?'members':section):!url.hash);
   if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
 }
 function navigation(target){
  const params=new URLSearchParams(location.hash.slice(1)),nav=el('nav','forum-secondary-nav');nav.setAttribute('aria-label','Forum tools');
  const authenticated=Boolean(DexhavenAccount.getUser());
  for(const [text,key]of [['All threads','all'],['New posts','newPosts'],['Watched threads','watched'],['Bookmarks','bookmarks']]){
   if(key!=='all'&&!authenticated)continue;
   const a=link(text,'forums.html#'+key+'=1');if(params.has(key))a.setAttribute('aria-current','page');nav.append(a);
  }
  if(authenticated){const mark=el('button','text-button','Mark forums read');mark.type='button';mark.onclick=async()=>{mark.disabled=true;try{await request('/forums/read',{method:'POST'});mark.textContent='Forums marked read';}catch(e){mark.textContent=e.message;}finally{mark.disabled=false;}};nav.append(mark);}
  target.append(nav);
 }
 async function home(root,isCurrent){const data=await request('/community/discovery');if(!isCurrent())return;root.replaceChildren();navigation(root);const layout=el('div','discovery-layout'),forums=el('section','discovery-forums'),sidebar=el('aside','discovery-sidebar');sidebar.setAttribute('aria-label','Community activity');const groups=[...new Set(data.categories.map(c=>c.groupName))];for(const name of groups){const details=el('details','forum-group');details.open=true;try{const saved=localStorage.getItem('dexhaven-forum-group:'+name);if(saved!==null)details.open=saved==='open';}catch{}const summary=el('summary','',name);details.append(summary);details.addEventListener('toggle',()=>{try{localStorage.setItem('dexhaven-forum-group:'+name,details.open?'open':'closed');}catch{}});for(const c of data.categories.filter(c=>c.groupName===name&&!c.parentId)){const row=el('article','discovery-forum-row'),title=link(c.name,'forums.html#category='+c.id,'forum-category');title.append(el('p','form-help',c.description));row.append(title);const counts=el('div','discovery-forum-counts');counts.append(el('strong','',`${c.threads||0} threads`),el('span','form-help',`${c.posts||0} messages · ${c.replies||0} replies`));row.append(counts);if(c.latest)row.append(entry(c.latest));else row.append(el('p','form-help','No discussions yet.'));for(const child of data.categories.filter(child=>child.parentId===c.id)){const a=link('↳ '+child.name,'forums.html#category='+child.id,'forum-subforum');a.append(el('small','form-help',`${child.threads||0} threads · ${child.posts||0} messages`));row.append(a);}details.append(row);}forums.append(details);}
  const recent=el('section','discovery-recent');recent.append(el('h2','','Recent discussions'));for(const p of data.latest){const card=el('article','forum-thread-card');card.append(link(p.title,`forums.html#thread=${p.threadId}&post=${p.id}`),el('p','form-help',`${p.author.username} · ${new Date(p.createdAt).toLocaleString()}`));recent.append(card);}if(!data.latest.length)recent.append(el('p','notice','A fresh chapter. Start the first discussion.'));forums.append(recent);
  const statistics=el('section','community-widget');statistics.append(el('p','eyebrow','DEXHAVEN TOGETHER'));for(const [key,label]of [['members','Registered members'],['threads','Public discussions'],['posts','Public messages']])statistics.append(el('p','community-stat',`${data.totals[key]} ${label}`));sidebar.append(statistics);const latest=el('section','community-widget');latest.append(el('h2','','Latest posts'));data.latest.slice(0,4).forEach(p=>latest.append(entry(p)));if(!data.latest.length)latest.append(el('p','form-help','No public posts yet.'));sidebar.append(latest);const trends=el('section','community-widget');trends.append(el('h2','','Trending'),el('p','form-help','Distinct community engagement in the last 7 days.'));for(const t of data.trending)trends.append(link(t.title,'forums.html#thread='+t.id,'discovery-trend'));if(!data.trending.length)trends.append(el('p','form-help','Trending discussions will appear as different trainers join in.'));sidebar.append(trends);const members=el('section','community-widget');members.append(el('h2','','Recently active'),el('p','form-help','Opted-in public members active within 24 hours.'));for(const p of data.recentMembers){const row=el('div','discovery-member');const name=el('span','',p.username);name.dataset.member=p.username;row.append(name);members.append(row);}if(!data.recentMembers.length)members.append(el('p','form-help','No opted-in recent activity to show.'));sidebar.append(members);layout.append(forums,sidebar);root.append(layout);
 }
 function authorLine(author,createdAt){
  const meta=el('div','discovery-meta');
  if(author){const name=el('span','discovery-author',author.username);name.dataset.member=author.username;name.tabIndex=0;TrainerNames.decorate(name,author.staffRole);meta.append(name);}
  if(createdAt){const time=el('time','',new Date(createdAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}));time.dateTime=createdAt;meta.append(time);}
  return meta;
 }
 function feedCard(item,index,trending){
  const card=el('article','discovery-feed-card');
  if(trending){const rank=el('span','discovery-position',String(index+1).padStart(2,'0'));rank.setAttribute('aria-label','Trending position '+(index+1));card.append(rank);}
  const copy=el('div','discovery-feed-copy');
  if(item.category)copy.append(el('p','eyebrow',item.category));
  const title=el('h3');title.append(link(item.title,`forums.html#thread=${item.threadId||item.id}${item.threadId?'&post='+item.id:''}`));copy.append(title,authorLine(item.author,item.createdAt));
  if(item.body)copy.append(el('p','discovery-excerpt',item.body));
  if(trending){const activity=el('div','discovery-engagement');activity.append(el('span','',`${item.contributors} contributing ${item.contributors===1?'trainer':'trainers'}`),el('span','',`${item.reactors} ${item.reactors===1?'trainer':'trainers'} reacted`));copy.append(activity);}
  card.append(copy);return card;
 }
 async function feed(root,params,isCurrent){
  const page=Number(params.get('page')||1),members=params.has('members')||params.has('member'),trending=params.has('trending');
  let data,title,description,empty;
  if(trending){const d=await request('/community/discovery');data={items:d.trending,next:null};title='Trending discussions';description='The conversations bringing trainers together. Ranked by distinct community engagement over the last seven days.';empty='Trending starts with a conversation. Discussions appear here when different trainers reply or react.';}
  else if(params.has('bookmarks')){data=await request('/bookmarks?page='+page);title='Your bookmarks';description='The posts you saved, ready when you are.';empty='Bookmark a post in a discussion to keep it here.';}
  else if(params.has('watched')){data=await request('/forums/watched?page='+page);title='Watched discussions';description='Pick up the discussions you follow.';empty='Follow a discussion to find it here next time.';}
  else if(params.has('member')){data={items:[await request('/public/members/'+encodeURIComponent(params.get('member')))],next:null};title='Trainer preview';description='Get to know a fellow trainer through the details they choose to share.';}
  else if(params.has('members')){data=await request('/public/members'+(params.get('after')?'?after='+encodeURIComponent(params.get('after')):''));title='Community members';description='Meet the trainers sharing their journeys. Open a preview or visit a public trainer profile.';empty='No public trainers to show yet. Enable your public profile in the Trainer Hub to join the directory.';}
  else{data=await request((params.has('newPosts')?'/forums/new-posts':'/community/latest')+'?page='+page);title=params.has('newPosts')?'New posts since you marked forums read':'What’s new';description='Fresh replies and new discussions, with the newest messages first.';empty='You’re all caught up. New conversations and replies will appear here.';}
  if(!isCurrent())return;
  root.replaceChildren();navigation(root);
  const header=el('header','discovery-feed-heading'),copy=el('div');copy.append(el('p','eyebrow',members?'THE TRAINER DIRECTORY':trending?'THIS WEEK IN DEXHAVEN':'KEEP THE CONVERSATION GOING'),el('h2','',title),el('p','form-help',description));
  const noun=members?'trainer':trending?'discussion':'post';
  const count=el('span','discovery-result-count',`${data.items.length} ${noun}${data.items.length===1?'':'s'}${params.has('after')||page>1?' on this page':''}`);header.append(copy,count);root.append(header);
  if(!data.items.length){const box=el('div','discovery-empty');box.append(el('h3','',members?'Your community starts here':trending?'A new conversation is waiting':'Nothing new here yet'),el('p','form-help',empty||'There are no results to show.'),link(members?'Explore the Trainer Hub':'Browse all discussions',members?'trainers.html':'forums.html#all=1','explore-link'));root.append(box);}
  const list=el('div',members?'staff-grid discovery-members':'discovery-feed');data.items.forEach((item,index)=>list.append(members?MemberCards.card(item):feedCard(item,index,trending)));root.append(list);
  if(data.next||page>1||params.has('after')){
   const pager=el('nav','forum-pagination discovery-pagination');pager.setAttribute('aria-label',members?'Member directory pages':'Discussion feed pages');
   if(params.has('after')){const first=new URLSearchParams(params);first.delete('after');pager.append(link('Back to first page','forums.html#'+first,'text-button'));}
   else if(page>1){const prev=new URLSearchParams(params);prev.set('page',page-1);pager.append(link('← Previous','forums.html#'+prev,'text-button'));}
   pager.append(el('span','form-help',members?'Public trainer directory':`Page ${page}`));
   if(data.next){const next=new URLSearchParams(params);next.set(members?'after':'page',data.next);pager.append(link('Next →','forums.html#'+next,'action-button'));}root.append(pager);
  }
 }
 globalThis.ForumDiscovery={home,feed,navigation,syncNavigation};
})();
