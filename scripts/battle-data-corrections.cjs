'use strict';
// Explicit corrections to the pinned CSV snapshot, checked against @pkmn/sim 0.10.11's
// historical data. These affect Arena data only; the general National Pokedex is separate.
module.exports=snapshot=>{
 const cryogonal=snapshot.pokemon.find(p=>p.id===615);
 Object.assign(cryogonal.stats,{attack:50,defense:30});
 for(const id of [105,135,156,208,303,355])snapshot.moves.find(m=>m.id===id).pp=10;
 snapshot.moves.find(m=>m.id===295).power=70;
 snapshot.moves.find(m=>m.id===502).priority=1;
 // Hidden Power's variable type/power resolve to Dark/70 with the Arena's fixed 31 IVs.
 Object.assign(snapshot.moves.find(m=>m.id===237),{type:'dark',power:70});
 snapshot.simulator={name:'@pkmn/sim',version:'0.10.11',generation:5};
 snapshot.corrections={cryogonal:'Generation V Attack 50, Defense 30',recoveryPP:'Generation V recovery moves retain 10 base PP',lusterPurge:'Generation V power 70',allySwitch:'Generation V priority +1',hiddenPower:'Dark/70 with fixed 31 IVs'};
 return snapshot;
};
