// Account features are isolated from the existing PokéAPI cache and theme code.
(() => {
  'use strict';
  const session = { user: null, csrf: '', favorites: new Set(), teams: [], ready: false, privateReady: false, privateError: '' };
  const siteRoot = new URL('.', document.currentScript?.src || location.href);
  const isTrainerHub = document.body.dataset.page === 'trainers';
  const viewTarget = view => `${new URL('trainers.html', siteRoot).pathname}#view=${view.slice(1) || 'profile'}`;
  const viewFromLocation = () => {
    const hash = location.hash.match(/^#view=(teams|favorites|profile|progress|achievements)$/);
    return hash ? `/${hash[1]}` : isTrainerHub ? '/profile' : '/';
  };
  let activeView = viewFromLocation();
  let authMode = 'login';
  const authDialog = $('#auth-dialog');
  const content = $('#account-content');
  const pendingFavorites = new Set();
  const teamSelectors = new Set();
  const caughtFilters = new Set();
  let selectorRecovery;
  let avatarEditor;

  function recoverSelectors() {
    if (globalThis.PokemonSelector?.create) return Promise.resolve();
    if (!selectorRecovery) {
      selectorRecovery = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const url = new URL('pokemon-selector.js', siteRoot);
        url.searchParams.set('reload', Date.now());
        script.src = url.href;
        script.onload = () => globalThis.PokemonSelector?.create ? resolve() : reject(new Error('The Pokémon editor did not initialize. Restart Express and refresh this page.'));
        script.onerror = () => reject(new Error('The Pokémon editor could not load. Restart Express, then refresh this page. Existing teams can still be renamed or deleted.'));
        document.head.append(script);
      }).finally(() => { selectorRecovery = null; });
    }
    return selectorRecovery;
  }

  function notice(message, error = false) {
    const node = $('#account-message');
    node.textContent = message; node.hidden = false; node.classList.toggle('is-error', error);
    if (dialog.open) {
      const controls = $('#detail-content .detail-account-actions');
      if (controls) {
        let inline = controls.querySelector('.detail-account-message');
        if (!inline) { inline = element('p', 'detail-account-message'); inline.setAttribute('role', 'status'); controls.append(inline); }
        inline.textContent = message;
      }
    }
  }
  async function request(url, { method = 'GET', body, form } = {}) {
    const headers = {};
    if (method !== 'GET') headers['X-CSRF-Token'] = session.csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(new URL(`api${url}`, siteRoot), { method, credentials: 'same-origin', headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
    const data = response.status === 204 ? {} : await response.json().catch(() => ({ error: 'The account server is unavailable. Start the Express server and try again.' }));
    if (!response.ok) {
      if (response.status === 401 && session.user) {
        session.user = null; session.favorites.clear(); session.teams = []; session.privateReady = false; updateAccountUI();
        if (activeView !== '/') renderPage();
      }
      throw new Error(data.error || 'The request failed. Please try again.');
    }
    return data;
  }
  async function refreshSession() {
    const data = await request('/auth/session');
    const identityChanged = session.user?.id !== data.user?.id;
    session.user = data.user; session.csrf = data.csrfToken;
    if (identityChanged) { session.teams = []; session.favorites.clear(); session.privateReady = false; session.privateError = ''; }
    session.ready = true; updateAccountUI();
    if (identityChanged && isTrainerHub) renderPage();
    if (session.user) await loadPrivateData();
    else { session.teams = []; session.favorites.clear(); }
    session.ready = true; updateAccountUI();
  }
  async function loadPrivateData() {
    const userId = session.user?.id;
    try {
      const [teams, favorites] = await Promise.all([request('/teams'), request('/favorites')]);
      if (session.user?.id !== userId) return;
      session.teams = teams.teams; session.favorites = new Set(favorites.pokemonIds); session.privateReady = true; session.privateError = '';
    } catch (error) { if (session.user?.id === userId) session.privateError = error.message; throw error; }
  }
  function updateAccountUI() {
    const authenticated = session.ready && Boolean(session.user);
    $('#logout-button').hidden = !authenticated;
    $('#guest-actions').hidden = !session.ready || authenticated;
    const homeActions = $('#home-auth-actions');
    if (homeActions) homeActions.hidden = !session.ready || authenticated;
    $('#session-status').hidden = session.ready;
    document.querySelectorAll('[data-requires-auth]').forEach(link => { link.hidden = !authenticated; });
    document.querySelectorAll('[data-view]').forEach(link => {
      link.href = viewTarget(link.dataset.view);
    });
    const profile = $('#header-profile');
    const avatar = $('#header-avatar');
    const initial = $('#header-avatar-initial');
    profile.href = viewTarget('/profile');
    profile.setAttribute('aria-label', authenticated ? `Open ${session.user.username}'s trainer profile` : 'Open trainer profile');
    profile.title = authenticated ? session.user.username : '';
    initial.textContent = authenticated ? session.user.username[0].toUpperCase() : '';
    const avatarUrl = authenticated ? session.user.avatarUrl : null;
    if (!avatarUrl) {
      avatar.hidden = true; avatar.removeAttribute('src'); initial.hidden = false;
    } else if (avatar.getAttribute('src') !== avatarUrl) {
      avatar.hidden = false; initial.hidden = true; avatar.src = avatarUrl;
    }
    document.querySelectorAll('[data-favorite]').forEach(updateFavoriteButton);
    if (isTrainerHub) {
      $('#trainer-invitation').hidden = !session.ready || authenticated;
      $('#trainer-session-loading').hidden = session.ready;
      $('#trainer-area').hidden = !authenticated;
    }
    globalThis.TrainerProgress?.setUser(authenticated ? session.user : null, {
      authReady: session.ready, request, notice, login: () => openAuth(),
      onChange() { caughtFilters.forEach(refresh => refresh()); if (grid) render(); if (['/progress', '/achievements'].includes(activeView)) renderPage(); },
      async onExternal() {
        const previous = session.user?.id;
        try { await refreshSession(); }
        finally {
          if (previous !== session.user?.id || ['/progress', '/achievements'].includes(activeView)) renderPage();
          globalThis.TrainerProgress?.refresh();
        }
      }
    });
  }
  function openAuth(mode = 'login') {
    authMode = mode;
    if (dialog.open) dialog.close();
    $('#auth-form').reset(); $('#auth-error').hidden = true;
    setAuthMode();
    if (!authDialog.open) authDialog.showModal();
  }
  function setAuthMode() {
    const register = authMode === 'register';
    $('#auth-title').textContent = register ? 'Join Dexhaven' : 'Log in to Dexhaven';
    $('#auth-submit').textContent = register ? 'Register' : 'Log in';
    $('#auth-switch').textContent = register ? 'Already a trainer? Log in' : 'New here? Create an account';
    for (const field of ['username', 'email']) {
      $(`#${field}-label`).hidden = !register;
      $(`#auth-${field}`).required = register; $(`#auth-${field}`).disabled = !register;
    }
    $('#identifier-label').hidden = register; $('#auth-identifier').required = !register; $('#auth-identifier').disabled = register;
    $('#auth-password').minLength = register ? 12 : 1;
    $('#auth-password').autocomplete = register ? 'new-password' : 'current-password';
    $('#password-help').hidden = !register;
  }
  function action(label, callback, className = 'action-button') {
    const button = element('button', className, label); button.type = 'button';
    button.addEventListener('click', callback); return button;
  }
  function updateFavoriteButton(button) {
    const id = Number(button.dataset.favorite);
    const selected = session.favorites.has(id);
    button.textContent = selected ? '♥' : '♡';
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${selected ? 'Remove' : 'Add'} ${prettyName(state.pokemon.get(id)?.name || `Pokémon ${id}`)} ${selected ? 'from' : 'to'} favourites`);
    button.title = button.getAttribute('aria-label'); button.disabled = pendingFavorites.has(id) || !session.ready;
  }
  function favoriteButton(pokemon) {
    const button = action('', () => toggleFavorite(pokemon.id), 'favorite-button');
    button.dataset.favorite = pokemon.id; updateFavoriteButton(button); return button;
  }
  async function toggleFavorite(id) {
    if (!session.user) { openAuth(); return; }
    if (pendingFavorites.has(id)) return;
    const selected = session.favorites.has(id);
    pendingFavorites.add(id); updateAccountUI();
    try {
      await request(`/favorites/${id}`, { method: selected ? 'DELETE' : 'PUT' });
      selected ? session.favorites.delete(id) : session.favorites.add(id);
      globalThis.TrainerProgress?.refresh();
      notice(selected ? 'Removed from favourites.' : 'Added to favourites.');
      if (activeView === '/favorites' || activeView === '/profile') renderPage();
    } catch (error) { notice(error.message, true); }
    finally { pendingFavorites.delete(id); updateAccountUI(); }
  }
  function decorateCard(tile, pokemon) {
    if (!tile.querySelector('[data-favorite]')) tile.append(favoriteButton(pokemon));
    globalThis.TrainerProgress?.decorate(tile, pokemon);
  }
  function decorateDetails(container, pokemon) {
    const controls = element('div', 'detail-account-actions');
    controls.append(favoriteButton(pokemon), element('span', '', 'Favourite this Pokémon'));
    controls.append(action('Add to a team', () => openTeamPicker(pokemon.id)));
    globalThis.TrainerProgress?.decorate(controls, pokemon);
    container.append(controls);
  }
  function miniPokemon(id) {
    const box = element('div', 'mini-pokemon');
    const pokemon = state.pokemon.get(id) || { id, name: `Pokémon ${id}`, artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png` };
    box.append(PokemonSprites.create(id,{kind:'party',name:prettyName(pokemon.name),pokemon}));
    const name = element('span', '', `${number(id)} ${prettyName(pokemon.name)}`); name.dataset.pokemonName = id;
    box.append(name); return box;
  }
  function onPokemonUpdate() {
    // Update labels without rebuilding forms or losing unsaved team selections.
    document.querySelectorAll('[data-pokemon-name]').forEach(node => {
      const pokemon = state.pokemon.get(Number(node.dataset.pokemonName));
      if (pokemon) node.textContent = `${number(pokemon.id)} ${prettyName(pokemon.name)}`;
    });
    if (activeView === '/favorites' && session.user) renderFavoriteGrid();
    teamSelectors.forEach(selector => selector.refresh());
  }
  function navigate(view, push = true) {
    if (!isTrainerHub) {
      if (view !== '/') location.assign(viewTarget(view));
      return;
    }
    activeView = ['/teams', '/favorites', '/profile', '/progress', '/achievements'].includes(view) ? view : '/profile';
    if (push) {
      const target = viewTarget(activeView);
      if (location.pathname + location.hash !== target) history.pushState({}, '', target);
    }
    document.querySelectorAll('[data-view]').forEach(link => {
      if (link.dataset.view === activeView) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    renderPage();
  }
  let trainerCatalogueStarted = false;
  async function loadTrainerCatalogue() {
    trainerCatalogueStarted = true;
    const status = $('#trainer-catalog-status');
    const retry = $('#trainer-catalog-retry');
    status.hidden = false; retry.hidden = true;
    status.querySelector('span').textContent = 'Loading Pokémon for your trainer tools…';
    await loadPokemon();
    const complete = state.pokemon.size === TOTAL && state.typesLoaded.size === Object.keys(TYPE_COLORS).length;
    status.hidden = complete; retry.hidden = complete;
    if (!complete) status.querySelector('span').textContent = 'Some Pokémon data could not load. Existing teams and favourites are preserved. Retry to finish loading names and types.';
  }
  function renderPage() {
    if (!isTrainerHub) return;
    avatarEditor?.destroy();avatarEditor=null;
    teamSelectors.forEach(selector => selector.close()); teamSelectors.clear(); caughtFilters.clear();
    content.replaceChildren();
    globalThis.DexhavenTeamAnalysis?.cleanup();
    $('#trainer-heading').textContent = ({ '/teams': 'My Teams', '/favorites': 'My Favourites', '/profile': 'Trainer Profile', '/progress': 'Pokédex Progress', '/achievements': 'Achievements' })[activeView] || 'Trainer';
    if (!session.ready) { content.append(element('p', 'form-help', 'Loading your trainer account…')); return; }
    if (!session.user) return;
    if (!session.privateReady) {
      content.append(element('p', session.privateError ? 'form-error' : 'form-help', session.privateError || 'Loading your teams and favourites…'));
      if (session.privateError) content.append(action('Retry trainer data', async () => { try { await loadPrivateData(); renderPage(); } catch (error) { notice(error.message, true); } }));
      return;
    }
    if (!trainerCatalogueStarted) loadTrainerCatalogue();
    if (activeView === '/teams') renderTeams();
    if (activeView === '/favorites') {
      content.append(element('p', 'form-help', 'Your saved Pokémon. Select a card to see its details.'));
      const browse = element('a', 'explore-link', 'Explore the National Pokédex'); browse.href = 'pokemon.html'; content.append(browse);
      const grid = element('div', 'pokemon-grid'); grid.id = 'favorite-grid';
      grid.addEventListener('click', event => {
        const button = event.target.closest('.pokemon-card');
        if (!button) return;
        const pokemon = state.pokemon.get(Number(button.dataset.id));
        if (pokemon) showDetails(pokemon); else notice('Pokémon data is not loaded yet. Use Retry Pokémon data above to finish loading.', true);
      });
      content.append(grid); renderFavoriteGrid();
    }
    if (activeView === '/profile') renderProfile();
    if (activeView === '/progress') globalThis.TrainerProgress?.renderProgress(content);
    if (activeView === '/achievements') globalThis.TrainerProgress?.renderAchievements(content);
  }
  function renderFavoriteGrid() {
    const savedGrid = $('#favorite-grid');
    if (!savedGrid) return;
    const existing = new Map([...savedGrid.children].map(node => [Number(node.dataset.id), node]));
    for (const [id, tile] of existing) if (!session.favorites.has(id)) tile.remove();
    for (const id of [...session.favorites].sort((a,b) => a-b)) {
      const pokemon = state.pokemon.get(id);
      const old = existing.get(id);
      if (!old || (pokemon && old.dataset.placeholder === 'true')) {
        const tile = createCard(pokemon || { id, name: `Pokémon ${id}`, types: [], artwork: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png` });
        tile.dataset.placeholder = String(!pokemon);
        if (old) old.replaceWith(tile); else savedGrid.append(tile);
      } else if (pokemon) updateCardTypes(old, pokemon);
    }
    if (!session.favorites.size && !savedGrid.querySelector('.form-help')) savedGrid.append(element('p', 'form-help', 'No favourites yet. Tap a heart in the Pokédex to save one.'));
  }
  function renderProfile() {
    const user = session.user;
    const panel = element('div', 'trainer-panel profile-panel');
    if (user.avatarUrl) { const img = element('img', 'trainer-avatar'); img.src = user.avatarUrl; img.alt = `${user.username}'s profile picture`; panel.append(img); }
    else panel.append(element('span', 'trainer-avatar avatar-initial', user.username[0].toUpperCase()));
    const identity = element('div'); identity.append(element('h2', '', user.username), element('p', 'form-help', `Dexhaven trainer · Joined ${new Date(user.createdAt).toLocaleDateString()}`), element('p', '', user.email));
    const biography = element('p', 'profile-biography', user.bio || 'Your story is still unwritten. Add a biography below.'); biography.dataset.profileBio = ''; identity.append(biography);
    panel.append(identity); content.append(panel);
    const form = element('form', 'account-form trainer-panel');
    const label = element('label', '', 'Biography');
    const bio = element('textarea'); bio.name = 'bio'; bio.maxLength = 500; bio.rows = 4; bio.value = user.bio; label.append(bio);
    const save = element('button', 'action-button', 'Save trainer info'); save.type = 'submit';
    form.append(label, element('p', 'form-help', 'Your one biography for Dexhaven. Control who can see it with Show biography publicly below.'), save); form.addEventListener('submit', async event => {
      event.preventDefault(); save.disabled = true;
      try { const data = await request('/profile', { method: 'PATCH', body: { bio: bio.value } }); session.user = data.user; biography.textContent = data.user.bio || 'Your story is still unwritten. Add a biography below.'; notice('Trainer info saved.'); }
      catch (error) { notice(error.message, true); } finally { save.disabled = false; }
    });
    const avatarForm = element('form', 'account-form trainer-panel');
    const fileLabel = element('label', '', 'Change profile picture');
    const file = element('input'); file.type = 'file'; file.name = 'avatar'; file.accept = 'image/jpeg,image/png,image/webp'; file.required = true; fileLabel.append(file);
    const upload = element('button', 'action-button', 'Upload picture'); upload.type = 'submit';
    avatarForm.append(fileLabel, element('p', 'form-help', 'JPEG, PNG or WebP. Maximum 2 MB and 16 megapixels. Choose a picture, then drag and zoom to adjust your avatar.'), upload);
    const cropper=globalThis.AvatarCropper?.create({container:avatarForm,onReady:ready=>{upload.disabled=!ready;},onCancel:()=>{file.value='';}});avatarEditor=cropper;
    upload.disabled=true;
    if(!cropper)avatarForm.append(element('p','form-error','The picture editor could not load. Refresh this page before uploading.'));
    file.addEventListener('change',async()=>{if(!file.files[0]){cropper?.clear();return;}try{await cropper?.load(file.files[0]);}catch{/* The editor displays a readable error; the current picture stays saved. */}});
    avatarForm.append(upload);
    avatarForm.addEventListener('submit', async event => {
      event.preventDefault();
      const selected = file.files[0];
      if (!selected || selected.size > 2 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(selected.type)) { notice('Choose a JPEG, PNG or WebP image no larger than 2 MB.', true); return; }
      if(!cropper){notice('The picture editor could not load. Refresh this page before uploading.',true);return;}
      upload.disabled=true;
      try {
        await cropper.load(selected);
        if(session.user?.id!==user.id||!avatarForm.isConnected)return;
        const crop=cropper.getCrop();if(!crop)throw Error('Choose a valid picture first.');
        upload.disabled=true;file.disabled=true;cropper.setBusy(true);
        const data=new FormData();data.append('avatar',selected);data.append('crop',JSON.stringify(crop));
        const result=await request('/profile/avatar',{method:'POST',form:data});
        if(session.user?.id!==user.id||!avatarForm.isConnected)return;
        session.user=result.user;updateAccountUI();notice('Profile picture updated.');if(activeView==='/profile')renderPage();
      }catch(error){if(session.user?.id===user.id&&avatarForm.isConnected)notice(error.message,true);}finally{file.disabled=false;cropper.setBusy(false);upload.disabled=!cropper.getCrop();}
    });
    content.append(avatarForm, form);
    globalThis.DexhavenCommunity?.settings(content, { user, teams: session.teams, request, notice, currentUserId: () => session.user?.id, trackSelector: selector => teamSelectors.add(selector) });
    globalThis.TrainerDecorations?.mount(content, panel, {user,request,notice,currentUserId:()=>session.user?.id});
    content.append(element('h2', 'account-subheading', `Teams · ${session.teams.length}`));
    session.teams.forEach(team => {
      const summary = element('div', 'trainer-panel'); summary.append(element('h3', '', team.name));
      const members = element('div', 'mini-roster'); team.pokemonIds.forEach(id => members.append(miniPokemon(id))); summary.append(members); content.append(summary);
    });
    content.append(action('Manage teams', () => navigate('/teams'), 'text-button'), element('h2', 'account-subheading', `Favourites · ${session.favorites.size}`));
    const favorites = element('div', 'mini-roster'); [...session.favorites].forEach(id => favorites.append(miniPokemon(id)));
    content.append(favorites, action('View all favourites', () => navigate('/favorites'), 'text-button'));
  }
  function renderTeams() {
    const selectorFactory = globalThis.PokemonSelector?.create;
    if (!selectorFactory) {
      const warning = element('div', 'trainer-panel');
      warning.append(element('p', 'form-help', 'Pokémon selection could not load. You can still create, rename and delete teams. Restart Express and refresh if retrying does not help.'));
      const retry = action('Retry Pokémon editor', async () => {
        retry.disabled = true;
        try { await recoverSelectors(); if (activeView === '/teams') renderPage(); notice('Pokémon editor loaded.'); }
        catch (error) { notice(error.message, true); }
        finally { retry.disabled = false; }
      });
      warning.append(retry); content.append(warning);
    }
    const create = element('form', 'account-form trainer-panel team-create');
    const label = element('label', '', 'New team name'); const name = element('input'); name.name = 'name'; name.required = true; name.maxLength = 60; label.append(name);
    const submit = element('button', 'action-button', 'Create team'); submit.type = 'submit'; create.append(label, submit); content.append(create);
    create.addEventListener('submit', async event => {
      event.preventDefault(); submit.disabled = true;
      try {
        const { team } = await request('/teams', { method: 'POST', body: { name: name.value } });
        session.teams.unshift(team);
        notice('Team created. Choose up to six Pokémon and save.');
        globalThis.TrainerProgress?.refresh();
        if (activeView === '/teams') renderPage();
      }
      catch (error) { notice(error.message, true); } finally { submit.disabled = false; }
    });
    if (!session.teams.length) content.append(element('p', 'form-help', 'Create your first team to start your Dexhaven journey.'));
    session.teams.forEach(team => {
      const form = element('form', 'trainer-panel team-editor');
      form.dataset.teamId = team.id;
      const nameLabel = element('label', '', 'Team name'); const title = element('input'); title.value = team.name; title.required = true; title.maxLength = 60; nameLabel.append(title);
      form.append(nameLabel); const slots = element('div', 'team-slots');
      const selectors = [];
      let caughtOnly = false;
      const source = element('div', 'team-source');
      source.setAttribute('role', 'group'); source.setAttribute('aria-label', 'Choose team search source');
      const allButton = action('All Pokémon', () => { caughtOnly = false; refreshSource(); });
      const caughtButton = action('Caught Pokémon', () => { caughtOnly = true; refreshSource(); });
      const sourceHelp = element('p', 'form-help'); sourceHelp.setAttribute('role', 'status');
      const retryCollection = action('Retry collection', () => globalThis.TrainerProgress?.refresh(), 'text-button');
      const collection = () => globalThis.TrainerProgress?.caughtState() || {ready:false,ids:new Set(),error:'Collection could not load. Refresh this page.'};
      function refreshSource() {
        const state = collection();
        allButton.setAttribute('aria-pressed', String(!caughtOnly));
        caughtButton.setAttribute('aria-pressed', String(caughtOnly));
        sourceHelp.textContent = caughtOnly
          ? !state.ready ? state.error || 'Loading your caught Pokémon…'
            : state.ids.size ? `Search your ${state.ids.size} caught Pokémon. Existing team members stay in place.` : 'No caught Pokémon yet. Mark Pokémon as Caught in the National Pokédex, or choose All Pokémon.'
          : 'Search the full National Pokédex, or choose from your caught Pokémon.';
        retryCollection.hidden = !caughtOnly || !state.error;
        selectors.forEach(selector => selector.refresh?.());
      }
      source.append(allButton, caughtButton, sourceHelp, retryCollection); form.append(source);
      caughtFilters.add(refreshSource); refreshSource();
      let analysisOpen = false;
      const analysisPanel = element('section'); analysisPanel.hidden = true;
      const updateAnalysis = () => { if (analysisOpen) globalThis.DexhavenTeamAnalysis?.render(analysisPanel, selectors.map(s => s.value).filter(Boolean)); };
      for (let slot = 0; slot < 6; slot++) {
        const box = element('div', 'team-slot'); const preview = element('div');
        const update = value => { preview.replaceChildren(); if (value) preview.append(miniPokemon(value)); else preview.append(element('span', 'empty-slot-art', '+')); };
        if (!selectorFactory) {
          const value = team.pokemonIds[slot] || null;
          selectors.push({ value }); update(value);
          box.append(preview, element('p', 'form-help', `Slot ${slot + 1} · Selection temporarily unavailable`));
          slots.append(box); continue;
        }
        const selector = selectorFactory({
          slot: slot + 1, selectedId: team.pokemonIds[slot], total: TOTAL,
          getPokemon: id => state.pokemon.get(id), formatName: prettyName, makeArtwork: artwork,
          eligibleIds: () => caughtOnly ? collection().ready ? collection().ids : new Set() : null,
          excludedIds: () => new Set(selectors.filter(other => other !== selector).map(other => other.value).filter(Boolean)),
          onChange(value) { update(value); selectors.forEach(other => other.refresh()); updateAnalysis(); }
        });
        selectors.push(selector); teamSelectors.add(selector);
        update(selector.value); box.append(preview, selector.element); slots.append(box);
      }
      const save = element('button', 'action-button', 'Save team'); save.type = 'submit';
      const remove = action('Delete team', async () => {
        if (!confirm(`Delete “${team.name}”? This cannot be undone.`)) return;
        remove.disabled = true; save.disabled = true; notice('Deleting team…');
        try {
          await request(`/teams/${team.id}`, { method: 'DELETE' });
          session.teams = session.teams.filter(saved => saved.id !== team.id);
          globalThis.TrainerProgress?.refresh();
          notice('Team deleted.');
          if (activeView === '/teams' || activeView === '/profile') renderPage();
        } catch (error) { notice(error.message, true); }
        finally { remove.disabled = false; save.disabled = false; }
      }, 'text-button delete-team');
      remove.setAttribute('aria-label', `Delete team ${team.name}`);
      const analyze = action('Analyze Team', () => { analysisOpen = !analysisOpen; analysisPanel.hidden = !analysisOpen; analyze.setAttribute('aria-expanded', String(analysisOpen)); updateAnalysis(); });
      analyze.setAttribute('aria-expanded', 'false'); analysisPanel.id = `team-analysis-${team.id}`; analyze.setAttribute('aria-controls', analysisPanel.id);
      const actions = element('div', 'team-actions'); actions.append(save, analyze, remove); form.append(slots, actions, element('p','form-help','Analysis follows your current slot selections, including unsaved changes. Public visitors see the last saved lineup.'));
      content.append(form);
      globalThis.DexhavenCommunity?.teamSettings(form, team, {request, notice});
      form.append(analysisPanel);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const pokemonIds = selectors.map(selector => selector.value).filter(Boolean);
        if (new Set(pokemonIds).size !== pokemonIds.length) { notice('Choose each Pokémon only once per team.', true); return; }
        save.disabled = true; remove.disabled = true;
        notice('Saving team…');
        try {
          const { team: saved } = await request(`/teams/${team.id}`, { method: 'PUT', body: { name: title.value, pokemonIds } });
          session.teams = session.teams.map(existing => existing.id === team.id ? { ...existing, ...saved } : existing);
          team.name = saved.name; team.pokemonIds = saved.pokemonIds;
          globalThis.TrainerProgress?.refresh();
          remove.setAttribute('aria-label', `Delete team ${saved.name}`);
          notice('Team saved.');
          updateAnalysis();
        }
        catch (error) { notice(error.message, true); } finally { save.disabled = false; remove.disabled = false; }
      });
    });
  }
  function openTeamPicker(pokemonId) {
    if (!session.user) { openAuth(); return; }
    const controls = $('#detail-content .detail-account-actions');
    controls.querySelector('.team-picker')?.remove();
    const picker = element('div', 'team-picker');
    if (!session.teams.length) { picker.append(action('Create your first team', () => { dialog.close(); navigate('/teams'); })); controls.append(picker); return; }
    const label = element('label', '', 'Choose a team'); const select = element('select');
    session.teams.forEach(team => { const option = element('option', '', team.name); option.value = team.id; select.append(option); }); label.append(select);
    const add = action('Add Pokémon', async () => {
      const team = session.teams.find(team => team.id === Number(select.value));
      if (team.pokemonIds.includes(pokemonId)) { notice('That Pokémon is already on this team.', true); return; }
      if (team.pokemonIds.length >= 6) { notice('That team already has six Pokémon. Replace a slot in My Teams.', true); return; }
      add.disabled = true;
      try { await request(`/teams/${team.id}`, { method: 'PUT', body: { name: team.name, pokemonIds: [...team.pokemonIds, pokemonId] } }); globalThis.TrainerProgress?.refresh(); await loadPrivateData(); notice('Pokémon added to your team.'); picker.remove(); }
      catch (error) { notice(error.message, true); } finally { add.disabled = false; }
    });
    picker.append(label, add); controls.append(picker);
  }
  document.querySelectorAll('[data-view]').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate(link.dataset.view);
  }));
  window.addEventListener('popstate', () => navigate(viewFromLocation(), false));
  window.addEventListener('hashchange', () => navigate(viewFromLocation(), false));
  $('#account-button').addEventListener('click', () => session.user ? navigate('/profile') : openAuth());
  $('#register-button').addEventListener('click', () => openAuth('register'));
  $('#close-auth').addEventListener('click', () => authDialog.close());
  $('#auth-switch').addEventListener('click', () => { authMode = authMode === 'login' ? 'register' : 'login'; $('#auth-error').hidden = true; setAuthMode(); });
  $('#auth-form').addEventListener('submit', async event => {
    event.preventDefault(); $('#auth-submit').disabled = true; $('#auth-error').hidden = true;
    try {
      // Refresh anonymous CSRF state if the initial API request failed or the session expired.
      await refreshSession();
      const body = authMode === 'register' ? { username: $('#auth-username').value, email: $('#auth-email').value, password: $('#auth-password').value } : { identifier: $('#auth-identifier').value, password: $('#auth-password').value };
      const data = await request(`/auth/${authMode}`, { method: 'POST', body });
      session.user = data.user; session.csrf = data.csrfToken; session.ready = true; session.privateReady = false; session.privateError = '';
      updateAccountUI(); authDialog.close(); $('#auth-form').reset();
      notice(`Welcome, ${session.user.username}!`);
      try { await loadPrivateData(); } catch (error) { notice(`Logged in, but trainer data could not be loaded: ${error.message}`, true); }
      navigate(activeView);
    } catch (error) { $('#auth-error').textContent = error.message; $('#auth-error').hidden = false; }
    finally { $('#auth-submit').disabled = false; }
  });
  $('#logout-button').addEventListener('click', async () => {
    $('#logout-button').disabled = true;
    try { await request('/auth/logout', { method: 'POST' }); session.user = null; session.csrf = ''; session.favorites.clear(); session.teams = []; session.privateReady = false; updateAccountUI(); navigate('/'); notice('Logged out.'); await refreshSession(); }
    catch (error) { notice(error.message, true); } finally { $('#logout-button').disabled = false; }
  });
  globalThis.PokedexAccounts = { decorateCard, decorateDetails, onPokemonUpdate };
  $('#header-profile').addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigate('/profile');
  });
  $('#header-avatar').addEventListener('error', () => {
    $('#header-avatar').hidden = true; $('#header-avatar-initial').hidden = false;
  });
  $('#trainer-catalog-retry')?.addEventListener('click', loadTrainerCatalogue);
  $('#hub-login')?.addEventListener('click', () => openAuth());
  $('#hub-register')?.addEventListener('click', () => openAuth('register'));
  $('#home-register')?.addEventListener('click', () => openAuth('register'));
  $('#home-login')?.addEventListener('click', () => openAuth());
  updateAccountUI();
  [...(grid?.children || [])].forEach(tile => { const pokemon = state.pokemon.get(Number(tile.dataset.id)); if (pokemon) decorateCard(tile, pokemon); });
  navigate(activeView, false);
  refreshSession().then(() => { if (activeView !== '/') renderPage(); }).catch(() => {
    session.ready = true;
    updateAccountUI();
    if (activeView !== '/') { renderPage(); notice('Accounts are unavailable. Start the Express server and check the database configuration.', true); }
  });
})();
