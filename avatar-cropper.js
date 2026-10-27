// Local image framing; the original file and validated source-pixel crop go to Express.
(() => {
  'use strict';
  function frame(width,height,zoom=1,cx=width/2,cy=height/2) {
    if(![width,height,zoom,cx,cy].every(Number.isFinite)||width<=0||height<=0)throw Error('Invalid picture dimensions.');
    zoom=Math.max(1,Math.min(4,zoom));const size=Math.min(width,height)/zoom;
    const x=Math.max(0,Math.min(width-size,cx-size/2)),y=Math.max(0,Math.min(height-size,cy-size/2));
    return {width,height,zoom,size,x,y,cx:x+size/2,cy:y+size/2};
  }
  function pan(state,dx,dy,displaySize){if(!Number.isFinite(displaySize)||displaySize<=0)throw Error('Invalid preview size.');return frame(state.width,state.height,state.zoom,state.cx-dx*state.size/displaySize,state.cy-dy*state.size/displaySize);}
  function pixels(state){const size=Math.max(1,Math.round(state.size));return{x:Math.max(0,Math.min(state.width-size,Math.round(state.x))),y:Math.max(0,Math.min(state.height-size,Math.round(state.y))),size};}
  async function decode(file) {
    if(typeof createImageBitmap==='function')try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{/* Older browsers can use the decoded image element. */}
    const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('This picture could not be read.'));reader.readAsDataURL(file);});
    const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('This picture could not be decoded.'));img.src=url;});return img;
  }
  function create({container,onReady,onCancel}) {
    let image=null,currentFile=null,pending=null,state=null,revision=0,destroyed=false,busy=false,drag=null;
    const panel=element('section','avatar-editor');panel.hidden=true;panel.setAttribute('aria-label','Adjust profile picture');
    const help=element('p','form-help','Drag your picture inside the circle, then zoom to frame it. Keyboard: arrow keys move the picture; + and − zoom.');help.id='avatar-framing-help';
    const canvas=element('canvas','avatar-crop-preview');canvas.width=512;canvas.height=512;canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Profile picture crop preview. Drag or use arrow keys to reposition.');canvas.setAttribute('aria-describedby',help.id);
    const zoomLabel=element('label','avatar-zoom','Zoom'),zoom=element('input');zoom.type='range';zoom.min='1';zoom.max='4';zoom.step='.01';zoom.value='1';zoom.setAttribute('aria-label','Profile picture zoom');zoomLabel.append(zoom);
    const status=element('p','form-help');status.setAttribute('role','status');
    const actions=element('div','team-actions'),reset=element('button','text-button','Reset framing'),cancel=element('button','text-button','Cancel picture');reset.type=cancel.type='button';actions.append(reset,cancel);panel.append(help,canvas,zoomLabel,actions,status);container.append(panel);
    const draw=()=>{if(!image||!state||destroyed)return;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,512,512);ctx.drawImage(image,state.x,state.y,state.size,state.size,0,0,512,512);zoom.value=String(state.zoom);zoom.setAttribute('aria-valuetext',`${state.zoom.toFixed(2)} times`);status.textContent=`${Math.round(state.zoom*100)}% zoom. Position: ${Math.round(state.cx/state.width*100)}% across, ${Math.round(state.cy/state.height*100)}% down. Your picture changes only after upload.`;};
    const release=()=>{image?.close?.();image=null;state=null;};
    function clear(){revision++;release();currentFile=null;pending=null;drag=null;canvas.classList.remove('is-dragging');canvas.getContext('2d').clearRect(0,0,512,512);panel.hidden=true;onReady(false);}
    async function load(file){
      if(currentFile===file&&pending)return pending;
      if(currentFile===file&&image)return;
      const ticket=++revision;release();canvas.getContext('2d').clearRect(0,0,512,512);currentFile=file;onReady(false);panel.hidden=false;status.className='form-help';status.textContent='Preparing picture…';
      pending=(async()=>{
        if(!file||file.size>2*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choose a JPEG, PNG or WebP no larger than 2 MB.');
        const decoded=await decode(file);
        if(destroyed||ticket!==revision){decoded.close?.();throw Error('Picture selection changed.');}
        if(decoded.width*decoded.height>16_000_000){decoded.close?.();throw Error('Choose a picture with no more than 16 megapixels.');}
        image=decoded;state=frame(image.width,image.height);draw();onReady(true);
      })().catch(error=>{if(!destroyed&&ticket===revision){status.className='form-error';status.textContent=error.message;onReady(false);}throw error;}).finally(()=>{if(ticket===revision)pending=null;});
      return pending;
    }
    zoom.addEventListener('input',()=>{if(!state||busy)return;state=frame(state.width,state.height,Number(zoom.value),state.cx,state.cy);draw();});
    reset.onclick=()=>{if(image&&!busy){state=frame(image.width,image.height);draw();}};
    cancel.onclick=()=>{if(!busy){clear();onCancel();}};
    canvas.addEventListener('pointerdown',event=>{if(!state||busy||drag||event.button!==0)return;event.preventDefault();canvas.focus();drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);canvas.classList.add('is-dragging');});
    canvas.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId||!state||busy)return;state=pan(state,event.clientX-drag.x,event.clientY-drag.y,canvas.getBoundingClientRect().width);drag.x=event.clientX;drag.y=event.clientY;draw();});
    const endDrag=()=>{drag=null;canvas.classList.remove('is-dragging');};for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,endDrag);
    canvas.addEventListener('keydown',event=>{
      if(!state||busy)return;const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(moves[event.key]){event.preventDefault();const [dx,dy]=moves[event.key],step=(event.shiftKey ? 0.1 : 0.04)*state.size;state=frame(state.width,state.height,state.zoom,state.cx-dx*step,state.cy-dy*step);draw();}
      else if(['+','=','-','_'].includes(event.key)){event.preventDefault();state=frame(state.width,state.height,state.zoom+(['+','='].includes(event.key) ? 0.1 : -0.1),state.cx,state.cy);draw();}
    });
    return {load,clear,getCrop:()=>state?pixels(state):null,setBusy(value){busy=value;zoom.disabled=reset.disabled=cancel.disabled=value;canvas.setAttribute('aria-disabled',String(value));},destroy(){destroyed=true;revision++;release();currentFile=null;pending=null;drag=null;canvas.getContext('2d').clearRect(0,0,512,512);panel.remove();}};
  }
  const api={frame,pan,pixels,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.AvatarCropper=api;
})();
