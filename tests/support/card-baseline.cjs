// One-off pre-fix browser reproduction using the real Studio and directory.
module.exports=async({origin,evaluate,command,waitFor,repo,uploadDir})=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),sharp=require('sharp');
 await waitFor(`document.querySelector('#guest-actions')?.hidden===false`);
 const username=(process.env.QA_STUDIO_ONLY||process.env.QA_PROFILE_ONLY)?'browser_trainer':'baseline_trainer';
 const user=await evaluate(`(async()=>{const auth=await(await fetch('/api/auth/session')).json();return(await(await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrfToken},body:JSON.stringify({username:'${username}',email:'baseline@example.test',password:'baseline secure password'})})).json()).user})()`);
 const filename='12345678-1234-4123-8123-123456789abc.webp';
 fs.mkdirSync(uploadDir,{recursive:true});fs.writeFileSync(path.join(uploadDir,filename),await sharp({create:{width:256,height:256,channels:3,background:'#ee9955'}}).webp().toBuffer());
 await repo.updateAvatar(user.id,filename);
 const d=require('../../server/decorations'),privacy=require('../../server/community');
 await repo.community.saveDecoration(user.id,{...d.defaults(),frame:'hexagon',effect:'sparkles'});
 await repo.community.saveSettings(user.id,{...privacy.defaults(),enabled:true,shareAvatar:true});
 const dir=path.join(os.tmpdir(),process.env.QA_STUDIO_ONLY?'dexhaven-v061-isolated':'dexhaven-v061-baseline');fs.mkdirSync(dir,{recursive:true});
 const findings=[];
 for(const [page,selector]of [['trainers.html#view=profile','.decoration-preview'],['community.html','.trainer-directory-card']]){
  await command('Page.navigate',{url:origin+'/'+page});await waitFor(`document.querySelector('${selector}')?.dataset.frame==='hexagon'`);
  const value=await evaluate(`(()=>{const p=document.querySelector('${selector}'),a=p.querySelector('.trainer-avatar'),s=getComputedStyle(a),fx=getComputedStyle(p,'::after');p.scrollIntoView({behavior:'instant',block:'center'});return{page:location.pathname,avatarTag:a.tagName,avatarClip:s.clipPath,border:s.borderWidth,radius:s.borderRadius,sparkleContent:fx.content,sparkleZ:fx.zIndex,bannerZ:getComputedStyle(p,'::before').zIndex,children:[...a.children].map(n=>n.tagName)}})()`);
  findings.push(value);await new Promise(r=>setTimeout(r,300));
  const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(dir,page.startsWith('trainers')?'studio.png':'directory.png'),Buffer.from(shot.data,'base64'));
 }
 fs.writeFileSync(path.join(dir,'findings.json'),JSON.stringify(findings,null,2));console.log(JSON.stringify({dir,findings},null,2));
};
