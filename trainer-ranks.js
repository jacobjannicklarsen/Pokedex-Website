// Shared click-to-toggle rank details. Progress and authority stay server-calculated.
(() => {
 'use strict';
 const names={rookie:'Rookie',bronze:'Bronze',silver:'Silver',gold:'Gold',diamond:'Diamond',champion:'Champion'};
 let active=null,sequence=0,observer;
 function close(restoreFocus=false){
  if(!active)return;const current=active;active=null;observer?.disconnect();current.badge.setAttribute('aria-expanded','false');current.panel.remove();if(restoreFocus&&current.badge.isConnected)current.badge.focus({preventScroll:true});
 }
 function position(){
  if(!active)return;const {badge,panel}=active;if(!badge.isConnected){close();return;}
  const rect=badge.getBoundingClientRect(),width=document.documentElement.clientWidth,height=innerHeight;
  if(rect.bottom<0||rect.top>height){close();return;}
  panel.style.width=Math.max(0,Math.min(320,width-24))+'px';panel.style.maxHeight=Math.max(0,height-24)+'px';
  const box=panel.getBoundingClientRect();let top=rect.bottom+8;if(top+box.height>height-12)top=rect.top-box.height-8;
  panel.style.left=Math.max(12,Math.min(rect.left,width-box.width-12))+'px';panel.style.top=Math.max(12,Math.min(top,height-box.height-12))+'px';
 }
 function open(badge,card,rank,id){
  if(active?.badge===badge){close(true);return;}close();
  const panel=element('div','rank-details rank-popover');panel.id=id;panel.tabIndex=-1;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby',id+'-title');panel.style.setProperty('--rank-colour',getComputedStyle(card).getPropertyValue('--rank-colour'));
  const header=element('div','rank-popover-header'),heading=element('h2','',rank.name+' trainer rank'),dismiss=element('button','rank-popover-close','\u00d7');heading.id=id+'-title';dismiss.type='button';dismiss.setAttribute('aria-label','Close rank details');dismiss.onclick=()=>close(true);header.append(heading,dismiss);
  const count=element('strong','rank-popover-count',rank.caught+' / '+rank.total+' Pok\u00e9mon caught'),progress=element('progress');progress.max=rank.progress.total;progress.value=rank.progress.current;progress.setAttribute('aria-label',rank.next?'Progress toward '+rank.next.name:'Champion completion');
  panel.append(header,count,progress,element('p','form-help',rank.next?rank.remaining+' more unique Pok\u00e9mon to reach '+rank.next.name+'.':'Champion \u00b7 '+rank.total+'-Pok\u00e9mon milestone complete.'));
  active={badge,panel};badge.setAttribute('aria-expanded','true');document.body.append(panel);position();
  if(!active)return;panel.focus({preventScroll:true});observer=new MutationObserver(()=>{if(active&&!active.badge.isConnected)close();});observer.observe(document.body,{childList:true,subtree:true});
 }
 function render(target,rank){
  if(active&&target.contains(active.badge))close();target.replaceChildren();if(!rank||names[rank.key]!==rank.name)return;
  const card=element('span','rank-card');card.dataset.rank=rank.key;
  const badge=element('button','rank-badge',rank.name),id='trainer-rank-details-'+(++sequence);badge.type='button';badge.setAttribute('aria-expanded','false');badge.setAttribute('aria-haspopup','dialog');badge.setAttribute('aria-controls',id);badge.setAttribute('aria-label',rank.name+' trainer rank details');
  const mark=element('span','rank-mark',({rookie:'\u25c7',bronze:'\u25c6',silver:'\u2727',gold:'\u2726',diamond:'\u2756',champion:'\u265b'})[rank.key]);mark.setAttribute('aria-hidden','true');badge.prepend(mark);badge.onclick=()=>open(badge,card,rank,id);card.append(badge);target.append(card);
 }
 document.addEventListener('pointerdown',event=>{if(active&&!active.badge.contains(event.target)&&!active.panel.contains(event.target))close();});
 document.addEventListener('click',event=>{if(active&&!active.badge.contains(event.target)&&!active.panel.contains(event.target))close();});
 document.addEventListener('focusin',event=>{if(active&&!active.badge.contains(event.target)&&!active.panel.contains(event.target))close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();event.stopPropagation();close(true);}});
 document.addEventListener('scroll',position,{capture:true,passive:true});addEventListener('resize',position);addEventListener('pagehide',()=>close());addEventListener('hashchange',()=>close());addEventListener('dexhaven:session',()=>close());
 function updateRole(badge,role){
  const labels={trainer:'Trainer',moderator:'Moderator',administrator:'Administrator',owner:'Owner'};
  badge.textContent=labels[role]||'Trainer';badge.dataset.staffRole=Object.hasOwn(labels,role)?role:'trainer';badge.title='Account role · independent of caught-Pokémon rank';return badge;
 }
 function role(target,role){const badge=updateRole(element('span','staff-badge'),role);target.append(badge);return badge;}
 globalThis.TrainerRanks={render,role,updateRole};
})();
