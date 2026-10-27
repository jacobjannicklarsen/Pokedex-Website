// Public analytics only. Trainer identity, cookies and mutations stay in account.js.
(() => {
  'use strict';
  if (!document.querySelector('#dashboard-content')) return;
  const data = globalThis.PokemonData;
  const charts = new Map();
  const selected = [null, null];
  const selectors = [];
  let records = [], byId = new Map(), loading = false;
  const statLabels = Object.fromEntries([...data.stats.map((key, i) => [key, data.labels[i]]), ['total', 'Total Base Stats']]);
  const roman = ['I', 'II', 'III', 'IV', 'V'];
  const generationLabel = id => { const g = data.generation(id); return `Generation ${roman[g.id - 1]} · ${g.name}`; };
  function table(target, caption, headers, rows) {
    const node = element('table', 'analytics-table');
    node.append(element('caption', 'sr-only', caption));
    const head = element('thead'), header = element('tr');
    headers.forEach(text => { const th = element('th', '', text); th.scope = 'col'; header.append(th); });
    head.append(header); node.append(head);
    const body = element('tbody');
    rows.forEach(values => {
      const row = element('tr');
      values.forEach((text, i) => { const cell = element(i ? 'td' : 'th', '', text); if (!i) cell.scope = 'row'; row.append(cell); });
      body.append(row);
    });
    node.append(body); $(target).replaceChildren(node);
  }
  function palette() {
    const style = getComputedStyle(document.documentElement);
    return { text: style.getPropertyValue('--text').trim(), muted: style.getPropertyValue('--muted').trim(), line: style.getPropertyValue('--line').trim(), panel: style.getPropertyValue('--panel').trim(),
      colors: document.documentElement.dataset.theme === 'light' ? ['#277c5a', '#356eb7', '#ac5429', '#8052b6', '#956014', '#9e4375'] : ['#80e5b8', '#78baff', '#ffad7d', '#c399dd', '#f1d76b', '#f495b9'] };
  }
  function chartOptions({ horizontal = false, xTitle = 'Generation', yTitle = 'Pokémon count', legend = false } = {}) {
    const p = palette();
    const axis = title => ({ grid: { color: p.line }, ticks: { color: p.muted }, title: { display: true, text: title, color: p.text } });
    return { responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', axis: horizontal ? 'y' : 'x', intersect: false },
      plugins: { legend: { display: legend, position: 'bottom', labels: { color: p.text, boxWidth: 12 } },
        tooltip: { backgroundColor: p.panel, titleColor: p.text, bodyColor: p.text, borderColor: p.line, borderWidth: 1,
          callbacks: { label: context => `${context.dataset.label}: ${Number(horizontal ? context.parsed.x : context.parsed.y).toLocaleString(undefined, { maximumFractionDigits: 2 })}` } } },
      scales: { x: { ...axis(xTitle), ...(horizontal ? { beginAtZero: true } : {}) }, y: { ...axis(yTitle), ...(!horizontal ? { beginAtZero: true } : {}) } } };
  }
  function draw(id, chartData, settings = {}) {
    if (!globalThis.Chart) { $('#chart-warning').hidden = false; return; }
    try {
      const current = charts.get(id);
      if (current) { current.data = chartData; current.options = chartOptions(settings); current.update('none'); }
      else charts.set(id, new Chart($(`#${id}`), { type: 'bar', data: chartData, options: chartOptions(settings) }));
    } catch { $('#chart-warning').hidden = false; }
  }
  function drawOverview(summary) {
    const p = palette();
    const labels = summary.groups.map(g => `Gen ${roman[g.id - 1]} · ${g.name}`);
    draw('generation-chart', { labels, datasets: [{ label: 'Pokémon', data: summary.groups.map(g => g.count), backgroundColor: p.colors[0], borderRadius: 5 }] });
    draw('type-chart', { labels: data.types.map(prettyName), datasets: [{ label: 'Type memberships', data: data.types.map(type => summary.types[type]), backgroundColor: data.types.map(type => TYPE_COLORS[type]), borderRadius: 4 }] }, { horizontal: true, xTitle: 'Pokémon memberships', yTitle: 'Type' });
    draw('averages-chart', { labels, datasets: data.stats.map((key, i) => ({ label: data.labels[i], data: summary.groups.map(g => g.averages[i]), backgroundColor: p.colors[i], borderRadius: 3 })) }, { legend: true, yTitle: 'Average base stat' });
  }
  function rank() {
    const key = $('#ranking-stat').value;
    const leaders = [...records].sort(data.compare(key)).slice(0, 10);
    $('#ranking-list').replaceChildren(...leaders.map((pokemon, index) => {
      const item = element('li');
      const button = element('button', 'ranking-entry'); button.type = 'button'; button.dataset.id = pokemon.id;
      button.setAttribute('aria-label', `${index + 1}. ${prettyName(pokemon.name)}, ${number(pokemon.id)}, ${statLabels[key]} ${data.value(pokemon, key)}. Open details`);
      button.append(element('span', 'rank-position', String(index + 1)), artwork(pokemon));
      const identity = element('span', 'rank-identity'); identity.append(element('strong', '', `${number(pokemon.id)} ${prettyName(pokemon.name)}`), element('small', '', generationLabel(pokemon.id)));
      const score = element('span', 'rank-score'); score.append(element('strong', '', data.value(pokemon, key)), element('small', '', statLabels[key]));
      button.append(identity, score); button.addEventListener('click', () => showDetails(pokemon)); item.append(button); return item;
    }));
  }
  function comparisonCard(pokemon) {
    const card = element('article', 'comparison-card');
    card.append(artwork(pokemon), element('p', 'card-number', `${number(pokemon.id)} · ${generationLabel(pokemon.id)}`), element('h3', '', prettyName(pokemon.name)), badges(pokemon.types));
    const measurements = element('dl', 'comparison-measurements');
    [['Height', `${pokemon.height / 10} m`], ['Weight', `${pokemon.weight / 10} kg`]].forEach(([label, text]) => {
      const group = element('div'); group.append(element('dt', '', label), element('dd', '', text)); measurements.append(group);
    });
    card.append(measurements, element('h4', '', 'Abilities'), element('p', 'form-help', pokemon.abilities.map(a => `${prettyName(a.name)}${a.hidden ? ' (hidden)' : ''}`).join(' · ')));
    const detail = element('button', 'text-button', 'View full details'); detail.type = 'button'; detail.addEventListener('click', () => showDetails(pokemon)); card.append(detail);
    return card;
  }
  function drawComparison(a, b) {
    const p = palette();
    draw('comparison-chart', { labels: data.labels, datasets: [a, b].map((pokemon, i) => ({ label: prettyName(pokemon.name), data: data.stats.map(key => data.value(pokemon, key)), backgroundColor: p.colors[i], borderRadius: 4 })) }, { legend: true, xTitle: 'Base statistic', yTitle: 'Base stat value' });
  }
  function comparison() {
    const a = byId.get(selected[0]), b = byId.get(selected[1]);
    const cards = [a, b].filter(Boolean).map(comparisonCard);
    $('#comparison-cards').replaceChildren(...cards);
    const ready = a && b && a.id !== b.id;
    $('#comparison-results').hidden = !ready;
    if (!ready) {
      $('#comparison-status').textContent = 'Choose two different Pokémon to compare all six stats and their totals.';
      charts.get('comparison-chart')?.destroy(); charts.delete('comparison-chart'); return;
    }
    const totalDifference = data.value(a, 'total') - data.value(b, 'total');
    $('#comparison-status').textContent = totalDifference === 0 ? 'Their total base stats are tied (difference: 0).' : `${prettyName(totalDifference > 0 ? a.name : b.name)} has ${Math.abs(totalDifference)} more total base stat points.`;
    const rows = [...data.stats, 'total'].map(key => {
      const left = data.value(a, key), right = data.value(b, key);
      return [statLabels[key], String(left), String(right), left === right ? 'Tie · 0' : `${prettyName(left > right ? a.name : b.name)} +${Math.abs(left - right)}`];
    });
    table('#comparison-table', 'Pokémon base statistics and differences', ['Base statistic', prettyName(a.name), prettyName(b.name), 'Higher value / difference'], rows);
    [...$('#comparison-table').querySelectorAll('tbody tr')].forEach((row, i) => {
      const key = [...data.stats, 'total'][i], left = data.value(a, key), right = data.value(b, key);
      if (left !== right) row.children[left > right ? 1 : 2].classList.add('stat-winner');
      else row.classList.add('stat-tie');
    });
    drawComparison(a, b);
  }
  let summary;
  async function load() {
    if (loading) return;
    loading = true; $('#dashboard-status').hidden = false; $('#dashboard-error').hidden = true; $('#dashboard-content').hidden = true;
    try {
      const snapshot = await data.load();
      records = snapshot.pokemon.map(p => ({ ...p, artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.id}.png`, sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png` }));
      byId = new Map(records.map(p => [p.id, p]));
      records.forEach(p => state.pokemon.set(p.id, p));
      summary = data.summarize(records);
      $('#metric-total').textContent = summary.total; $('#metric-generations').textContent = summary.generationCount; $('#metric-types').textContent = summary.typeCount; $('#metric-average').textContent = summary.averageTotal.toFixed(2);
      $('#dataset-source').textContent = `Source: PokéAPI · Complete snapshot ${snapshot.source.retrievedAt.slice(0, 10)} · Standard species #001–649, excluding alternate forms. Current base stats and typings; averages rounded to two decimals.`;
      table('#generation-table', 'Species introduced by generation', ['Generation', 'Pokémon'], summary.groups.map(g => [`Generation ${roman[g.id - 1]} · ${g.name}`, String(g.count)]));
      table('#type-table', 'Pokémon membership by type; dual types counted in each type', ['Type', 'Pokémon'], data.types.map(t => [prettyName(t), String(summary.types[t])]));
      table('#averages-table', 'Mean base statistics per generation', ['Generation', ...data.labels], summary.groups.map(g => [g.name, ...g.averages.map(v => v.toFixed(2))]));
      $('#ranking-stat').replaceChildren(...['total', ...data.stats].map(key => { const option = element('option', '', statLabels[key]); option.value = key; return option; }));
      if (!selectors.length) [0, 1].forEach(index => {
        const selector = PokemonSelector.create({ slot: index + 1, label: index === 0 ? 'First Pokémon' : 'Second Pokémon', getPokemon: id => byId.get(id), excludedIds: () => new Set(selected.filter((id, i) => i !== index && id)), formatName: prettyName, makeArtwork: artwork,
          onChange: id => { selected[index] = id; selectors.forEach(s => s.refresh()); comparison(); } });
        selectors.push(selector); $('#comparison-selectors').append(selector.element);
      });
      $('#dashboard-content').hidden = false;
      drawOverview(summary); rank(); comparison();
    } catch (error) {
      $('#dashboard-error').hidden = false;
      $('#dashboard-error-message').textContent = `${error.message} Analytics require the complete validated collection; no partial results are shown. Please try again.`;
    } finally { loading = false; $('#dashboard-status').hidden = true; }
  }
  $('#ranking-stat').addEventListener('change', rank);
  $('#dashboard-retry').addEventListener('click', load);
  new MutationObserver(() => { if (summary && !$('#dashboard-content').hidden) { drawOverview(summary); if (selected.every(Boolean)) drawComparison(byId.get(selected[0]), byId.get(selected[1])); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  load();
})();
