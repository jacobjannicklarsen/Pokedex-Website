'use strict';
const v=require('./validation'),{capabilities}=require('./authorization');
function exact(body,keys){v.object(body);if(Object.keys(body).length!==keys.length||keys.some(k=>!Object.hasOwn(body,k)))v.fail('Send only the required administrative fields.');}
function version(value){if(!Number.isSafeInteger(value)||value<0)v.fail('Include the current role version.');return value;}
function mutation(kind,body){
 const keys={role:['role','version','reason'],permissions:['permissions','version','reason'],password:['currentPassword','newPassword','version','reason'],suspend:['hours','version','reason'],revoke:['restrictionId','version','reason']}[kind];exact(body,keys);
 const result={version:version(body.version),reason:v.text(body.reason,'Reason',5,300)};
 if(kind==='password'){result.currentPassword=v.text(body.currentPassword,'Your current password',1,128,false);result.newPassword=v.text(body.newPassword,'New password',12,128,false);}
 if(kind==='role'){if(!['trainer','moderator','administrator'].includes(body.role))v.fail('Choose Trainer, Moderator or Administrator.');result.role=body.role;}
 if(kind==='permissions'){if(!Array.isArray(body.permissions)||new Set(body.permissions).size!==body.permissions.length||body.permissions.some(p=>typeof p!=='string'||!capabilities.owner.includes(p)))v.fail('Choose valid, distinct permissions.');result.permissions=[...body.permissions];}
 if(kind==='suspend'){if(!Number.isInteger(body.hours)||body.hours<1||body.hours>720)v.fail('Choose a suspension lasting 1 to 720 hours.');result.hours=body.hours;}
 if(kind==='revoke')result.restrictionId=v.id(body.restrictionId);
 return result;
}
module.exports={mutation};
