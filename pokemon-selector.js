// Searchable, keyboard-operated team-slot selector. No network requests or dependencies.
(() => {
  'use strict';
  let sequence = 0;
  const normalize = text => String(text).toLowerCase().replace(/[^\p{L}\p{N}♀♂]/gu, '');
  function search(pokemon, query, formatName, limit = 12) {
    const trimmed = query.trim();
    const numeric = /^#?\d+$/.test(trimmed);
    const id = numeric ? Number(trimmed.replace('#', '')) : null;
    const name = normalize(trimmed);
    const matches = pokemon.filter(p => !trimmed || (numeric ? p.id === id : name && (normalize(p.name).includes(name) || normalize(formatName(p.name)).includes(name))));
    return { count: matches.length, items: matches.slice(0, limit) };
  }
  function create({ slot, label: customLabel, selectedId = null, total = 649, getPokemon, excludedIds, formatName, makeArtwork, onChange }) {
    const node = (tag, className, text) => {
      const el = document.createElement(tag);
      if (className) el.className = className;
      if (text !== undefined) el.textContent = text;
      return el;
    };
    const uid = `pokemon-slot-${++sequence}`;
    const root = node('div', 'pokemon-selector');
    const label = node('label', '', customLabel || `Slot ${slot}`); label.htmlFor = uid;
    const input = node('input', 'selector-input');
    input.id = uid; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
    input.placeholder = 'Name or #'; input.maxLength = 80;
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox'); input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', `${uid}-list`); input.setAttribute('aria-describedby', `${uid}-help`);
    const help = node('span', 'sr-only', 'Search by name or National Pokédex number. Arrow keys browse results, Enter selects, Escape cancels. Choose a result to change the slot; typing alone does not change it.');
    help.id = `${uid}-help`;
    const popup = node('div', 'selector-popup'); popup.hidden = true;
    const list = node('ul', 'selector-list'); list.id = `${uid}-list`;
    list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', `Pokémon results for slot ${slot}`);
    const status = node('p', 'selector-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const clear = node('button', 'text-button selector-clear', 'Remove'); clear.type = 'button';
    clear.setAttribute('aria-label', `Remove Pokémon from slot ${slot}`);
    popup.append(list, status); root.append(label, input, help, clear, popup);
    let value = selectedId || null, query = '', open = false, active = -1, results = [];
    const record = id => getPokemon(id) || {
      id, name: `Pokémon ${id}`,
      artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
    };
    const displayValue = () => {
      input.value = value ? `#${String(value).padStart(3, '0')} ${formatName(record(value).name)}` : '';
      clear.hidden = !value;
    };
    function close() {
      open = false; active = -1; popup.hidden = true;
      input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); displayValue();
    }
    function highlight(index) {
      active = index;
      [...list.children].forEach((option, i) => {
        option.setAttribute('aria-selected', String(i === active));
        option.classList.toggle('is-active', i === active);
      });
      if (active >= 0) {
        input.setAttribute('aria-activedescendant', list.children[active].id);
        list.children[active].scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }
    function select(id) {
      if (excludedIds().has(id)) { status.textContent = 'That Pokémon is already in another slot.'; return; }
      value = id; close(); onChange(value);
      input.focus();
    }
    function render(activateFirst = false) {
      const candidates = Array.from({ length: total }, (_, i) => record(i + 1));
      const found = search(candidates, query, formatName);
      const excluded = excludedIds();
      results = found.items.map(p => ({ ...p, disabled: excluded.has(p.id) }));
      list.replaceChildren();
      results.forEach(pokemon => {
        const option = node('li', 'selector-option'); option.id = `${uid}-option-${pokemon.id}`;
        option.dataset.pokemonId = pokemon.id; option.setAttribute('role', 'option');
        option.setAttribute('aria-disabled', String(pokemon.disabled)); option.setAttribute('aria-selected', 'false');
        const image = makeArtwork(pokemon); image.alt = ''; image.setAttribute('aria-hidden', 'true');
        const text = node('span', 'selector-option-text');
        text.append(node('span', 'selector-number', `#${String(pokemon.id).padStart(3, '0')}`), node('span', '', formatName(pokemon.name)));
        if (pokemon.disabled) text.append(node('small', '', 'Already in team'));
        option.append(image, text);
        // Options use virtual focus; pointer selection must keep DOM focus on the input.
        option.addEventListener('pointerdown', event => { if (event.button === 0) event.preventDefault(); });
        option.addEventListener('click', () => select(pokemon.id)); list.append(option);
      });
      status.textContent = !found.count ? 'No Pokémon found.' : `${Math.min(found.count, 12)} of ${found.count} matches${found.count > 12 ? ' — keep typing to narrow the list.' : '.'}`;
      if (results.length && results.every(p => p.disabled)) status.textContent = 'Matching Pokémon already in this team.';
      if (!getPokemon(1)) status.textContent += ' Names are loading; search by number while you wait.';
      open = true; popup.hidden = false; input.setAttribute('aria-expanded', 'true');
      highlight(activateFirst ? results.findIndex(p => !p.disabled) : -1);
    }
    input.addEventListener('focus', () => { query = ''; input.select(); render(); });
    input.addEventListener('click', () => { if (!open) { query = ''; input.select(); render(); } });
    input.addEventListener('input', () => { query = input.value; render(true); });
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!open) { query = ''; render(); }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        let next = active < 0 ? (step === 1 ? 0 : results.length - 1) : active + step;
        while (next >= 0 && next < results.length && results[next].disabled) next += step;
        if (next >= 0 && next < results.length) highlight(next);
      } else if (event.key === 'Enter') {
        // Never submit the whole team form while searching for a slot member.
        event.preventDefault();
        if (open && active >= 0) select(results[active].id);
        else if (open) status.textContent = 'Choose an available result, or press Escape to cancel.';
      } else if (event.key === 'Escape' && open) {
        event.preventDefault(); event.stopPropagation(); close(); input.select();
      } else if (event.key === 'Tab') close();
    });
    root.addEventListener('focusout', event => { if (!root.contains(event.relatedTarget)) close(); });
    clear.addEventListener('click', () => {
      value = null; input.focus(); close(); onChange(null);
    });
    displayValue();
    return {
      element: root, input, get value() { return value; },
      refresh() {
        if (open) {
          const id = results[active]?.id; render();
          const next = results.findIndex(p => p.id === id && !p.disabled); if (next >= 0) highlight(next);
        } else displayValue();
      },
      close
    };
  }
  const api = { search, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.PokemonSelector = api;
})();
