'use strict';
const {HttpError}=require('./validation');
const levels={trainer:0,moderator:1,administrator:2,owner:3};
const base=['panel.access','overview.read','users.read','restrictions.apply','restrictions.revoke','audit.read','forums.moderate'];
const capabilities={trainer:[],moderator:base,administrator:[...base,'roles.manage','forums.configure'],owner:[...base,'roles.manage','permissions.manage','audit.all','forums.configure']};
function context({role='trainer',permissions=null,roleVersion=0,restriction=null,available=true}={}){
 if(!Object.hasOwn(levels,role))throw new HttpError(503,'Account authorization settings require review.');
 if(typeof permissions==='string'){try{permissions=JSON.parse(permissions);}catch{throw new HttpError(503,'Account authorization settings require review.');}}
 // Invalid persisted overrides fail closed; overrides may only remove capabilities.
 const granted=role==='owner'?capabilities.owner:permissions===null?capabilities[role]:Array.isArray(permissions)?capabilities[role].filter(p=>permissions.includes(p)):[];
 return {available,role,roleVersion:Number(roleVersion),permissions:[...granted],restriction};
}
function requireAccess(access,permission){
 if(!access?.available)throw new HttpError(503,'Administration is unavailable. Review the manual v0.6.2 migration.');
 if(access.restriction){const error=new HttpError(403,'Your account is temporarily suspended.');error.code='ACCOUNT_RESTRICTED';throw error;}
 if(!access.permissions.includes('panel.access')||!access.permissions.includes(permission))throw new HttpError(403,'You do not have permission to use this administrative tool.');
}
const authorize=permission=>(req,res,next)=>{requireAccess(req.staff,permission);next();};
function below(actor,target){return actor.id!==target.id&&levels[actor.role]>levels[target.role]&&target.role!=='owner';}
function actions(actor,target){
 const lower=below(actor,target);
 return {roleOptions:lower&&actor.permissions.includes('roles.manage')?(actor.role==='owner'?['trainer','moderator','administrator']:['trainer','moderator']):[],
  canRestrict:lower&&actor.permissions.includes('restrictions.apply')&&!target.restriction,
  maxHours:actor.role==='moderator'?24:24*30,
  canRevoke:lower&&actor.permissions.includes('restrictions.revoke')&&Boolean(target.restriction)&&(actor.role!=='moderator'||target.restriction.issuedBy===actor.id),
  canPermissions:lower&&actor.role==='owner'&&actor.permissions.includes('permissions.manage')&&target.role!=='trainer',
  allowedPermissions:lower&&actor.role==='owner'?[...capabilities[target.role]]:[]};
}
function change(actor,target,kind,value){
 const permission={role:'roles.manage',permissions:'permissions.manage',suspend:'restrictions.apply',revoke:'restrictions.revoke'}[kind];
 requireAccess(actor,permission);
 if(!below(actor,target))throw new HttpError(403,'You cannot change your own account or an account with equal or higher authority. Owner accounts are protected.');
 const allowed=actions(actor,target);
 if(kind==='role'&&!allowed.roleOptions.includes(value.role))throw new HttpError(403,'That role assignment is not permitted.');
 if(kind==='permissions'&&(!allowed.canPermissions||value.permissions.some(p=>!allowed.allowedPermissions.includes(p))))throw new HttpError(403,'Permissions must stay within the target role.');
 if(kind==='suspend'&&(!allowed.canRestrict||value.hours>allowed.maxHours))throw new HttpError(403,actor.role==='moderator'?'Moderators may suspend ordinary Trainers for at most 24 hours, without extending an active restriction.':'This suspension is not permitted.');
 if(kind==='revoke'&&!allowed.canRevoke)throw new HttpError(403,'You cannot revoke this restriction.');
}
module.exports={levels,capabilities,context,requireAccess,authorize,actions,change};
