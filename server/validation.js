'use strict';
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (message) => { throw new HttpError(400, message); };
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('A JSON object is required.'); return value; }
function text(value, name, min, max, trim = true) {
  if (typeof value !== 'string') fail(`${name} must be text.`);
  const result = trim ? value.trim() : value;
  if (result.length < min || result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) fail(`${name} must contain ${min}–${max} characters.`);
  return result;
}
function id(value, max = 4294967295) {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) value = Number(value);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail('Invalid identifier.');
  return value;
}
function registration(body) {
  object(body);
  const username = text(body.username, 'Username', 3, 24);
  if (!/^[a-zA-Z0-9_]+$/.test(username)) fail('Username can contain letters, numbers and underscores only.');
  const email = text(body.email, 'Email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
  return { username, email, password: text(body.password, 'Password', 12, 128, false) };
}
function login(body) {
  object(body);
  return { identifier: text(body.identifier, 'Username or email', 1, 254), password: text(body.password, 'Password', 1, 128, false) };
}
function team(body, includeMembers = true) {
  object(body);
  const name = text(body.name, 'Team name', 1, 60);
  if (!includeMembers) return { name };
  if (!Array.isArray(body.pokemonIds) || body.pokemonIds.length > 6) fail('A team can have up to six Pokémon.');
  const pokemonIds = body.pokemonIds.map(value => { if (typeof value !== 'number') fail('Pokémon IDs must be numbers.'); return id(value, 649); });
  if (new Set(pokemonIds).size !== pokemonIds.length) fail('A team cannot contain duplicate Pokémon.');
  return { name, pokemonIds };
}
function collectionStatus(body) {
  object(body);
  if (Object.keys(body).some(key => key !== 'status') || !['seen', 'caught'].includes(body.status)) fail('Choose a Seen or Caught status. Use DELETE to remove a registration.');
  return body.status;
}
module.exports = { HttpError, fail, object, text, id, registration, login, team, collectionStatus };
