const {test}=require('node:test');
const assert=require('node:assert/strict');
const cropper=require('../avatar-cropper');
const {avatarCrop}=require('../server/validation');
test('avatar framing covers portrait and landscape images without empty space at every zoom',()=>{
 for(const [w,h]of [[600,300],[300,600],[512,512],[1,1],[4031,3023]])for(const zoom of [1,1.75,4,20]){
  const state=cropper.frame(w,h,zoom),crop=cropper.pixels(state);
  assert.ok(crop.size>=1&&crop.x>=0&&crop.y>=0&&crop.x+crop.size<=w&&crop.y+crop.size<=h);
  assert.equal(state.zoom,Math.min(4,zoom));assert.deepEqual(avatarCrop(JSON.stringify(crop),w,h),{left:crop.x,top:crop.y,width:crop.size,height:crop.size});
 }
 assert.deepEqual(cropper.pixels(cropper.frame(600,300)),{x:150,y:0,size:300});
 assert.deepEqual(cropper.pixels(cropper.frame(300,600)),{x:0,y:150,size:300});
});
test('dragging moves the photo with the pointer, zoom keeps the crop centre, and boundaries clamp',()=>{
 const original=cropper.frame(600,300,2),right=cropper.pan(original,160,0,320),up=cropper.pan(original,0,-160,320);
 assert.equal(right.cx,original.cx-75);assert.equal(up.cy,original.cy+75);
 const boundary=cropper.pan(original,99999,-99999,320);assert.equal(boundary.x,0);assert.equal(boundary.y,150);
 const zoom=cropper.frame(600,300,3,original.cx,original.cy);assert.equal(zoom.cx,original.cx);assert.equal(zoom.cy,original.cy);
 assert.throws(()=>cropper.pan(original,1,1,0));assert.throws(()=>cropper.frame(0,100));
});
test('server rejects malformed, forged and out-of-bounds crop metadata',()=>{
 assert.equal(avatarCrop(undefined,600,300),null);
 for(const value of ['bad','null','[]','{}',...[
  {x:0,y:0,size:0},{x:-1,y:0,size:10},{x:590,y:0,size:20},{x:0,y:290,size:20},{x:.5,y:0,size:10},{x:0,y:0,size:10,userId:2},{x:'0',y:0,size:10}
 ].map(JSON.stringify)])assert.throws(()=>avatarCrop(value,600,300),error=>error.status===400);
});
