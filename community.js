// Public projections and opt-in sharing settings. All text is rendered with textContent.
(() => {
  'use strict';
  const root = new URL('.',document.currentScript.src);
  const link = (label,path,className='text-button') => { const a=element('a',className,label);a.href=new URL(path,root).href;return a; };
  const button = (label,fn) => { const b=element('button','action-button',label);b.type='button';b.onclick=fn;return b; };
  async function publicRequest(path) {
    const response=await fetch(new URL(`api/public/${path}`,root),{credentials:'same-origin',cache:'no-store'});
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
  function pokemonTile(p) {
    const tile=element('a','shared-pokemon');tile.href=new URL(`pokemon.html?pokemon=${p.id}`,root).href;
    tile.append(artwork({...p,artwork:`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.id}.png`}),element('strong','',`${number(p.id)} ${prettyName(p.name)}`),badges(p.types));return tile;
  }
  function roster(container,ids,records,full=false) {
    const grid=element('div','shared-roster');
    const byId=new Map(records.map(p=>[p.id,p]));
    for(let i=0;i<(full?6:ids.length);i++) {
      const p=byId.get(ids[i]);
      if(!p){const empty=element('div','shared-pokemon empty-public-slot',`Slot ${i+1} · Empty`);grid.append(empty);continue;}
      const card=pokemonTile(p);
      if(full)card.append(element('p','form-help',p.stats.map((s,j)=>`${PokemonData.labels[j]} ${s.value}`).join(' · ')));
      grid.append(card);
    }container.append(grid);
  }
  async function renderProfile(target,p,{preview=false}={}) {
    const {records}=await DexhavenTeamAnalysis.load();if(!target.isConnected)return;
    target.replaceChildren();
    const header=element('div','trainer-panel public-identity');
    if(p.avatarUrl){const img=element('img','trainer-avatar');img.src=p.avatarUrl;img.alt=`${p.username}'s public profile picture`;header.append(img);}
    else header.append(element('span','trainer-avatar avatar-initial',p.username[0].toUpperCase()));
    const info=element('div');info.append(element('p','eyebrow',preview?'PUBLIC PROFILE PREVIEW':'DEXHAVEN TRAINER'),element('h2','',p.username),element('p','form-help',`Trainer since ${new Date(p.createdAt).toLocaleDateString()}`));
    if(p.bio)info.append(element('p','profile-biography',p.bio));header.append(info);target.append(header);
    if(!preview)copyLink(target,`trainer/${encodeURIComponent(p.username)}`);
    if(p.featuredPokemonId){target.append(element('h3','','Featured Pokémon'));roster(target,[p.featuredPokemonId],records);}
    target.append(element('h3','','Shared teams'));
    if(!p.teams.length)target.append(element('p','form-help','This trainer has not shared any teams.'));
    const ordered=[...p.teams].sort((a,b)=>Number(b.featured)-Number(a.featured));
    for(const t of ordered){const card=element('article','trainer-panel');card.append(element('h4','',`${t.featured?'★ Featured · ':''}${t.name}`));roster(card,t.pokemonIds,records);card.append(link('View team & analysis',`team/${t.shareId}`,'explore-link'));target.append(card);}
    if(p.favorites){target.append(element('h3','','Shared favourites'));if(p.favorites.length)roster(target,p.favorites,records);else target.append(element('p','form-help','No shared favourites yet.'));}
    if(p.statistics){target.append(element('h3','','Shared Pokédex completion'));const stats=element('div','overview-grid');for(const g of [{name:'National',...p.statistics.national},...p.statistics.generations]){const card=element('article','overview-card');card.append(element('p','',g.name),element('strong','',`${g.caught}/${g.total}`),element('span','',`${g.caughtPercentage.toFixed(2)}% caught · ${g.seen} seen`));stats.append(card);}target.append(stats);}
    if(p.achievements){target.append(element('h3','','Shared achievements'));const list=element('div','achievement-grid');for(const a of p.achievements){const card=element('article','trainer-panel');card.append(element('h4','',a.name),element('p','',a.description),element('p','form-help',`Unlocked ${new Date(a.unlockedAt).toLocaleDateString()}`));list.append(card);}target.append(list);if(!p.achievements.length)target.append(element('p','form-help','No unlocked achievements shared yet.'));}
  }
  async function settings(target,ctx) {
    const panel=element('section','trainer-panel community-settings');panel.append(element('h3','','Your public profile'),element('p','form-help','Your account starts private. Publishing your profile shares your username, joining date, public biography and featured Pokémon. Every optional item below needs your approval. Individual teams have separate visibility controls.'));target.append(panel);
    try {
      const {settings:s}=await ctx.request('/community/settings');if(!panel.isConnected||ctx.currentUserId()!==ctx.user.id)return;
      const form=element('form','account-form');
      const checks={};
      for(const [key,label] of [['enabled','Enable my public profile (also lists me in the trainer directory)'],['shareAvatar','Show my current profile picture publicly'],['shareFavorites','Share my current favourites'],['shareProgress','Share my National and generation completion totals'],['shareAchievements','Share my unlocked achievements']]){
        const l=element('label','privacy-option');const input=element('input');input.type='checkbox';input.name=key;input.checked=s[key];checks[key]=input;l.append(input,document.createTextNode(label));form.append(l);
      }
      const bioLabel=element('label','','Public biography'),bio=element('textarea');bio.name='publicBio';bio.maxLength=500;bio.rows=4;bio.value=s.publicBio;bioLabel.append(bio);form.append(bioLabel);
      let featuredPokemonId=s.featuredPokemonId;
      if(globalThis.PokemonSelector){const selector=PokemonSelector.create({slot:'featured',label:'Featured Pokémon (optional)',selectedId:s.featuredPokemonId,total:649,getPokemon:id=>state.pokemon.get(id),excludedIds:()=>new Set(),formatName:prettyName,makeArtwork:artwork,onChange:id=>{featuredPokemonId=id;}});ctx.trackSelector(selector);form.append(selector.element);}
      else form.append(element('p','form-help','Pokémon selector unavailable; your saved featured Pokémon will be preserved.'));
      const teamLabel=element('label','','Featured team (only public teams are shown to visitors)'),teamSelect=element('select');teamSelect.name='featuredTeamId';const none=element('option','','No featured team');none.value='';teamSelect.append(none);for(const t of ctx.teams){const o=element('option','',t.name);o.value=t.id;teamSelect.append(o);}teamSelect.value=s.featuredTeamId||'';teamLabel.append(teamSelect);form.append(teamLabel);
      const save=element('button','action-button','Save public profile settings');save.type='submit';form.append(save);panel.append(form);
      const publicLink=element('div'),preview=element('div','public-preview');panel.append(publicLink,preview);
      const links=enabled=>{publicLink.replaceChildren();publicLink.append(element('p','form-help',enabled?'Your profile is public. Turning it off removes it from the directory and profile URL. Separately shared teams remain public until you switch each team to private.':'Your profile is private. Preview is visible only to you. Separately shared teams keep their own visibility.'));if(enabled)publicLink.append(link('Open my public profile',`trainer/${encodeURIComponent(ctx.user.username)}`));};links(s.enabled);
      const previewButton=button('Preview saved public profile',async()=>{previewButton.disabled=true;try{const {profile}=await ctx.request('/community/preview');if(ctx.currentUserId()===ctx.user.id&&preview.isConnected)await renderProfile(preview,profile,{preview:true});}catch(e){ctx.notice(e.message,true);}finally{previewButton.disabled=false;}});panel.append(previewButton,element('p','form-help','Save changes before previewing. Preview uses exactly the same approved fields as the public profile.'));
      form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const body={publicBio:bio.value,featuredPokemonId,featuredTeamId:teamSelect.value?Number(teamSelect.value):null};for(const [key,input]of Object.entries(checks))body[key]=input.checked;const data=await ctx.request('/community/settings',{method:'PUT',body});if(ctx.currentUserId()===ctx.user.id&&panel.isConnected){preview.replaceChildren();links(data.settings.enabled);ctx.notice('Public profile settings saved.');}}catch(e){ctx.notice(e.message,true);}finally{save.disabled=false;}};
    }catch(e){if(panel.isConnected)panel.append(element('p','form-error',e.message),button('Retry sharing settings',()=>{panel.remove();settings(target,ctx);}));}
  }
  async function teamSettings(target,team,ctx) {
    const panel=element('div','team-sharing');panel.append(element('p','form-help','Checking team visibility…'));target.append(panel);
    try{
      let value=await ctx.request(`/teams/${team.id}/visibility`);if(!panel.isConnected)return;
      const label=element('label','','Team visibility'),select=element('select');select.setAttribute('aria-label',`Visibility of ${team.name}`);
      for(const [v,t]of [['private','Private · only you'],['public','Public · anyone with the link']]){const o=element('option','',t);o.value=v;select.append(o);}select.value=value.visibility;label.append(select);
      const links=element('div'),status=element('p','form-help');status.setAttribute('role','status');
      const render=()=>{links.replaceChildren();status.textContent=value.visibility==='public'?'This team is public, including its name, lineup and trainer username.':'This team is private.';if(value.visibility==='public'){links.append(link('Open shared team',`team/${value.shareId}`));copyLink(links,`team/${value.shareId}`);}};
      const save=button('Save visibility',async()=>{save.disabled=true;select.disabled=true;try{value=await ctx.request(`/teams/${team.id}/visibility`,{method:'PUT',body:{visibility:select.value}});render();ctx.notice('Team visibility saved.');}catch(e){select.value=value.visibility;ctx.notice(e.message,true);}finally{save.disabled=false;select.disabled=false;}});
      panel.replaceChildren(label,save,status,links);render();
    }catch(e){if(panel.isConnected)panel.replaceChildren(element('p','form-error',e.message));}
  }
  const target=document.querySelector('#community-content');
  async function publicPage(){
    if(!target)return;
    target.replaceChildren(element('p','form-help','Loading shared trainer content…'));DexhavenTeamAnalysis.cleanup();
    try{
      const route=location.pathname.match(/\/(trainer|team)\/([^/]+)\/?$/),params=new URLSearchParams(location.search);
      const trainer=route?.[1]==='trainer'?decodeURIComponent(route[2]):params.get('trainer');
      const teamId=route?.[1]==='team'?decodeURIComponent(route[2]):params.get('team');
      if(trainer){const {profile}=await publicRequest(`trainers/${encodeURIComponent(trainer)}`);await renderProfile(target,profile);document.title=`${profile.username} · Dexhaven`;}
      else if(teamId){const {team}=await publicRequest(`teams/${encodeURIComponent(teamId)}`),{records}=await DexhavenTeamAnalysis.load();target.replaceChildren(element('p','eyebrow','SHARED LINEUP'),element('h2','',team.name),element('p','form-help',`A team by ${team.username}`));document.title=`${team.name} · Dexhaven`;if(team.profileAvailable)target.append(link(`Visit ${team.username}’s profile`,`trainer/${encodeURIComponent(team.username)}`));copyLink(target,`team/${team.shareId}`);roster(target,team.pokemonIds,records,true);const analysis=element('section');target.append(analysis);await DexhavenTeamAnalysis.render(analysis,team.pokemonIds);}
      else{target.replaceChildren(element('h2','','Meet the trainers'),element('p','form-help','Discover trainers who chose to share their profiles. Public teams and profiles require the Express backend. Your private Trainer Hub stays yours.'));const list=element('div','community-directory');target.append(list);let cursor=null;const more=button('Load more trainers',async()=>{more.disabled=true;try{await page();}catch(e){target.append(element('p','form-error',e.message));}finally{more.disabled=false;}});const page=async()=>{const data=await publicRequest(`trainers${cursor===null?'':`?after=${cursor}`}`);for(const t of data.trainers)list.append(link(t.username,`trainer/${encodeURIComponent(t.username)}`,'trainer-panel directory-trainer'));cursor=data.next;more.hidden=cursor===null;if(!list.children.length)list.append(element('p','form-help','No public trainers yet. Your profile stays private until you choose to publish it.'));};await page();target.append(more);}
    }catch(e){target.replaceChildren(element('h2','','Shared content unavailable'),element('p','form-error',e.message),element('p','form-help','This profile or team may be private, removed, or temporarily unavailable. Public trainer content needs the Express backend; it is unavailable in a static preview.'),button('Try again',publicPage),link('Browse public trainers','community.html'));}
  }
  globalThis.DexhavenCommunity={settings,teamSettings,renderProfile};publicPage();
})();
