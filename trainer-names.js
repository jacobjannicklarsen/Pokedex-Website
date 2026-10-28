// Cosmetic treatment for backend-projected roles. This never grants permissions.
(() => {
 'use strict';
 const labels={owner:'Owner',administrator:'Administrator',moderator:'Moderator'};
 function decorate(target,role){
  const text=target.textContent;target.dataset.member=text;target.replaceChildren();target.classList.remove('staff-name');delete target.dataset.staffNameRole;
  if(!Object.hasOwn(labels,role)){target.textContent=text;return;}
  target.classList.add('staff-name');target.dataset.staffNameRole=role;
  target.append(element('span','staff-name-text',text));
  const glitter=element('span','staff-name-glitter');glitter.setAttribute('aria-hidden','true');
  for(let i=0;i<4;i++){
   const star=element('span','staff-name-star'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('focusable','false');
   const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d','M10 0 12.5 7.5 20 10 12.5 12.5 10 20 7.5 12.5 0 10 7.5 7.5Z');svg.append(shape);star.append(svg);glitter.append(star);
  }target.append(glitter);
 }
 function badge(role){if(!Object.hasOwn(labels,role))return null;const node=element('span','community-staff-label',labels[role]);node.dataset.staffNameRole=role;node.setAttribute('aria-label',`${labels[role]} staff role`);return node;}
 globalThis.TrainerNames={decorate,badge};
})();
