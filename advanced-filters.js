// Progressive enhancement: ordinary catalogue controls remain usable if the snapshot fails.
(() => {
  'use strict';
  const panel = document.querySelector('#advanced-filters');
  if (!panel) return;
  const data = globalThis.PokemonData;
  const fields = $('#advanced-fields');
  const message = $('#advanced-status');
  const error = $('#advanced-error');
  const retry = $('#advanced-retry');
  const controls = new Map();
  [...data.stats, 'total'].forEach((key, index) => {
    const label = data.labels[index] || 'Total Base Stats';
    const group = element('fieldset', 'stat-range');
    group.append(element('legend', '', label));
    const pair = {};
    for (const bound of ['min', 'max']) {
      const wrapper = element('label', '', bound === 'min' ? 'Minimum' : 'Maximum');
      const input = element('input');
      input.id = `stat-${key}-${bound}`; input.type = 'number'; input.min = '0'; input.max = key === 'total' ? '1530' : '255'; input.step = '1'; input.inputMode = 'numeric';
      input.placeholder = bound === 'min' ? '0' : input.max;
      input.setAttribute('aria-label', `${label} ${bound === 'min' ? 'minimum' : 'maximum'}`);
      input.setAttribute('aria-describedby', 'advanced-error');
      wrapper.append(input); group.append(wrapper); pair[bound] = input;
    }
    fields.append(group); controls.set(key, pair);
  });
  function apply() {
    const raw = Object.fromEntries([...controls].map(([key, pair]) => [key, { min: pair.min.value, max: pair.max.value }]));
    const invalidInput = [...controls.values()].flatMap(pair => Object.values(pair)).find(input => input.validity.badInput);
    const parsed = invalidInput ? { error: 'Enter a whole number in each selected bound.' } : data.parseRanges(raw);
    controls.forEach((pair, key) => Object.values(pair).forEach(input => input.setAttribute('aria-invalid', String(Boolean(parsed.error && (parsed.key === key || input === invalidInput))))));
    error.hidden = !parsed.error;
    error.textContent = parsed.error ? `${parsed.error} Results keep the last valid filter values until corrected.` : '';
    if (parsed.error) return;
    state.statRanges = parsed.ranges;
    const selected = Object.entries(parsed.ranges).map(([key, bounds]) => `${key === 'total' ? 'Total' : data.labels[data.stats.indexOf(key)]}: ${bounds.min ?? 0}–${bounds.max ?? (key === 'total' ? 1530 : 255)}`);
    $('#advanced-summary').textContent = selected.length ? selected.join(' · ') : 'No stat limits';
    render();
  }
  function reset() {
    controls.forEach(pair => Object.values(pair).forEach(input => { input.value = ''; input.removeAttribute('aria-invalid'); }));
    state.statRanges = {}; error.hidden = true; error.textContent = '';
    $('#advanced-summary').textContent = 'No stat limits';
    render();
  }
  fields.addEventListener('input', apply);
  $('#advanced-reset').addEventListener('click', reset);
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true; fields.disabled = true; retry.hidden = true;
    message.textContent = 'Loading complete base statistics…';
    try {
      const snapshot = await data.load();
      state.statData = new Map(snapshot.pokemon.map(p => [p.id, p]));
      fields.disabled = false; $('#stat-sort-options').disabled = false;
      message.textContent = `All ${snapshot.pokemon.length} species ready · PokéAPI snapshot ${snapshot.source.retrievedAt.slice(0, 10)}`;
      render();
    } catch {
      message.textContent = 'Base statistics could not load. Name, number, generation and type controls still work. Retry to enable stat filtering and sorting.';
      retry.hidden = false;
    } finally { loading = false; }
  }
  retry.addEventListener('click', load);
  globalThis.PokedexAdvanced = { reset };
  load();
})();
