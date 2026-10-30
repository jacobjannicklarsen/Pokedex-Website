// Public projections and opt-in sharing settings. All text is rendered with textContent.
(() => {
  'use strict';
  const root = new URL('.',document.currentScript.src);
  const link = (label,path,className='text-button') => { const a=element('a',className,label);a.href=new URL(path,root).href;return a; };
  const button = (label,fn) => { const b=element('button','action-button',label);b.type='button';b.onclick=fn;return b; };
  async function publicRequest(path,{signal}={}) {
    const response=await fetch(new URL(`api/public/${path}`,root),{credentials:'same-origin',cache:'no-store',signal});
    const data=await response.json().catch(()=>({error:'Community sharing needs the Express backend. Static previews cannot load trainer data.'}));
    if(!response.ok)throw Error(data.error||'This shared content is unavailable.');return data;
  }
  function copyLink(container,path) {
    const url=new URL(path,root).href, row=element('div','share-link-row');
    const label=element('label','','Shareable link'),input=element('input');input.readOnly=true;input.value=url;input.setAttribute('aria-label','Shareable link');label.append(input);
    const status=element('span','form-help');status.setAttribute('role','status');
    const copy=button('Copy link',async()=>{try{await navigator.clipboard.writeText(url);status.textContent='Link copied.';}catch{input.focus();input.select();status.textContent='Select and copy this link.';}});
    row.append(label,copy,status);container.append(row);
  }
  function pokemonTile(p,kind='party') {
    const tile=element('a','shared-pokemon');tile.href=new URL(`pokemon.html?pokemon=${p.id}`,root).href;
    tile.append(PokemonSprites.create(p.id,{kind,name:prettyName(p.name),pokemon:p}),element('strong','',`${number(p.id)} ${prettyName(p.name)}`),badges(p.types));return tile;
  }
  function roster(container,ids,records,full=false,kind='party',six=false) {
    const grid=element('div','shared-roster');
    const byId=new Map(records.map(p=>[p.id,p]));
    for(let i=0;i<(full||six?6:ids.length);i++) {
      const p=byId.get(ids[i]);
      if(!p){const empty=element('div','shared-pokemon empty-public-slot',`Slot ${i+1} · Empty`);grid.append(empty);continue;}
      const card=pokemonTile(p,kind);
      if(full)card.append(element('p','form-help',p.stats.map((s,j)=>`${PokemonData.labels[j]} ${s.value}`).join(' · ')));
      grid.append(card);
    }container.append(grid);
  }
  async function renderProfile(target,p,{preview=false}={}) {
    const records=(await PokemonData.load()).pokemon;if(!target.isConnected)return;
    DexhavenPublicProfile.render(target,p,{preview,records,roster,link,button});
  }
  async function settings(target,ctx) {
    const panel=element('section','trainer-panel community-settings');panel.append(element('h3','','Your public profile'),element('p','form-help','Your account starts private. Publishing your profile shares your username, joining date and featured Pokémon. Every optional item below needs your approval. Individual teams have separate visibility controls.'));target.append(panel);
    try {
      const {settings:s}=await ctx.request('/community/settings');if(!panel.isConnected||ctx.currentUserId()!==ctx.user.id)return;
      const form=element('form','account-form');
      const checks={};
      for(const [key,label] of [['enabled','Enable my public profile (also lists me in the trainer directory)'],['shareBio','Show biography publicly'],['shareAvatar','Show my current profile picture publicly'],['shareFavorites','Share my current favourites'],['shareProgress','Share my National and generation completion totals'],['shareAchievements','Share my unlocked achievements']]){
        const l=element('label','privacy-option');const input=element('input');input.type='checkbox';input.name=key;input.checked=s[key];checks[key]=input;l.append(input,document.createTextNode(label));form.append(l);
      }
      form.append(element('p','form-help','Show biography publicly shares the Biography you edit above. It appears only while your public profile is enabled.'));
      let featuredPokemonId=s.featuredPokemonId;
      if(globalThis.PokemonSelector){const selector=PokemonSelector.create({slot:'featured',label:'Featured Pokémon (optional)',selectedId:s.featuredPokemonId,total:649,getPokemon:id=>state.pokemon.get(id),excludedIds:()=>new Set(),formatName:prettyName,makeArtwork:artwork,onChange:id=>{featuredPokemonId=id;}});ctx.trackSelector(selector);form.append(selector.element);}
      else form.append(element('p','form-help','Pokémon selector unavailable; your saved featured Pokémon will be preserved.'));
      const teamLabel=element('label','','Featured team (only public teams are shown to visitors)'),teamSelect=element('select');teamSelect.name='featuredTeamId';const none=element('option','','No featured team');none.value='';teamSelect.append(none);for(const t of ctx.teams){const o=element('option','',t.name);o.value=t.id;teamSelect.append(o);}teamSelect.value=s.featuredTeamId||'';teamLabel.append(teamSelect);form.append(teamLabel);
      const save=element('button','action-button','Save public profile settings');save.type='submit';form.append(save);panel.append(form);
      const publicLink=element('div'),preview=element('div','public-preview');panel.append(publicLink,preview);
      const links=enabled=>{publicLink.replaceChildren();publicLink.append(element('p','form-help',enabled?'Your profile is public. Turning it off removes it from the directory and profile URL. Separately shared teams remain public until you switch each team to private.':'Your profile is private. Preview is visible only to you. Separately shared teams keep their own visibility.'));if(enabled)publicLink.append(link('Open my public profile',`trainer/${encodeURIComponent(ctx.user.username)}`));};links(s.enabled);
      const previewButton=button('Preview saved public profile',async()=>{previewButton.disabled=true;try{const {profile}=await ctx.request('/community/preview');if(ctx.currentUserId()===ctx.user.id&&preview.isConnected)await renderProfile(preview,profile,{preview:true});}catch(e){ctx.notice(e.message,true);}finally{previewButton.disabled=false;}});panel.append(previewButton,element('p','form-help','Save changes before previewing. Preview uses exactly the same approved fields as the public profile.'));
      form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const body={featuredPokemonId,featuredTeamId:teamSelect.value?Number(teamSelect.value):null};for(const [key,input]of Object.entries(checks))body[key]=input.checked;const data=await ctx.request('/community/settings',{method:'PUT',body});if(ctx.currentUserId()===ctx.user.id&&panel.isConnected){preview.replaceChildren();links(data.settings.enabled);ctx.notice('Public profile settings saved.');}}catch(e){ctx.notice(e.message,true);}finally{save.disabled=false;}};
    }catch(e){if(panel.isConnected)panel.append(element('p','form-error',e.message),button('Retry sharing settings',()=>{panel.remove();settings(target,ctx);}));}
  }
  async function teamSettings(target,team,ctx) {
    const panel=element('div','team-sharing');panel.append(element('p','form-help','Checking team visibility…'));target.append(panel);
    try{
      let value=await ctx.request(`/teams/${team.id}/visibility`);if(!panel.isConnected)return;
      const label=element('label','','Team visibility'),select=element('select');select.setAttribute('aria-label',`Visibility of ${team.name}`);
      for(const [v,t]of [['private','Private'],['public','Public']]){const o=element('option','',t);o.value=v;select.append(o);}select.value=value.visibility;label.append(select);
      const links=element('div'),status=element('p','form-help');status.setAttribute('role','status');
      const render=()=>{links.replaceChildren();status.textContent=value.visibility==='public'?'This team is public, including its name, lineup and trainer username.':'This team is private.';if(value.visibility==='public'){links.append(link('Open shared team',`team/${value.shareId}`));copyLink(links,`team/${value.shareId}`);}};
      const save=button('Save visibility',async()=>{save.disabled=true;select.disabled=true;try{value=await ctx.request(`/teams/${team.id}/visibility`,{method:'PUT',body:{visibility:select.value}});render();ctx.notice('Team visibility saved.');}catch(e){select.value=value.visibility;ctx.notice(e.message,true);}finally{save.disabled=false;select.disabled=false;}});
      panel.replaceChildren(label,save,status,links);render();
    }catch(e){if(panel.isConnected)panel.replaceChildren(element('p','form-error',e.message));}
  }
  const directoryPokemon=new Map();
  function directoryPokemonLabel(id){const p=directoryPokemon.get(id);return `${number(id)} ${p?prettyName(p.name):'Pokémon'}`;}
  function directoryPokemonArt(id,kind='battle'){
    const p=directoryPokemon.get(id)||{id,name:`Pokémon ${id}`,artwork:`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`};
    return PokemonSprites.create(id,{kind,name:directoryPokemonLabel(id),pokemon:p});
  }
  function directoryCard(t){
    const card=element('article','trainer-panel trainer-card-surface trainer-directory-card');card.dataset.trainer=t.username;
    const style=TrainerCardConfig.normalize(t.decoration);
    const top=element('div','directory-card-top'),avatar=element('span','trainer-avatar avatar-initial directory-avatar');avatar.append(element('span','',t.username[0].toUpperCase()));
    if(t.avatarUrl){const image=element('img');image.src=t.avatarUrl;image.alt=`${t.username}'s public profile picture`;image.loading='lazy';image.addEventListener('error',()=>image.remove(),{once:true});avatar.append(image);}
    const avatarLink=link('',`trainer/${encodeURIComponent(t.username)}`,'directory-avatar-link');avatarLink.setAttribute('aria-label',`View ${t.username}'s public profile`);avatarLink.append(avatar);
    top.append(avatarLink,element('span','directory-card-stamp','TRAINER CARD'));card.append(top);
    const body=element('div','directory-card-body'),identity=element('div','directory-card-identity'),nameRow=element('div','trainer-name-row'),heading=element('h3'),nameLink=link(t.username,`trainer/${encodeURIComponent(t.username)}`,'directory-name-link');TrainerNames.decorate(nameLink,t.staffRole);heading.append(nameLink);nameRow.append(heading);
    if(style.motto)nameRow.append(element('p','trainer-motto-inline',style.motto));identity.append(nameRow);
    const metaRow=element('div','trainer-identity-meta'),staffLabel=TrainerNames.badge(t.staffRole);if(staffLabel)metaRow.append(staffLabel);else TrainerRanks.role(metaRow,'trainer');if(style.title)metaRow.append(element('span','trainer-title-ribbon',style.title));if(t.rank){const rank=element('span','directory-rank');TrainerRanks.render(rank,t.rank,{compact:true});metaRow.append(rank);}identity.append(metaRow);body.append(identity);
    if(t.bio)body.append(t.bioFormat==='limited'?RichBiography.render(element('div','directory-card-bio'),t.bio):element('div','directory-card-bio',t.bio));if(t.bannerUrl)ProfileExtras.banner(card,t.bannerUrl);
    if(t.featuredPokemonId){const partner=element('div','directory-partner');const text=element('div'),name=element('strong','',directoryPokemonLabel(t.featuredPokemonId));name.dataset.publicPokemonName=t.featuredPokemonId;text.append(element('span','eyebrow','FEATURED PARTNER'),name);const art=element('div','directory-partner-art');art.append(directoryPokemonArt(t.featuredPokemonId));partner.append(art,text);body.append(partner);}
    if(t.showcaseTeam){const showcase=element('div','directory-showcase');showcase.append(element('p','',t.showcaseTeam.name));const row=element('div','directory-mini-roster');for(let slot=0;slot<6;slot++){const id=t.showcaseTeam.pokemonIds[slot];if(id){const img=directoryPokemonArt(id,'party');img.title=directoryPokemonLabel(id);row.append(img);}else row.append(element('span','directory-empty-slot','·'));}showcase.append(row);body.append(showcase);}
    const meta=element('div','directory-card-meta');meta.append(element('span','',`${t.publicTeamCount} shared ${t.publicTeamCount===1?'team':'teams'}`));
    if(Number.isFinite(Date.parse(t.createdAt)))meta.append(element('span','',`Joined ${new Intl.DateTimeFormat(undefined,{month:'short',year:'numeric'}).format(new Date(t.createdAt))}`));body.append(meta);
    const actions=element('div','directory-card-actions'),profileLink=link('Meet the trainer',`trainer/${encodeURIComponent(t.username)}`,'action-button directory-profile-link');profileLink.setAttribute('aria-label',`View ${t.username}'s public profile`);actions.append(profileLink);if(t.showcaseTeam)actions.append(link('View team ↗',`team/${t.showcaseTeam.shareId}`));body.append(actions);card.append(body);TrainerDecorations.appearance(card,style);return card;
  }
  function communityMessage(title,copy,{clear,action}={}){
    const box=element('div','community-message');const mark=element('span','community-message-mark','◒');mark.setAttribute('aria-hidden','true');box.append(mark,element('h3','',title),element('p','form-help',copy));if(clear)box.append(button('Clear search',clear));if(action)box.append(link(action.label,action.path,'action-button'));return box;
  }
  async function renderDirectory(target){
    target.replaceChildren();target.removeAttribute('aria-live');document.title='Trainer Community — Dexhaven';
    const heading=element('div','community-directory-heading'),copy=element('div');copy.append(element('p','eyebrow','THE TRAINER DIRECTORY'),element('h2','','A face behind every journey.'));heading.append(copy);
    const form=element('form','community-search'),label=element('label','sr-only','Search trainers by username'),input=element('input');input.id='community-search';input.type='search';input.maxLength=64;input.placeholder='Find a trainer by username…';input.autocomplete='off';label.htmlFor=input.id;
    const submit=element('button','community-search-submit','Search');submit.type='submit';const clear=button('Clear',()=>{input.value='';search();});clear.className='community-search-clear';clear.setAttribute('aria-label','Clear trainer search');clear.hidden=true;form.append(label,input,clear,submit);heading.append(form);target.append(heading);
    const info=element('div','community-directory-info'),count=element('p','form-help','Loading trainers…');count.setAttribute('role','status');info.append(count,element('span','community-public-note','Shared by choice. Discover at your pace.'));target.append(info);
    const list=element('div','community-directory');list.setAttribute('aria-label','Public trainer cards');target.append(list);
    const feedback=element('div','community-directory-feedback'),more=button('Discover more trainers',()=>load(false));more.classList.add('community-load-more');more.hidden=true;target.append(feedback,more);
    let query=new URLSearchParams(location.search).get('q')?.slice(0,64)||'',cursor=null,version=0,controller,timer,total=0;const loaded=new Map();input.value=query;clear.hidden=!query;
    const updateCount=()=>{count.textContent=`${loaded.size} of ${total} ${total===1?'trainer':'trainers'}${query?` matching “${query}”`:''}`;};
    async function load(reset){
      const request=++version;controller?.abort();controller=new AbortController();more.disabled=true;list.setAttribute('aria-busy','true');list.inert=true;feedback.replaceChildren();if(reset){loaded.clear();list.replaceChildren();for(let i=0;i<3;i++){const skeleton=element('div','community-skeleton');skeleton.setAttribute('aria-hidden','true');list.append(skeleton);}}count.textContent=query?'Finding your trainer…':'Discovering trainers…';
      const nextCursor=reset?null:cursor;
      try{
        const params=new URLSearchParams();if(query)params.set('q',query);if(nextCursor!==null)params.set('after',nextCursor);
        const data=await publicRequest(`trainers${params.size?'?'+params:''}`,{signal:controller.signal});if(request!==version||!target.isConnected)return;
        if(!Array.isArray(data.trainers)||!Number.isInteger(data.total)||data.total<0)throw Error('Trainer cards could not be loaded. Please try again.');
        if(reset)list.replaceChildren();
        total=data.total;cursor=data.next;
        for(const trainer of data.trainers)if(!loaded.has(trainer.username.toLowerCase())){loaded.set(trainer.username.toLowerCase(),trainer);list.append(directoryCard(trainer));}
        more.hidden=cursor===null;updateCount();
        if(!loaded.size){list.append(query?communityMessage('No trainer found. Yet.',`We couldn't find a public trainer matching “${query}”. Try another name.`,{clear:()=>{input.value='';search();}}):communityMessage('Every community starts with a first hello.','Make your trainer card, choose what to share, and give the next visitor someone to meet.',{action:{label:'Create your public profile',path:'trainers.html#view=profile'}}));}
      }catch(error){if(request!==version||error.name==='AbortError'||!target.isConnected)return;if(reset)list.replaceChildren();count.textContent=loaded.size?`${loaded.size} trainers ready to explore`:'Trainers are taking a little longer to arrive.';const message=communityMessage('A little pause in the journey.',error.message);message.classList.add('community-error');message.append(button('Try again',()=>load(reset)));feedback.append(message);more.hidden=true;}
      finally{if(request===version){list.setAttribute('aria-busy','false');list.inert=false;more.disabled=false;}}
    }
    function search(){clearTimeout(timer);query=input.value.trim();clear.hidden=!query;const url=new URL(location.href);if(query)url.searchParams.set('q',query);else url.searchParams.delete('q');history.replaceState({},'',url);load(true);}
    input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,250);});form.addEventListener('submit',event=>{event.preventDefault();search();});
    PokemonData.load().then(snapshot=>{for(const p of snapshot.pokemon)directoryPokemon.set(p.id,p);if(target.isConnected)target.querySelectorAll('[data-public-pokemon-name]').forEach(node=>{node.textContent=directoryPokemonLabel(Number(node.dataset.publicPokemonName));});target.querySelectorAll('img[data-sprite-id]').forEach(img=>{img.alt=`${directoryPokemonLabel(Number(img.dataset.spriteId))} ${img.classList.contains('sprite-party')?'party icon':'battle sprite'}`;});}).catch(()=>{/* Trainer cards stay usable when optional species labels cannot load. */});
    await load(true);
  }
  document.querySelectorAll('.community-starter').forEach(img=>img.addEventListener('error',()=>{img.src=new URL('artwork-fallback.svg',root).href;},{once:true}));
  const target=document.querySelector('#community-content');
  async function publicPage(){
    if(!target)return;
    target.replaceChildren(element('p','form-help','Loading shared trainer content…'));DexhavenTeamAnalysis.cleanup();
    try{
      const route=location.pathname.match(/\/(trainer|team)\/([^/]+)\/?$/),params=new URLSearchParams(location.search);
      const trainer=route?.[1]==='trainer'?decodeURIComponent(route[2]):params.get('trainer');
      const teamId=route?.[1]==='team'?decodeURIComponent(route[2]):params.get('team');
      const intro=document.querySelector('#community-intro');if(intro)intro.hidden=Boolean(trainer||teamId);document.body.classList.toggle('community-detail',Boolean(trainer||teamId));
      if(trainer){const {profile}=await publicRequest(`trainers/${encodeURIComponent(trainer)}`);await renderProfile(target,profile);target.prepend(link('← Back to the community','community.html','community-back-link'));document.title=`${profile.username} · Dexhaven`;}
      else if(teamId){const {team}=await publicRequest(`teams/${encodeURIComponent(teamId)}`),records=(await PokemonData.load()).pokemon;target.replaceChildren(link('← Back to the community','community.html','community-back-link'),element('p','eyebrow','SHARED LINEUP'),element('h1','community-team-title',team.name),element('p','form-help',`A team by ${team.username}`));document.title=`${team.name} · Dexhaven`;if(team.profileAvailable)target.append(link(`Visit ${team.username}’s profile`,`trainer/${encodeURIComponent(team.username)}`));copyLink(target,`team/${team.shareId}`);roster(target,team.pokemonIds,records,true,'static');const analysis=element('section');target.append(analysis);await DexhavenTeamAnalysis.render(analysis,team.pokemonIds);}
      else await renderDirectory(target);
    }catch(e){target.replaceChildren(element('h2','','Shared content unavailable'),element('p','form-error',e.message),element('p','form-help','This profile or team may be private, removed, or temporarily unavailable. Public trainer content needs the Express backend; it is unavailable in a static preview.'),button('Try again',publicPage));if(location.pathname!==new URL('community.html',root).pathname||location.search)target.append(link('Back to the community','community.html','community-back-link'));}
  }
  globalThis.DexhavenCommunity={settings,teamSettings,renderProfile};publicPage();
})();
