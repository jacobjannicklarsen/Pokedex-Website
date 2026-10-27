// Curated cosmetics only: no uploaded CSS/HTML or arbitrary image URLs.
(() => {
  'use strict';
  const {defaults,normalize,labels,presets}=TrainerCardConfig;
  function frameAvatar(avatar) {
    if(avatar.parentElement?.classList.contains('avatar-frame'))return avatar.parentElement;
    const frame=element('span','avatar-frame');
    if(avatar.classList.contains('directory-avatar')){avatar.classList.remove('directory-avatar');frame.classList.add('directory-avatar');}
    avatar.replaceWith(frame);frame.append(avatar);return frame;
  }
  function appearance(panel,value) {
    const style=normalize(value);panel.classList.add('trainer-card-surface');
    for(const key of ['palette','pattern','frame','effect','borderStyle','titleStyle'])panel.dataset[key]=style[key];
    for(const [key,variable]of [['accentColor','--card-accent'],['borderColor','--card-border'],['frameColor','--frame-accent']]){
      panel.style.removeProperty(variable);if(style[key])panel.style.setProperty(variable,style[key]);
    }
    panel.querySelectorAll('.trainer-avatar').forEach(frameAvatar);
    panel.querySelector('.card-finish')?.remove();
    if(style.effect!=='none'){
      const layer=element('div','card-finish');layer.setAttribute('aria-hidden','true');
      const count=['sparkles','starfield','particles'].includes(style.effect)?8:0;
      for(let i=0;i<count;i++){
        const mark=element('span','finish-mark');
        if(['sparkles','starfield'].includes(style.effect)){
          const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');
          const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M12 0 15 9 24 12 15 15 12 24 9 15 0 12 9 9Z');svg.append(path);mark.append(svg);
        }
        layer.append(mark);
      }
      panel.prepend(layer);
    }
    return style;
  }
  function badge(award) {
    const node=element('span','showcase-badge');node.dataset.rarity=award.rarity||'bronze';
    const icon=element('span','',award.icon||'✦');icon.setAttribute('aria-hidden','true');
    node.append(icon,element('span','',award.name));node.title=award.description;return node;
  }
  function apply(panel,value=defaults(),badges=[]) {
    value=appearance(panel,value);
    panel.querySelector('.trainer-decoration-copy')?.remove();
    const identity=panel.querySelector('.trainer-identity-copy')||panel.lastElementChild;
    const copy=element('div','trainer-decoration-copy');
    if(value.title)copy.append(element('span','trainer-title-ribbon',value.title));
    if(value.motto)copy.append(element('p','trainer-motto',value.motto));
    const shelf=element('div','trainer-badge-shelf');
    (value.pinnedBadges||[]).forEach(key=>{const award=badges.find(a=>a.key===key);if(award)shelf.append(badge(award));});
    copy.append(shelf);identity.append(copy);
  }
  async function mount(target,identity,ctx) {
    const studio=element('section','trainer-panel decoration-studio');
    studio.append(element('p','eyebrow','MAKE YOUR MARK'),element('h3','','Trainer card studio'),element('p','form-help','Choose a look, write a title and showcase up to three earned badges. These decorations appear on your public card when you enable a public profile. Pinned badges also require achievement sharing.'));
    const loading=element('p','form-help','Loading your saved card…');loading.setAttribute('role','status');studio.append(loading);target.append(studio);
    try {
      const result=await ctx.request('/profile/decorations');if(!studio.isConnected||ctx.currentUserId()!==ctx.user.id)return;
      loading.remove();let saved=normalize(result.decoration),draft=structuredClone(saved);
      apply(identity,saved,result.badges);
      const preview=element('div','trainer-panel public-identity decoration-preview');preview.setAttribute('aria-label','Trainer card decoration preview');
      if(ctx.user.avatarUrl){const img=element('img','trainer-avatar');img.src=ctx.user.avatarUrl;img.alt='Your profile picture';preview.append(img);}else preview.append(element('span','trainer-avatar avatar-initial',ctx.user.username[0].toUpperCase()));
      const copy=element('div','trainer-identity-copy');copy.append(element('p','eyebrow','LIVE PREVIEW'),element('h3','',ctx.user.username));preview.append(copy);studio.append(preview);
      const form=element('form','decoration-form');
      const presetLabel=element('label','','Start with a look'),preset=element('select');preset.name='preset';
      const custom=element('option','','Choose a preset (keeps your title and badges)');custom.value='';preset.append(custom);for(const name of Object.keys(presets)){const option=element('option','',name);option.value=name;preset.append(option);}presetLabel.append(preset);form.append(presetLabel);
      const update=()=>apply(preview,draft,result.badges);
      const sync=()=>form.querySelectorAll('input').forEach(input=>{if(input.type==='radio')input.checked=input.value===draft[input.name];else if(input.type==='checkbox')input.checked=draft.pinnedBadges.includes(input.value);else input.value=draft[input.name]||'';input.removeAttribute('aria-invalid');});
      preset.onchange=()=>{if(!presets[preset.value])return;draft={...draft,...Object.fromEntries(['palette','pattern','frame','effect','borderStyle','titleStyle','accentColor','borderColor','frameColor'].map(key=>[key,defaults()[key]])),...presets[preset.value]};sync();update();};
      for(const [key,values]of Object.entries(result.choices)){
        const field=element('fieldset','decoration-choices');field.append(element('legend','',({palette:'Colour palette',pattern:'Banner background',frame:'Avatar frame',effect:'Finishing touch',borderStyle:'Card border',titleStyle:'Trainer title style'})[key]));
        values.forEach(value=>{
          const label=element('label','decoration-choice');if(key==='palette')label.dataset.palette=value;
          const input=element('input');input.type='radio';input.name=key;input.value=value;input.checked=draft[key]===value;
          const swatch=element('span','decoration-choice-icon',({classic:'○',halo:'◉',double:'◎',laurel:'❧',hexagon:'⬡',orbit:'◌',aurora:'✦',constellation:'✧',grid:'▦',waves:'≈',petals:'❀',plain:'—',none:'—',sparkles:'✧',shimmer:'✦'})[value]||'●');swatch.setAttribute('aria-hidden','true');
          input.onchange=()=>{draft[key]=value;update();};label.append(input,swatch,document.createTextNode(labels[value]||prettyName(value)));field.append(label);
        });form.append(field);
      }
      const colours=element('fieldset','decoration-colours');colours.append(element('legend','','Personal colours (optional)'),element('p','form-help','Use a six-digit hex colour, or leave blank for the selected palette. Text keeps Dexhaven’s readable theme colours.'));
      for(const [key,label]of [['accentColor','Accent and highlights'],['borderColor','Card border colour'],['frameColor','Avatar frame accent']]){
        const field=element('label','',label),input=element('input');input.type='text';input.name=key;input.placeholder='#80e5b8';input.maxLength=7;input.pattern='#[0-9a-fA-F]{6}';input.value=draft[key]||'';
        input.oninput=()=>{const valid=!input.value||TrainerCardConfig.color(input.value);input.setAttribute('aria-invalid',String(!valid));if(valid){draft[key]=input.value||null;update();}};field.append(input);colours.append(field);
      }form.append(colours);
      for(const [key,label,max]of [['title','Trainer title',40],['motto','Trainer motto',120]]){
        const field=element('label','',label),input=element('input');input.name=key;input.maxLength=max;input.value=draft[key];input.placeholder=key==='title'?'e.g. Collector of little legends':'A few words about your journey';
        input.oninput=()=>{draft[key]=input.value;update();};field.append(input);form.append(field);
      }
      const pins=element('fieldset','decoration-pins');pins.append(element('legend','','Badge showcase · up to three earned badges'));
      const pinStatus=element('p','form-help');pinStatus.setAttribute('role','status');
      if(!result.badges.length)pins.append(element('p','form-help','Earn your first achievement to start your showcase. Open Achievements to see your next goals.'));
      result.badges.forEach(award=>{
        const label=element('label','badge-pin-choice'),input=element('input');input.type='checkbox';input.name='pinnedBadges';input.value=award.key;input.checked=draft.pinnedBadges.includes(award.key);
        input.onchange=()=>{const selected=[...pins.querySelectorAll('input:checked')].map(n=>n.value);if(selected.length>3){input.checked=false;pinStatus.textContent='Choose up to three badges. Unpin one to make room.';return;}draft.pinnedBadges=selected;pinStatus.textContent=`${selected.length}/3 badges pinned`;update();};label.append(input,badge(award));pins.append(label);
      });form.append(pins,pinStatus);
      const actions=element('div','team-actions'),save=element('button','action-button','Save decorations');save.type='submit';
      const reset=element('button','text-button','Reset preview');reset.type='button';reset.onclick=()=>{draft=structuredClone(saved);sync();preset.value='';pinStatus.textContent='Preview reset to saved decorations.';update();};
      const message=element('p','form-help');message.setAttribute('role','status');const defaultButton=element('button','text-button','Reset to default');defaultButton.type='button';defaultButton.onclick=()=>{if(JSON.stringify(saved)!==JSON.stringify(defaults())&&!confirm('Reset your card preview to Dexhaven defaults? Your saved card changes only when you save.'))return;draft=defaults();sync();preset.value='';pinStatus.textContent='Default preview ready. Save decorations to apply it.';update();};actions.append(save,reset,defaultButton);form.append(actions,message);studio.append(form);update();
      form.onsubmit=async event=>{
        event.preventDefault();save.disabled=true;reset.disabled=true;defaultButton.disabled=true;form.setAttribute('aria-busy','true');form.querySelectorAll('input,select,fieldset').forEach(node=>{node.disabled=true;});message.className='form-help';message.textContent='Saving decorations…';ctx.notice('Saving trainer decorations…');
        try{const response=await ctx.request('/profile/decorations',{method:'PUT',body:structuredClone(draft)});if(ctx.currentUserId()!==ctx.user.id||!studio.isConnected)return;saved=normalize(response.decoration);draft=structuredClone(saved);sync();update();apply(identity,saved,result.badges);message.className='form-help';message.textContent='Decorations saved. Your profile visibility settings stay in control.';ctx.notice('Trainer decorations saved.');}
        catch(error){message.className='form-error';message.textContent=error.message;if(ctx.currentUserId()===ctx.user.id&&studio.isConnected)ctx.notice(error.message,true);}
        finally{save.disabled=false;reset.disabled=false;defaultButton.disabled=false;form.removeAttribute('aria-busy');form.querySelectorAll('input,select,fieldset').forEach(node=>{node.disabled=false;});}
      };
    }catch(error){loading.remove();if(studio.isConnected){studio.append(element('p','form-error',error.message));const retry=element('button','action-button','Retry decoration studio');retry.type='button';retry.onclick=()=>{studio.remove();mount(target,identity,ctx);};studio.append(retry);}}
  }
  globalThis.TrainerDecorations={apply,appearance,frameAvatar,mount,badge};
})();
