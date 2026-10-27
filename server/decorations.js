'use strict';
const v=require('./validation');
const config=require('../trainer-card-config');
const {choices,defaults}=config;
function validate(body){
 v.object(body);const keys=Object.keys(defaults()),required=['palette','pattern','frame','effect','title','motto','pinnedBadges'];
 if(Object.keys(body).some(k=>!keys.includes(k))||required.some(k=>!(k in body)))v.fail('Send only the complete decoration settings.');
 const value={...defaults(),...body};
 for(const [key,options]of Object.entries(choices))if(!options.includes(value[key]))v.fail(`Choose a valid ${key}.`);
 for(const key of ['accentColor','borderColor','frameColor'])if(value[key]!==null&&!config.color(value[key]))v.fail('Custom colours must be six-digit hex colours, such as #80e5b8.');
 if(!Array.isArray(value.pinnedBadges)||value.pinnedBadges.length>3||new Set(value.pinnedBadges).size!==value.pinnedBadges.length||value.pinnedBadges.some(key=>typeof key!=='string'||!/^[a-z0-9-]{1,64}$/.test(key)))v.fail('Choose up to three different earned badges.');
 return {...config.normalize(value),title:v.text(value.title,'Trainer title',0,40),motto:v.text(value.motto,'Trainer motto',0,120)};
}
module.exports={choices,defaults,validate,normalize:config.normalize};
