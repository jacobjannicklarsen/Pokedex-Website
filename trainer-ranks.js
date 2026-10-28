// Render server-calculated progression. Staff permissions never come from this module.
(() => {
 const names={rookie:'Rookie',bronze:'Bronze',silver:'Silver',gold:'Gold',diamond:'Diamond',champion:'Champion'};
 function render(target,rank,{compact=false}={}){
  target.replaceChildren();if(!rank||names[rank.key]!==rank.name)return;
  const card=element('details','rank-card');card.dataset.rank=rank.key;card.open=!compact;
  const badge=element('summary','rank-badge',rank.name);badge.title=`${rank.caught}/${rank.total} Pokémon caught${rank.next?` · ${rank.remaining} to ${rank.next.name}`:' · National Pokédex complete'}`;
  const mark=element('span','rank-mark',({rookie:'◇',bronze:'◆',silver:'✧',gold:'✦',diamond:'❖',champion:'♛'})[rank.key]);mark.setAttribute('aria-hidden','true');badge.prepend(mark);
  const copy=element('div','rank-details');copy.append(element('strong','',`${rank.caught} / ${rank.total} Pokémon caught`));
  const progress=element('progress');progress.max=rank.progress.total;progress.value=rank.progress.current;progress.setAttribute('aria-label',rank.next?`Progress toward ${rank.next.name}`:'Champion completion');
  copy.append(progress,element('p','form-help',rank.next?`${rank.remaining} more unique Pokémon to reach ${rank.next.name}.`:`Champion · ${rank.total}-Pokémon milestone complete.`));card.append(badge,copy);target.append(card);
 }
 function updateRole(badge,role){
  const labels={trainer:'Trainer',moderator:'Moderator',administrator:'Administrator',owner:'Owner'};
  badge.textContent=labels[role]||'Trainer';badge.dataset.staffRole=Object.hasOwn(labels,role)?role:'trainer';badge.title='Account role · independent of caught-Pokémon rank';return badge;
 }
 function role(target,role){const badge=updateRole(element('span','staff-badge'),role);target.append(badge);return badge;}
 globalThis.TrainerRanks={render,role,updateRole};
})();
