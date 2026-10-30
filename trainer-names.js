// Cosmetic treatment for backend-projected roles. This never grants permissions.
(() => {
 'use strict';
 const labels={owner:'Owner',administrator:'Administrator',moderator:'Moderator'};
 function icon(role){
  if(!Object.hasOwn(labels,role))return null;
  const mark=element('span','staff-role-icon');mark.dataset.roleIcon=role;mark.setAttribute('aria-hidden','true');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('focusable','false');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',({owner:'M3 6l4 5 5-8 5 8 4-5-2 12H5L3 6Zm3 15h12',administrator:'M10 2h4l1 3 2 1 3-1 2 4-2 2v2l2 2-2 4-3-1-2 1-1 3h-4l-1-3-2-1-3 1-2-4 2-2v-2L2 9l2-4 3 1 2-1 1-3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',moderator:'M5 3h4v4h6V3h4v7l-2 2v6l2 3H5l2-3v-6l-2-2V3Zm5 18v-5h4v5'})[role]);svg.append(path);mark.append(svg);return mark;
 }
 function decorate(target,role){
  const text=target.textContent;target.dataset.member=text;target.replaceChildren();target.classList.remove('staff-name');delete target.dataset.staffNameRole;
  if(!Object.hasOwn(labels,role)){target.textContent=text;return;}
  target.classList.add('staff-name');target.dataset.staffNameRole=role;
  target.append(icon(role),element('span','staff-name-text',text));
  const glitter=element('span','staff-name-glitter');glitter.setAttribute('aria-hidden','true');
  for(let i=0;i<4;i++){
   const star=element('span','staff-name-star'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 20 20');svg.setAttribute('focusable','false');
   const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d','M10 0 12.5 7.5 20 10 12.5 12.5 10 20 7.5 12.5 0 10 7.5 7.5Z');svg.append(shape);star.append(svg);glitter.append(star);
  }target.append(glitter);
 }
 function badge(role){if(!Object.hasOwn(labels,role))return null;const node=element('span','community-staff-label',labels[role]);node.dataset.staffNameRole=role;node.setAttribute('aria-label',`${labels[role]} staff role`);return node;}
 globalThis.TrainerNames={decorate,badge,icon};
})();
