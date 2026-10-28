const {test}=require('node:test'),assert=require('node:assert/strict');
const rank=require('../server/trainer-ranks'),setup=require('./support/app-fixture.cjs');
test('all exact rank thresholds use unique Caught Pokémon and Diamond is the fifth tier',()=>{
 for(const [count,name]of [[0,'Rookie'],[24,'Rookie'],[25,'Bronze'],[99,'Bronze'],[100,'Silver'],[249,'Silver'],[250,'Gold'],[449,'Gold'],[450,'Diamond'],[648,'Diamond'],[649,'Champion']])assert.equal(rank.calculate(count).name,name);
 const bronze=rank.calculate(25);assert.equal(bronze.remaining,75);assert.equal(bronze.progress.current,0);assert.equal(rank.calculate(24).remaining,1);assert.equal(rank.calculate(649).progress.percentage,100);assert.equal(rank.calculate(649).next,null);
 assert.equal(rank.fromCollection([{pokemonId:1,status:'caught'},{pokemonId:1,status:'caught'},{pokemonId:2,status:'seen'},{pokemonId:650,status:'caught'}]).caught,1);
 for(const count of [-1,650,'25',1.5,NaN])assert.throws(()=>rank.calculate(count));assert.ok(!JSON.stringify(rank.nationalV).includes('Platinum'));
});
test('rank updates from server records, is independent of staff role, and respects public progress privacy',async t=>{
 const s=await setup(t),a=await s.register('rank_trainer'),guest=s.client();
 assert.equal((await a.c.call('/api/pokedex')).data.rank.name,'Rookie');
 for(let id=1;id<=25;id++)await a.c.call('/api/pokedex/'+id,{method:'PUT',body:{status:'caught'}});
 assert.equal((await a.c.call('/api/pokedex')).data.rank.name,'Bronze');assert.equal((await a.c.call('/api/auth/session')).data.user.staff.role,'trainer');
 await s.repo.administration.bootstrapOwner(a.user.id);assert.equal((await a.c.call('/api/pokedex')).data.rank.name,'Bronze');
 const defaults=require('../server/community').defaults();await a.c.call('/api/community/settings',{method:'PUT',body:{...defaults,enabled:true}});
 assert.ok(!('rank'in(await guest.call('/api/public/trainers/rank_trainer')).data.profile));assert.ok(!('rank'in(await guest.call('/api/public/trainers')).data.trainers[0]));
 await a.c.call('/api/community/settings',{method:'PUT',body:{...defaults,enabled:true,shareProgress:true}});
 assert.equal((await guest.call('/api/public/trainers/rank_trainer')).data.profile.rank.name,'Bronze');assert.equal((await guest.call('/api/public/trainers')).data.trainers[0].rank.name,'Bronze');
 await a.c.call('/api/pokedex/25',{method:'PUT',body:{status:'seen'}});assert.equal((await a.c.call('/api/pokedex')).data.rank.name,'Rookie');assert.equal((await guest.call('/api/public/trainers/rank_trainer')).data.profile.rank.caught,24);
 assert.equal((await a.c.call('/api/pokedex/1',{method:'PUT',body:{status:'caught',caught:649,rank:'Champion'}})).status,400);
});
