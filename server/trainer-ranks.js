'use strict';
// Explicit, versioned schemes prevent a future generation from silently moving milestones.
const nationalV={key:'national-i-v',total:649,tiers:[['rookie','Rookie',0],['bronze','Bronze',25],['silver','Silver',100],['gold','Gold',250],['diamond','Diamond',450],['champion','Champion',649]]};
function calculate(caught,scheme=nationalV){
 if(!Number.isInteger(caught)||caught<0||caught>scheme.total)throw new RangeError('Caught count is outside this rank scheme.');
 const index=scheme.tiers.findLastIndex(t=>caught>=t[2]),[key,name,minimum]=scheme.tiers[index],nextTier=scheme.tiers[index+1];
 const next=nextTier?{key:nextTier[0],name:nextTier[1],at:nextTier[2]}:null;
 const current=next?caught-minimum:scheme.total,total=next?next.at-minimum:scheme.total;
 return {scheme:scheme.key,key,name,caught,total:scheme.total,minimum,next,remaining:next?next.at-caught:0,progress:{current,total,percentage:current*100/total},completed:!next};
}
function fromCollection(collection){return calculate(new Set(collection.filter(r=>Number.isInteger(r.pokemonId)&&r.pokemonId>=1&&r.pokemonId<=nationalV.total&&(r.status==='caught'||r.caughtAt)).map(r=>r.pokemonId)).size);}
module.exports={nationalV,calculate,fromCollection};
