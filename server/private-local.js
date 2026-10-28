'use strict';
// Shared private-media boundary. Enabling one feature does not enable another.
function local(req,config,enabled){
 const socket=req.socket.remoteAddress||'',loopback=socket==='::1'||/^(?:::ffff:)?127\.\d+\.\d+\.\d+$/.test(socket);
 const origin=new URL(config.origin),allowed=new Set(['localhost','127.0.0.1'].map(h=>h+(origin.port?':'+origin.port:'')));
 return enabled===true&&!config.production&&config.host==='127.0.0.1'&&!config.trustProxy&&loopback&&allowed.has(req.get('host')?.toLowerCase())&&(!req.get('origin')||req.get('origin')===config.origin)&&req.get('sec-fetch-site')!=='cross-site';
}
module.exports={local};
