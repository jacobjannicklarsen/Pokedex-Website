// Opt in only after configuring .env and importing the pokedex_app schema.
// Creates random test users; cleans up only their rows and its own session ID.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
test('real MySQL: constraints, ownership, atomic updates, sharing revocation and session persistence', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async () => {
  const mysql = require('mysql2/promise');
  const argon2 = require('argon2');
  const { configFromEnv } = require('../server/config');
  const { Repository } = require('../server/repository');
  const { MySQLSessionStore } = require('../server/session-store');
  const pool = mysql.createPool(configFromEnv().db);
  const repo = new Repository(pool);const store = new MySQLSessionStore(pool);
  const tag = crypto.randomBytes(6).toString('hex');
  const ids = []; const sid = `integration-${tag}`;
  try {
    const hash = await argon2.hash('integration-test-only-password');
    const alice = await repo.createUser({username:`qa_a_${tag}`,email:`qa_a_${tag}@example.test`},hash);ids.push(alice.id);
    const bob = await repo.createUser({username:`qa_b_${tag}`,email:`qa_b_${tag}@example.test`},hash);ids.push(bob.id);
    const team = await repo.createTeam(alice.id,'Integration team');
    await repo.saveTeam(alice.id,team.id,{name:'Six',pokemonIds:[1,4,7,25,133,151]});
    assert.deepEqual((await repo.teams(alice.id))[0].pokemonIds,[1,4,7,25,133,151]);
    assert.deepEqual(await repo.teams(bob.id),[]);
    await assert.rejects(repo.saveTeam(bob.id,team.id,{name:'Not owned',pokemonIds:[]}),/not found/);
    await assert.rejects(pool.execute('INSERT INTO team_pokemon (team_id,slot,pokemon_id) VALUES (?, ?, ?)',[team.id,7,2]));
    await repo.saveTeam(alice.id,team.id,{name:'One',pokemonIds:[25]});
    await assert.rejects(pool.execute('INSERT INTO team_pokemon (team_id,slot,pokemon_id) VALUES (?, ?, ?)',[team.id,2,25]));
    await assert.rejects(pool.execute('INSERT INTO team_pokemon (team_id,slot,pokemon_id) VALUES (?, ?, ?)',[team.id,2,650]));
    await pool.execute('INSERT INTO team_pokemon (team_id,slot,pokemon_id) VALUES (?, ?, ?)',[team.id,2,649]);
    await assert.rejects(repo.saveTeam(alice.id,team.id,{name:'Should roll back',pokemonIds:[1,1]}));
    assert.deepEqual((await repo.teams(alice.id))[0].pokemonIds,[25,649]);
    await Promise.all([
      repo.saveTeam(alice.id,team.id,{name:'Concurrent A',pokemonIds:[1,4]}),
      repo.saveTeam(alice.id,team.id,{name:'Concurrent B',pokemonIds:[7,25]})
    ]);
    const final = (await repo.teams(alice.id))[0];
    assert.ok([[1,4],[7,25]].some(ids=>JSON.stringify(ids)===JSON.stringify(final.pokemonIds)));
    await repo.favorite(alice.id,25,true);await repo.favorite(alice.id,25,true);
    assert.deepEqual(await repo.favorites(alice.id),[25]);assert.deepEqual(await repo.favorites(bob.id),[]);
    await repo.favorite(alice.id,649,true);assert.deepEqual(await repo.favorites(alice.id),[25,649]);
    await assert.rejects(repo.favorite(alice.id,650,true));
    // Requires the manually reviewed v0.6.0 schema. Never creates/migrates tables.
    const community = require('../server/community');
    assert.deepEqual(await repo.community.settings(alice.id), community.defaults());
    assert.equal(await repo.community.findTrainer(alice.username), null);
    assert.deepEqual(await repo.community.teamSettings(alice.id,team.id), {visibility:'private',shareId:null});
    await assert.rejects(repo.community.share(bob.id,team.id,'public'),/not found/);
    await assert.rejects(repo.community.saveSettings(bob.id,{...community.defaults(),featuredTeamId:team.id}),/not found/);
    await repo.community.saveSettings(alice.id,{...community.defaults(),enabled:true,shareProgress:true,publicBio:'Public integration biography',featuredTeamId:team.id});
    const sharing = await repo.community.share(alice.id,team.id,'public');
    const reopenedRepo = new Repository(pool);
    assert.equal((await reopenedRepo.community.settings(alice.id)).enabled,true);
    assert.equal((await reopenedRepo.community.publicTeam(sharing.shareId)).username,alice.username);
    assert.deepEqual((await reopenedRepo.community.publicTeam(sharing.shareId)).pokemonIds,final.pokemonIds);
    await repo.progression.set(alice.id,6,'caught');
    assert.equal((await repo.community.publicProgress(alice.id)).statistics.national.caught,1);
    const projection=await community.profile(repo,alice,await repo.community.settings(alice.id));
    assert.equal(projection.statistics.national.caught,1);assert.ok(!('collection'in projection));assert.ok(!('email'in projection));
    await assert.rejects(pool.execute('UPDATE trainer_public_settings SET enabled = 2 WHERE user_id = ?',[alice.id]));
    await repo.community.share(alice.id,team.id,'private');
    await assert.rejects(repo.community.publicTeam(sharing.shareId),/unavailable/);
    assert.equal((await community.profile(repo,alice,await repo.community.settings(alice.id))).featuredTeamId,null);
    await repo.community.saveSettings(alice.id,community.defaults());
    assert.equal(await repo.community.findTrainer(alice.username),null);
    await new Promise((resolve,reject)=>store.set(sid,{userId:alice.id,cookie:{expires:new Date(Date.now()+60000)}},e=>e?reject(e):resolve()));
    const reopened = new MySQLSessionStore(pool);
    const data = await new Promise((resolve,reject)=>reopened.get(sid,(e,data)=>e?reject(e):resolve(data)));
    assert.equal(data.userId,alice.id);
    await repo.deleteTeam(alice.id,team.id);
    assert.deepEqual(await repo.teams(alice.id),[]);
    const [remainingMembers]=await pool.execute('SELECT pokemon_id FROM team_pokemon WHERE team_id = ?',[team.id]);
    assert.deepEqual(remainingMembers,[]);
    const [remainingSharing]=await pool.execute('SELECT team_id FROM team_sharing WHERE team_id = ?',[team.id]);assert.deepEqual(remainingSharing,[]);
    await assert.rejects(repo.deleteTeam(alice.id,team.id),/not found/);
  } finally {
    try {
      await pool.execute('DELETE FROM sessions WHERE sid = ?',[sid]);
      for(const id of ids)await pool.execute('DELETE FROM users WHERE id = ?',[id]);
    } finally { await pool.end(); }
  }
});
