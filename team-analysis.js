// Accessible charts and tables for both private drafts and intentionally shared teams.
(() => {
  'use strict';
  const root = new URL('.', document.currentScript.src);
  const charts = new Map();
  let resources;
  async function load() {
    const snapshot = await PokemonData.load();
    if (!resources) resources = fetch(new URL('data/type-chart.json', root)).then(async r => {
      if (!r.ok) throw Error('Type chart could not load.');
      const json = await r.json(); return json.resources;
    }).catch(error => { resources = null; throw error; });
    return { records: snapshot.pokemon, resources: await resources };
  }
  const format = value => value === null ? '—' : Number(value.toFixed(2)).toLocaleString();
  function table(caption, headers, rows) {
    const wrap = element('div', 'analysis-table-wrap'); wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', caption);
    const table = element('table', 'analytics-table'); table.append(element('caption', '', caption));
    const head = element('thead'), tr = element('tr');
    headers.forEach(text => { const th = element('th', '', text); th.scope = 'col'; tr.append(th); }); head.append(tr); table.append(head);
    const body = element('tbody');
    rows.forEach(row => {
      const tr = element('tr'); row.forEach((value, i) => {
        const cell = element(i ? 'td' : 'th', '', typeof value === 'object' ? value.text : value);
        if (!i) cell.scope = 'row';
        if (typeof value === 'object') cell.dataset.multiplier = value.multiplier;
        tr.append(cell);
      }); body.append(tr);
    }); table.append(body); wrap.append(table); return wrap;
  }
  function cleanup() { for (const [canvas, chart] of charts) if (!canvas.isConnected) { chart.destroy(); charts.delete(canvas); } }
  function palette() {
    const css = getComputedStyle(document.documentElement);
    return { text: css.getPropertyValue('--text').trim(), grid: css.getPropertyValue('--line').trim(), mint: document.documentElement.dataset.theme === 'light' ? '#277c5a' : '#80e5b8' };
  }
  function draw(canvas, labels, values, title, integer = false) {
    if (!globalThis.Chart) return false;
    const p = palette();
    try {
      const chart = new Chart(canvas, { type:'bar', data:{ labels, datasets:[{ label:title, data:values, backgroundColor:p.mint, borderRadius:4 }] }, options:{ responsive:true, maintainAspectRatio:false, animation:false,
        plugins:{ legend:{display:false}, tooltip:{ callbacks:{label:c => `${title}: ${format(c.parsed.y)}`} } },
        scales:{ x:{ticks:{color:p.text},grid:{color:p.grid}}, y:{beginAtZero:true,ticks:{color:p.text,...(integer?{stepSize:1}: {})},grid:{color:p.grid},title:{display:true,text:title,color:p.text}} } } });
      charts.set(canvas, chart); return true;
    } catch { return false; }
  }
  async function render(target, ids) {
    const ticket = (target._analysisTicket || 0) + 1; target._analysisTicket = ticket;
    target.replaceChildren(element('p','form-help','Calculating your team’s type coverage…')); cleanup();
    try {
      const { records, resources } = await load();
      const a = TeamAnalysisData.analyze(ids, records, resources);
      if (!target.isConnected || target._analysisTicket !== ticket) return;
      target.replaceChildren(); target.classList.add('team-analysis'); target.dataset.memberCount = a.count;
      target.append(element('p','eyebrow','KNOW YOUR LINEUP'),element('h3','','Team analysis'),element('p','form-help',`${a.count}/6 members · ${a.ownTypes.length} distinct types · ${a.total} combined base stats. Empty slots are excluded from every calculation.`));
      target.append(element('p','analysis-rules','Modern Encyclopedia type chart. Abilities, items, weather, moves, levels and other battle effects are excluded. Base stats alone do not measure competitive viability or guarantee battle performance.'));
      if (!a.count) { target.append(element('p','notice','Add a Pokémon to see matchups and stat averages.')); return; }
      const chartsWrap = element('div','analysis-charts');
      const weakness = element('section','analytics-panel'), averages = element('section','analytics-panel');
      weakness.append(element('h4','','Defensive coverage'));
      const label = element('label','analytics-control','Show matchups'); const select = element('select'); select.setAttribute('aria-label','Defensive chart measure');
      for (const [key,text] of [['weak','Weaknesses'],['resistant','Resistances'],['immune','Immunities']]) { const option = element('option','',text); option.value=key; select.append(option); } label.append(select); weakness.append(label);
      const frame = element('div','analysis-chart-frame'), canvas = element('canvas'); canvas.setAttribute('role','img'); canvas.setAttribute('aria-label','Team defensive type counts. Exact values follow in the table.'); frame.append(canvas); weakness.append(frame);
      averages.append(element('h4','','Average base stats'));
      const statFrame = element('div','analysis-chart-frame'), statCanvas = element('canvas'); statCanvas.setAttribute('role','img'); statCanvas.setAttribute('aria-label','Average of six base-stat categories. Exact values follow in the table.'); statFrame.append(statCanvas); averages.append(statFrame); chartsWrap.append(weakness,averages); target.append(chartsWrap);
      const rendered = draw(canvas,a.defensive.map(d=>prettyName(d.type)),a.defensive.map(d=>d.weak),'Weak members',true);
      draw(statCanvas,PokemonData.labels,a.averages.map(v=>v.value),'Average base stat');
      if (!rendered) target.append(element('p','notice','Charts are unavailable. All exact values are available in the tables below.'));
      select.addEventListener('change',()=>{ const chart=charts.get(canvas); if(chart){chart.data.datasets[0].label=select.selectedOptions[0].textContent;chart.data.datasets[0].data=a.defensive.map(d=>d[select.value]);chart.update('none');} });
      target.append(table('Defensive coverage by attacking type',['Attacking type','Weak','Resistant','Immune','Neutral'],a.defensive.map(d=>[prettyName(d.type),d.weak,d.resistant,d.immune,d.neutral])));
      target.append(table('Team base-stat balance',['Stat','Average'],a.averages.map((v,i)=>[PokemonData.labels[i],format(v.value)])));
      const threats = a.defensive.filter(d=>d.weak>=Math.ceil(a.count/2));
      const covered = a.defensive.filter(d=>d.resistant+d.immune>0);
      target.append(element('p','analysis-summary',`${threats.length ? `At least half the team is weak to: ${threats.map(d=>prettyName(d.type)).join(', ')}.` : 'No attacking type is super-effective against half or more of this team.'} ${covered.length} attacking types have at least one resistant or immune member. These counts describe typing, not battle outcomes.`));
      target.append(element('h4','','Individual damage multipliers'),element('p','form-help','4× / 2× weak · 1× neutral · 0.5× / 0.25× resistant · 0× immune. Scroll horizontally to compare all six slots.'));
      const headers=['Attacking type',...Array.from({length:6},(_,i)=>a.members[i]?`${number(a.members[i].pokemon.id)} ${prettyName(a.members[i].pokemon.name)}`:`Empty slot ${i+1}`)];
      target.append(table('Six-slot type coverage matrix',headers,a.defensive.map(d=>[prettyName(d.type),...Array.from({length:6},(_,i)=>i<a.count?{text:`${d.multipliers[i]}×`,multiplier:d.multipliers[i]}:'—')])));
      target.append(element('h4','','Type-based potential coverage'),element('p','form-help','Super-effective potential against single defending types using your Pokémon’s own types. This is not actual moveset coverage; Pokémon are not assumed to know every move of their types.'));
      target.append(table('Offensive type-based potential coverage',['Opposing type','Super-effective attacking types'],a.offensive.map(d=>[prettyName(d.type),d.attackers.map(prettyName).join(', ')||'None'])));
    } catch (error) {
      if (!target.isConnected || target._analysisTicket !== ticket) return;
      target.replaceChildren(element('p','form-error',error.message));
      const retry=element('button','action-button','Retry analysis');retry.type='button';retry.onclick=()=>render(target,ids);target.append(retry);
    }
  }
  new MutationObserver(()=>{ cleanup(); const p=palette(); for(const chart of charts.values()){chart.data.datasets[0].backgroundColor=p.mint;for(const axis of Object.values(chart.options.scales)){axis.ticks.color=p.text;axis.grid.color=p.grid;if(axis.title)axis.title.color=p.text;}chart.update('none');} }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  globalThis.DexhavenTeamAnalysis={render,cleanup,load};
})();
