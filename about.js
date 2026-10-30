// Founder portraits always work; only published profiles become links.
(() => {
 'use strict';
 const base=new URL('.',document.currentScript.src);
 async function enhance(link){
  const portrait=link.querySelector('img'),name=portrait.alt,username=link.dataset.founderUsername;
  try{
   const response=await fetch(new URL('api/public/members/'+encodeURIComponent(username),base),{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw new Error('Profile unavailable');
   const profile=await response.json();
   if(!profile.profileAvailable){link.title=name+"'s trainer profile is private.";return;}
   link.href=new URL('trainer/'+encodeURIComponent(username),base).href;
   link.setAttribute('aria-label','View '+name+"'s trainer profile");
   if(profile.avatarUrl){
    const avatar=new Image();
    avatar.onload=()=>{portrait.src=avatar.src;portrait.classList.add('founder-account-avatar');};
    avatar.src=new URL(profile.avatarUrl,base).href;
   }
  }catch{link.title='Trainer profile is currently unavailable.';}
 }
 for(const link of document.querySelectorAll('[data-founder-username]'))enhance(link);
})();
