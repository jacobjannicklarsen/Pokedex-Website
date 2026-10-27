// Enhances the existing shared dialog; extensive sections load only on activation.
(() => {
  'use strict';
  const data = globalThis.PokemonEncyclopediaData;
  const text = value => value === null || value === undefined || value === '' ? 'Not recorded' : String(value);
  const button = (label, callback, className = 'text-button') => { const node = element('button', className, label); node.type = 'button'; node.addEventListener('click', callback); return node; };
  const labelControl = (label, control) => { const node = element('label', 'encyclopedia-control', label); node.append(control); return node; };
  function option(value, label) { const node = element('option', '', label); node.value = value; return node; }
  function table(headers, rows, caption) {
    const node = element('table', 'analytics-table'); node.append(element('caption', 'sr-only', caption));
    const head = element('thead'), tr = element('tr');
    headers.forEach(label => { const cell = element('th', '', label); cell.scope = 'col'; tr.append(cell); }); head.append(tr); node.append(head);
    const body = element('tbody'); rows.forEach(values => { const row = element('tr'); values.forEach((value, i) => { const cell = element(i ? 'td' : 'th'); if (!i) cell.scope = 'row'; if (value instanceof Node) cell.append(value); else cell.textContent = text(value); row.append(cell); }); body.append(row); }); node.append(body);
    const wrap = element('div', 'table-scroll'); wrap.tabIndex = 0; wrap.append(node); return wrap;
  }
  function facts(items) {
    const node = element('dl', 'encyclopedia-facts');
    items.forEach(([label, value]) => { const group = element('div'); group.append(element('dt', '', label), element('dd', '', text(value))); node.append(group); }); return node;
  }
  function enhance(content, pokemon) {
    const hero = content.querySelector('.detail-hero'), overview = content.querySelector('.detail-body');
    if (!hero || !overview) return;
    const controls = content.querySelector('.detail-account-actions');
    const current = () => dialog.open && content.contains(overview);
    const statsPanel = element('section', 'encyclopedia-panel');
    statsPanel.append(element('h3', '', 'Base Stats'), element('p', 'form-help', 'Modern base stats. These can differ from historical game-specific values.'));
    [...overview.querySelectorAll('.stat,.stat-total')].forEach(node => statsPanel.append(node));
    [...overview.querySelectorAll('h3')].find(node => node.textContent === 'Base stats')?.remove();
    const sections = new Map([['overview', { label: 'Overview', panel: overview }], ['stats', { label: 'Base Stats', panel: statsPanel }],
      ...[['evolutions', 'Evolutions'], ['moves', 'Moves'], ['matchups', 'Type Matchups'], ['species', 'Pokédex Information']].map(([name, label]) => [name, { label, panel: element('section', 'encyclopedia-panel') }])]);
    const nav = element('nav', 'detail-navigation'); nav.setAttribute('aria-label', 'Pokémon navigation');
    const visit = id => showDetails(state.pokemon.get(id) || { id, name: `Pokémon ${id}` }, { focusHeading: true });
    const previous = button('← Previous', () => visit(pokemon.id - 1)); previous.disabled = pokemon.id <= 1;
    const next = button('Next →', () => visit(pokemon.id + 1)); next.disabled = pokemon.id >= TOTAL;
    const share = element('a', 'text-button', 'Shareable entry');
    const url = new URL('pokemon.html', new URL('.', document.querySelector('script[src$="encyclopedia.js"]').src)); url.searchParams.set('pokemon', pokemon.id); share.href = url.href;
    nav.append(previous, share, next);
    const tabs = element('div', 'detail-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Pokémon detail sections');
    function activate(name, focus = false) {
      sections.forEach((section, key) => { const selected = key === name; section.panel.hidden = !selected; section.tab.setAttribute('aria-selected', String(selected)); section.tab.tabIndex = selected ? 0 : -1; });
      const section = sections.get(name); if (focus) section.tab.focus();
      if (section.load && !section.loaded && !section.loading) loadSection(section);
    }
    async function loadSection(section) {
      section.loading = true; section.panel.replaceChildren(element('p', 'load-status', `Loading ${section.label.toLowerCase()}…`)); section.panel.setAttribute('aria-busy', 'true');
      try { await section.load(section.panel); if (current()) section.loaded = true; }
      catch { if (current()) section.panel.replaceChildren(element('p', 'notice', `${section.label} could not be loaded. Check your connection and try again.`), button(`Retry ${section.label}`, () => loadSection(section), 'action-button')); }
      finally { section.loading = false; section.panel.setAttribute('aria-busy', 'false'); }
    }
    sections.get('evolutions').load = async panel => {
      const species = await data.get('pokemon-species', pokemon.id);
      const id = data.resourceId(species.evolution_chain?.url, 'evolution-chain');
      if (!id) { if (current()) panel.replaceChildren(element('p', 'form-help', 'Evolution information is not recorded for this species.')); return; }
      const chain = await data.get('evolution-chain', id);
      if (!current()) return;
      const tree = element('ul', 'evolution-tree'); tree.setAttribute('aria-label', 'Complete species evolution family');
      function branch(link) {
        const item = element('li'), speciesId = data.resourceId(link.species.url, 'pokemon-species');
        if (link.evolution_details.length) {
          const requirements = element('ul', 'evolution-requirements');
          link.evolution_details.forEach(detail => { const info = data.requirements(detail); requirements.append(element('li', '', `${info.text}${info.version ? ` (${info.version})` : ''}`)); });
          item.append(requirements);
        }
        const supported = speciesId >= 1 && speciesId <= TOTAL;
        const card = supported ? button('', () => visit(speciesId), 'evolution-card') : element('div', 'evolution-card evolution-unsupported');
        if (speciesId === pokemon.id) card.setAttribute('aria-current', 'true');
        card.dataset.speciesId = speciesId;
        card.append(artwork({ id: speciesId, name: link.species.name, artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${speciesId}.png` }), element('strong', '', `${number(speciesId)} ${prettyName(link.species.name)}`));
        if (!supported) card.append(element('small', '', 'Beyond #649 · reference only'));
        item.append(card);
        if (link.evolves_to.length) { const children = element('ul'); link.evolves_to.forEach(child => children.append(branch(child))); item.append(children); }
        return item;
      }
      tree.append(branch(chain.chain));
      panel.replaceChildren(element('h3', '', 'Evolution family'), element('p', 'form-help', 'Full species relationships from PokéAPI, including later generations. Alternative requirements are listed separately and labelled by game group when supplied. Form-specific or structured special conditions are shown as recorded; they may not apply in every game.'), tree);
      if (!chain.chain.evolves_to.length) panel.append(element('p', 'form-help', 'This species has no recorded evolutions.'));
    };
    sections.get('matchups').load = async panel => {
      const resources = await Promise.all(pokemon.types.map(type => data.get('type', type)));
      if (!current()) return;
      const result = data.matchups(pokemon.types, resources, Object.keys(TYPE_COLORS));
      const multiplier = value => `${value}×`;
      const typeLabel = type => badges([type]);
      const defense = Object.entries(result.defense).sort(([a, av], [b, bv]) => bv - av || a.localeCompare(b));
      panel.replaceChildren(element('h3', '', 'Defensive matchups'), element('p', 'form-help', 'Modern type chart (Generation VI onward), using the displayed current types. Historical Generation I–V rules differ. Abilities, items, weather and special battle effects are not applied.'), table(['Attacking type', 'Damage', 'Matchup'], defense.map(([type, value]) => [typeLabel(type), multiplier(value), value === 0 ? 'Immune' : value > 1 ? 'Weakness' : value < 1 ? 'Resistance' : 'Neutral']), 'Defensive damage multipliers'));
      panel.append(element('h3', '', 'Offensive type effectiveness'), element('p', 'form-help', 'Each of this Pokémon’s types attacking a single defending type. This is type-based effectiveness, not coverage of its actual moveset; dual-type opponents require combining their defenses.'));
      Object.entries(result.offense).forEach(([type, relations]) => { panel.append(element('h4', '', `${prettyName(type)} attacks`), table(['Defending type', 'Damage'], Object.entries(relations).map(([target, value]) => [typeLabel(target), multiplier(value)]), `${prettyName(type)} offensive effectiveness`)); });
    };
    sections.get('species').load = async panel => {
      const [species, raw] = await Promise.all([data.get('pokemon-species', pokemon.id), data.get('pokemon', pokemon.id)]);
      if (!current()) return;
      const generation = GENERATIONS.find(g => g.id !== 'all' && pokemon.id >= g.start && pokemon.id <= g.end);
      const category = species.genera?.find(entry => entry.language?.name === 'en')?.genus;
      const classification = species.is_mythical === true ? 'Mythical' : species.is_legendary === true ? 'Legendary' : species.is_legendary === false && species.is_mythical === false ? 'Neither legendary nor mythical' : null;
      panel.replaceChildren(element('h3', '', 'Species information'), facts([
        ['National Pokédex', number(pokemon.id)], ['Name', prettyName(pokemon.name)], ['Introduced', generation?.label], ['Classification', category],
        ['Height', `${pokemon.height / 10} m`], ['Weight', `${pokemon.weight / 10} kg`], ['Abilities', pokemon.abilities.map(a => `${prettyName(a.name)}${a.hidden ? ' (hidden)' : ''}`).join(', ')],
        ['Base experience', raw.base_experience], ['Capture rate (0–255)', species.capture_rate], ['Base friendship', species.base_happiness], ['Growth rate', species.growth_rate?.name ? prettyName(species.growth_rate.name) : null],
        ['Egg groups', species.egg_groups?.length ? species.egg_groups.map(g => prettyName(g.name)).join(', ') : null], ['Gender ratio', data.gender(species.gender_rate)], ['Habitat', species.habitat?.name ? prettyName(species.habitat.name) : null], ['Special classification', classification]
      ]), element('p', 'form-help', 'Experience, friendship and capture values are the currently recorded PokéAPI values; they are not guaranteed to match every historical game.'));
      const entries = data.descriptions(species);
      panel.append(element('h3', '', 'English Pokédex entry'));
      if (!entries.length) { panel.append(element('p', 'form-help', 'No English Pokédex descriptions are recorded.')); return; }
      const select = element('select'); select.id = 'entry-version';
      entries.forEach((entry, index) => select.append(option(String(index), `${prettyName(entry.game)}${entries.filter(e => e.game === entry.game).length > 1 ? ` · entry ${index + 1}` : ''}`)));
      const description = element('blockquote', 'pokedex-description'); description.id = 'pokedex-description'; description.setAttribute('aria-live', 'polite');
      const update = () => { description.textContent = entries[Number(select.value)]?.text || ''; };
      select.addEventListener('change', update); select.value = '0'; update(); panel.append(labelControl('English game entry', select), description);
    };
    sections.get('moves').load = async panel => {
      const raw = await data.get('pokemon', pokemon.id);
      if (!current()) return;
      panel.replaceChildren(element('h3', '', 'Game-specific learnset'), element('p', 'form-help', 'Choose one game group from Generations I–V. Learn methods are never merged across games. Power, accuracy, PP and type use PokéAPI historical changes when recorded; Generations I–III use the type-based Physical/Special split. Historical metadata can have gaps. A dash means no fixed/applicable value or level was recorded.'));
      const groups = data.versionGroups.filter(g => raw.moves.some(m => m.version_group_details.some(d => d.version_group?.name === g.name)));
      if (!groups.length) { panel.append(element('p', 'form-help', 'No learnset is recorded for supported Generation I–V game groups. Later-game learnsets are outside this version’s scope.')); return; }
      const filters = element('div', 'move-controls');
      const version = element('select'); version.id = 'moves-version'; groups.forEach(g => version.append(option(g.name, `${g.label} · Gen ${g.generation}`))); version.value = groups.at(-1).name;
      const search = element('input'); search.type = 'search'; search.id = 'move-search'; search.placeholder = 'Search moves';
      const type = element('select'); type.id = 'move-type'; type.append(option('all', 'All types'), ...Object.keys(TYPE_COLORS).map(t => option(t, prettyName(t))));
      const category = element('select'); category.id = 'move-category'; category.append(option('all', 'All categories'), ...['physical', 'special', 'status'].map(t => option(t, prettyName(t))));
      const method = element('select'); method.id = 'move-method';
      const sort = element('select'); sort.id = 'move-sort'; [['name', 'Move name'], ['level', 'Required level'], ['power', 'Highest power'], ['accuracy', 'Highest accuracy'], ['pp', 'Highest PP']].forEach(([key, label]) => sort.append(option(key, label)));
      filters.append(labelControl('Game group', version), labelControl('Move name', search), labelControl('Move type', type), labelControl('Category', category), labelControl('Learning method', method), labelControl('Sort moves', sort));
      const status = element('p', 'form-help'); status.id = 'move-status'; status.setAttribute('role', 'status');
      const output = element('div'); output.id = 'moves-output';
      const pages = element('div', 'team-actions'); let page = 0, revision = 0;
      const prev = button('Previous moves', () => { page--; render(); }); prev.id = 'moves-previous';
      const next = button('Next moves', () => { page++; render(); }); next.id = 'moves-next'; pages.append(prev, next);
      panel.append(filters, element('p', 'form-help', 'Move metadata loads in pages of 24. Type/category filters and numeric sorting inspect all matching entries in the selected learnset, with at most four requests at a time. Repeated or shared moves use the cache.'), status, output, pages);
      function methods() {
        method.replaceChildren(option('all', 'All methods'), ...[...new Set(data.learnset(raw, version.value).map(row => row.method))].sort().map(name => option(name, prettyName(name))));
      }
      methods();
      async function render() {
        const request = ++revision, group = version.value;
        const alive = () => request === revision && current();
        const query = search.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        let rows = data.learnset(raw, group).filter(row => (!query || row.name.replaceAll('-', '').includes(query)) && (method.value === 'all' || method.value === row.method));
        const fullMetadata = type.value !== 'all' || category.value !== 'all' || ['power', 'accuracy', 'pp'].includes(sort.value);
        const compareRows = (a, b) => sort.value === 'level' ? (a.level ?? Infinity) - (b.level ?? Infinity) || a.name.localeCompare(b.name) || a.method.localeCompare(b.method) : a.name.localeCompare(b.name) || a.method.localeCompare(b.method) || (a.level ?? 0) - (b.level ?? 0);
        rows.sort(compareRows);
        const needed = fullMetadata ? rows : rows.slice(page * 24, (page + 1) * 24);
        const unique = [...new Set(needed.map(row => row.id))], metadata = new Map();
        status.textContent = `Loading ${groups.find(g => g.name === group).label} move metadata…`; output.replaceChildren(); prev.disabled = true; next.disabled = true; output.setAttribute('aria-busy', 'true');
        try {
          for (let index = 0; index < unique.length; index += 4) {
            if (!alive()) return;
            await Promise.all(unique.slice(index, index + 4).map(async id => metadata.set(id, await data.get('move', id))));
            if (!alive()) return;
            status.textContent = `Loading metadata: ${Math.min(index + 4, unique.length)} / ${unique.length}`;
          }
          if (!alive()) return;
          rows = rows.map(row => ({ ...row, ...(metadata.has(row.id) ? data.moveValues(metadata.get(row.id), group) : {}) }));
          if (fullMetadata) {
            rows = rows.filter(row => (type.value === 'all' || type.value === row.type) && (category.value === 'all' || category.value === row.category));
            if (['power', 'accuracy', 'pp'].includes(sort.value)) rows.sort((a, b) => (b[sort.value] ?? -1) - (a[sort.value] ?? -1) || a.name.localeCompare(b.name) || a.method.localeCompare(b.method));
          }
          const count = rows.length; page = Math.max(0, Math.min(page, Math.ceil(count / 24) - 1));
          const visible = rows.slice(page * 24, (page + 1) * 24);
          status.textContent = `${groups.find(g => g.name === group).label} · ${count ? `${page * 24 + 1}–${page * 24 + visible.length} of ${count}` : '0'} learn-method entries`;
          output.replaceChildren(count ? table(['Move', 'Type', 'Category', 'Power', 'Accuracy', 'PP', 'Method', 'Level'], visible.map(row => [prettyName(row.name), badges([row.type]), prettyName(row.category), row.power === null || row.power === undefined || row.power === 0 ? '—' : row.power, row.accuracy === null || row.accuracy === undefined ? '—' : `${row.accuracy}%`, row.pp ?? '—', prettyName(row.method), row.method === 'level-up' && row.level > 0 ? row.level : '—']), `${prettyName(group)} learnable Pokémon moves`) : element('p', 'empty-state', 'No moves match these filters in this game group.'));
          prev.disabled = page === 0; next.disabled = (page + 1) * 24 >= count;
        } catch { if (alive()) { status.textContent = 'Move metadata could not be completed. No incomplete filtered results are shown.'; output.replaceChildren(button('Retry moves', () => render(), 'action-button')); } }
        finally { if (alive()) output.setAttribute('aria-busy', 'false'); }
      }
      version.addEventListener('change', () => { methods(); page = 0; render(); });
      [search, type, category, method, sort].forEach(control => control.addEventListener(control === search ? 'input' : 'change', () => { page = 0; render(); }));
      await render();
    };
    sections.forEach((section, name) => {
      const tab = button(section.label, () => activate(name), 'detail-tab'); section.tab = tab;
      tab.id = `detail-tab-${name}`; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `detail-panel-${name}`);
      section.panel.id = `detail-panel-${name}`; section.panel.setAttribute('role', 'tabpanel'); section.panel.setAttribute('aria-labelledby', tab.id); section.panel.tabIndex = 0;
      tab.addEventListener('keydown', event => {
        const keys = [...sections.keys()], i = keys.indexOf(name);
        const target = event.key === 'ArrowRight' ? (i + 1) % keys.length : event.key === 'ArrowLeft' ? (i + keys.length - 1) % keys.length : event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1 : null;
        if (target !== null) { event.preventDefault(); activate(keys[target], true); }
      }); tabs.append(tab);
    });
    content.replaceChildren(hero, nav, tabs, ...[...sections.values()].map(s => s.panel));
    if (controls) content.append(controls);
    activate('overview');
  }
  globalThis.PokemonEncyclopedia = { enhance };
  const shared = new URL(location.href).searchParams.get('pokemon');
  if (shared !== null) {
    const id = /^\d+$/.test(shared) ? Number(shared) : NaN;
    if (Number.isInteger(id) && id >= 1 && id <= TOTAL) showDetails(state.pokemon.get(id) || { id, name: `Pokémon ${id}` }, { focusHeading: true });
    else { const message = $('#account-message'); if (message) { message.textContent = 'Shareable entries support National Pokémon #001–649.'; message.hidden = false; } }
  }
})();
