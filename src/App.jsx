import React, { useState, useEffect, useMemo, useCallback } from 'react';
import CONJUROS_DATA from './data/conjuros.json';
import DOTES_DATA from './data/dotes.json';
import COVER_IMAGE from './assets/cover.jpg';
import PAGE_HEADER_IMAGE from './assets/page-header.jpg';
import PAGE_MIDDLE_IMAGE from './assets/page-middle.jpg';
import PAGE_FOOTER_IMAGE from './assets/page-footer.jpg';



const ESCUELA_COLORS = {
  'Abjuración': '#5a9ab0',
  'Adivinación': '#8a7aa8',
  'Conjuración': '#6ed9a0',
  'Encantamiento': '#a8748c',
  'Evocación': '#b8a05a',
  'Ilusión': '#5a8aa0',
  'Nigromancia': '#8a5a5a',
  'Transmutación': '#9a8460',
  'Universal': '#7c8890',
};

const MANUAL_NAMES = {
  'MJ1': 'Manual del Jugador',
  'CC': 'Compendio de Conjuros',
};

function manualLabel(m) {
  return MANUAL_NAMES[m] || m || '?';
}

function clasesArray(c) {
  if (!c) return [];
  return c.split(',').map(s => s.trim()).filter(Boolean);
}

const CHAR_INDEX_KEY = 'grimorio:personajes:index';

function charStorageKey(id) {
  return 'grimorio:personaje:' + id;
}

function makeCharId() {
  return 'char_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function emptyCharState(id) {
  return {
    id: id || makeCharId(),
    nombre: 'Jugador',
    clase: 'Mago',
    cdConjuros: '',
    nivelLanzador: '',
    conocidos: {},   // nombre+nivel -> true
    preparados: {},  // id unico (con metamagia) -> {spellKey, dotesAplicadas:[nombreDote,...], vecesPreparado}
    dotesActivas: {}, // nombreDote -> modificadorActual (editable)
    dotesTenidas: {}, // nombreDote -> true (el personaje tiene esta dote)
    limitesPreparados: {}, // nivel (0-9) -> numero maximo de conjuros preparados de ese nivel efectivo (undefined/null = sin limite)
    ocultosPreparados: {}, // id de preparado -> true (oculto temporalmente, no eliminado; se restablece con resetAllPrepared)
    customSpells: [],
    customFeats: [],
    spellOverrides: {}, // spellKey(nombre,nivelOriginal) -> campos editados (incluye nivel nuevo si cambia)
    featOverrides: {},  // nombreDote original -> campos editados (incluye nombre nuevo si cambia)
  };
}

function spellKey(nombre, nivel) {
  return nombre + '@@' + nivel;
}

const TABS = ['conocidos', 'preparados', 'dotes', 'catalogo'];
const ALL_LEVELS = Array.from({ length: 10 }, (_, i) => i);
const ALL_SCHOOLS = ['Abjuración', 'Adivinación', 'Conjuración', 'Encantamiento', 'Evocación', 'Ilusión', 'Nigromancia', 'Transmutación', 'Universal'];
const ALL_CLASSES = ['Mago', 'Hechicero', 'Bardo', 'Clérigo', 'Druida', 'Explorador', 'Paladín'];

function allLevelsOn() {
  const o = {};
  ALL_LEVELS.forEach(l => { o[l] = true; });
  return o;
}

function allSchoolsOn() {
  const o = {};
  ALL_SCHOOLS.forEach(s => { o[s] = true; });
  return o;
}

export default function LibroDeConjurosApp() {
  const [coverOpen, setCoverOpen] = useState(true);
  const [allSpells, setAllSpells] = useState(() => CONJUROS_DATA);
  const [allFeats, setAllFeats] = useState(() => DOTES_DATA);
  const [charState, setCharState] = useState(() => emptyCharState());
  const [charList, setCharList] = useState([]); // [{id, nombre, clase}, ...]
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('preparados'); // 'conocidos' | 'preparados' | 'dotes' | 'catalogo'
  const [activeLevel, setActiveLevel] = useState(0);
  const [knownLevelsOn, setKnownLevelsOn] = useState(allLevelsOn);
  const [knownSchoolsOn, setKnownSchoolsOn] = useState(allSchoolsOn);
  const [catLevelsOn, setCatLevelsOn] = useState(allLevelsOn);
  const [catSchoolsOn, setCatSchoolsOn] = useState(allSchoolsOn);
  const [sortBy, setSortBy] = useState('nivel'); // 'nivel' | 'nombre'
  const [catSortBy, setCatSortBy] = useState('nivel');
  const [search, setSearch] = useState('');
  const [catSearch, setCatSearch] = useState('');
  const [metaModalSpell, setMetaModalSpell] = useState(null); // spell being prepared with metamagic chooser
  const [selectedMetamagic, setSelectedMetamagic] = useState([]);
  const [toast, setToast] = useState(null);

  // Releer la lista de personajes (id + nombre + clase) desde localStorage
  const refreshCharList = useCallback((activeId) => {
    try {
      const raw = localStorage.getItem(CHAR_INDEX_KEY);
      const idx = raw ? JSON.parse(raw) : { ids: [] };
      const list = (idx.ids || []).map(id => {
        try {
          const cRaw = localStorage.getItem(charStorageKey(id));
          const c = cRaw ? JSON.parse(cRaw) : null;
          return { id, nombre: c?.nombre || 'Jugador', clase: c?.clase || 'Mago' };
        } catch (e) {
          return { id, nombre: 'Jugador', clase: 'Mago' };
        }
      });
      setCharList(list);
    } catch (e) {
      // nada que listar
    }
  }, []);

  // Cargar estado guardado (indice de personajes + personaje activo)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAR_INDEX_KEY);
      let idx = raw ? JSON.parse(raw) : null;

      if (!idx || !idx.ids || idx.ids.length === 0) {
        // Primera vez: migrar personaje antiguo (clave fija anterior) si existe, o crear uno nuevo
        const legacyRaw = localStorage.getItem('grimorio:personaje:default');
        let initial;
        if (legacyRaw) {
          const legacyParsed = JSON.parse(legacyRaw);
          initial = { ...emptyCharState(), ...legacyParsed };
        } else {
          initial = emptyCharState();
        }
        idx = { activeId: initial.id, ids: [initial.id] };
        localStorage.setItem(charStorageKey(initial.id), JSON.stringify(initial));
        localStorage.setItem(CHAR_INDEX_KEY, JSON.stringify(idx));
        setCharState(initial);
      } else {
        const activeId = idx.ids.includes(idx.activeId) ? idx.activeId : idx.ids[0];
        const cRaw = localStorage.getItem(charStorageKey(activeId));
        const parsed = cRaw ? JSON.parse(cRaw) : emptyCharState(activeId);
        setCharState({ ...emptyCharState(activeId), ...parsed });
      }
      refreshCharList(idx.activeId);
    } catch (e) {
      // no existe aun, usar estado vacio
    }
    setLoaded(true);
  }, [refreshCharList]);

  // Guardar estado del personaje activo (debounced simple)
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(charStorageKey(charState.id), JSON.stringify(charState));
        refreshCharList(charState.id);
      } catch (e) {
        console.error('Error guardando', e);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [charState, loaded, refreshCharList]);

  const switchCharacter = useCallback((id) => {
    try {
      const cRaw = localStorage.getItem(charStorageKey(id));
      const parsed = cRaw ? JSON.parse(cRaw) : emptyCharState(id);
      setCharState({ ...emptyCharState(id), ...parsed });
      const raw = localStorage.getItem(CHAR_INDEX_KEY);
      const idx = raw ? JSON.parse(raw) : { ids: [id] };
      idx.activeId = id;
      if (!idx.ids.includes(id)) idx.ids.push(id);
      localStorage.setItem(CHAR_INDEX_KEY, JSON.stringify(idx));
    } catch (e) {
      console.error('Error cambiando de personaje', e);
    }
  }, []);

  const createCharacter = useCallback(() => {
    const fresh = emptyCharState();
    try {
      localStorage.setItem(charStorageKey(fresh.id), JSON.stringify(fresh));
      const raw = localStorage.getItem(CHAR_INDEX_KEY);
      const idx = raw ? JSON.parse(raw) : { ids: [] };
      idx.ids.push(fresh.id);
      idx.activeId = fresh.id;
      localStorage.setItem(CHAR_INDEX_KEY, JSON.stringify(idx));
    } catch (e) {
      console.error('Error creando personaje', e);
    }
    setCharState(fresh);
    refreshCharList(fresh.id);
  }, [refreshCharList]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const combinedSpells = useMemo(() => {
    const overrides = charState.spellOverrides || {};
    const base = allSpells.map(s => {
      const key = spellKey(s.nombre, s.nivel);
      const ov = overrides[key];
      return ov ? { ...s, ...ov, _origKey: key } : { ...s, _origKey: key };
    });
    const custom = (charState.customSpells || []).map(s => {
      const key = spellKey(s.nombre, s.nivel);
      const ov = overrides[key];
      return ov ? { ...s, ...ov, _origKey: key } : { ...s, _origKey: key };
    });
    return [...base, ...custom];
  }, [allSpells, charState.customSpells, charState.spellOverrides]);

  const combinedFeats = useMemo(() => {
    const overrides = charState.featOverrides || {};
    const base = allFeats.map(f => {
      const ov = overrides[f.nombre];
      return ov ? { ...f, ...ov, _origNombre: f.nombre } : { ...f, _origNombre: f.nombre };
    });
    const custom = (charState.customFeats || []).map(f => {
      const ov = overrides[f.nombre];
      return ov ? { ...f, ...ov, _origNombre: f.nombre } : { ...f, _origNombre: f.nombre };
    });
    return [...base, ...custom];
  }, [allFeats, charState.customFeats, charState.featOverrides]);

  const escuelasPresentes = useMemo(() => {
    const s = new Set(combinedSpells.map(c => c.escuela).filter(Boolean));
    return ALL_SCHOOLS.filter(e => s.has(e)).concat(Array.from(s).filter(e => !ALL_SCHOOLS.includes(e)).sort());
  }, [combinedSpells]);

  // ---- Filtro y orden (vista "conocidos": solo conjuros marcados) ----
  const filteredSpells = useMemo(() => {
    let list = combinedSpells.filter(c => charState.conocidos[spellKey(c.nombre, c.nivel)]);
    list = list.filter(c => knownLevelsOn[c.nivel]);
    list = list.filter(c => knownSchoolsOn[c.escuela] !== false);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => c.nombre.toLowerCase().includes(q));
    }
    if (sortBy === 'nombre') {
      list = [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    } else {
      list = [...list].sort((a, b) => a.nivel - b.nivel || a.nombre.localeCompare(b.nombre, 'es'));
    }
    return list;
  }, [combinedSpells, search, sortBy, charState.conocidos, knownLevelsOn, knownSchoolsOn]);

  // ---- Filtro y orden (vista "catálogo": todos los conjuros) ----
  const filteredCatalog = useMemo(() => {
    let list = combinedSpells;
    list = list.filter(c => catLevelsOn[c.nivel]);
    list = list.filter(c => catSchoolsOn[c.escuela] !== false);
    if (catSearch.trim()) {
      const q = catSearch.trim().toLowerCase();
      list = list.filter(c => c.nombre.toLowerCase().includes(q));
    }
    if (catSortBy === 'nombre') {
      list = [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    } else {
      list = [...list].sort((a, b) => a.nivel - b.nivel || a.nombre.localeCompare(b.nombre, 'es'));
    }
    return list;
  }, [combinedSpells, catSearch, catSortBy, catLevelsOn, catSchoolsOn]);

  const levelCounts = useMemo(() => {
    const counts = {};
    for (let i = 0; i <= 9; i++) counts[i] = 0;
    combinedSpells.forEach(c => {
      if (charState.conocidos[spellKey(c.nombre, c.nivel)]) {
        counts[c.nivel] = (counts[c.nivel] || 0) + 1;
      }
    });
    return counts;
  }, [combinedSpells, charState.conocidos]);

  const preparedList = useMemo(() => {
    return Object.entries(charState.preparados || {}).map(([id, data]) => {
      const [nombre, nivelStr] = data.spellKey.split('@@');
      const spell = combinedSpells.find(c => c.nombre === nombre && String(c.nivel) === nivelStr);
      return { id, ...data, spell, nombre, nivelBase: parseInt(nivelStr, 10) };
    }).filter(p => p.spell);
  }, [charState.preparados, combinedSpells]);

  const preparedByEffectiveLevel = useMemo(() => {
    const grouped = {};
    preparedList.forEach(p => {
      const mod = (p.dotesAplicadas || []).reduce((sum, fname) => {
        const f = combinedFeats.find(ft => ft.nombre === fname);
        if (!f) return sum;
        const baseModif = parseInt(charState.dotesActivas[fname] ?? f.modificador_nivel, 10);
        return sum + (isNaN(baseModif) ? 0 : baseModif);
      }, 0);
      const effLevel = p.nivelBase + mod;
      if (!grouped[effLevel]) grouped[effLevel] = [];
      grouped[effLevel].push({ ...p, effLevel, mod });
    });
    return grouped;
  }, [preparedList, combinedFeats, charState.dotesActivas]);

  const visiblePreparedByEffectiveLevel = useMemo(() => {
    const ocultos = charState.ocultosPreparados || {};
    const grouped = {};
    Object.entries(preparedByEffectiveLevel).forEach(([lvl, list]) => {
      const visibles = list.filter(p => !ocultos[p.id]);
      if (visibles.length > 0) grouped[lvl] = visibles;
    });
    return grouped;
  }, [preparedByEffectiveLevel, charState.ocultosPreparados]);

  // ---- Acciones ----
  const updateNombre = useCallback((nuevoNombre) => {
    setCharState(prev => ({ ...prev, nombre: nuevoNombre || 'Jugador' }));
  }, []);

  const updateClase = useCallback((nuevaClase) => {
    setCharState(prev => ({ ...prev, clase: nuevaClase || 'Mago' }));
  }, []);

  const updateCdConjuros = useCallback((valor) => {
    setCharState(prev => ({ ...prev, cdConjuros: valor }));
  }, []);

  const updateNivelLanzador = useCallback((valor) => {
    setCharState(prev => ({ ...prev, nivelLanzador: valor }));
  }, []);

  const toggleConocido = useCallback((spell) => {
    const key = spellKey(spell.nombre, spell.nivel);
    setCharState(prev => {
      const next = { ...prev, conocidos: { ...prev.conocidos } };
      if (next.conocidos[key]) {
        delete next.conocidos[key];
      } else {
        next.conocidos[key] = true;
      }
      return next;
    });
  }, []);

  const toggleDoteTenida = useCallback((nombreDote) => {
    setCharState(prev => {
      const next = { ...prev, dotesTenidas: { ...prev.dotesTenidas } };
      if (next.dotesTenidas[nombreDote]) {
        delete next.dotesTenidas[nombreDote];
      } else {
        next.dotesTenidas[nombreDote] = true;
      }
      return next;
    });
  }, []);

  const openPrepareModal = useCallback((spell) => {
    setMetaModalSpell(spell);
    setSelectedMetamagic([]);
  }, []);

  const confirmPrepare = useCallback(() => {
    if (!metaModalSpell) return;
    const mod = selectedMetamagic.reduce((sum, fname) => {
      const f = combinedFeats.find(ft => ft.nombre === fname);
      if (!f) return sum;
      const v = parseInt(charState.dotesActivas[fname] ?? f.modificador_nivel, 10);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
    const effLevel = metaModalSpell.nivel + mod;
    const limite = charState.limitesPreparados ? charState.limitesPreparados[effLevel] : null;
    if (limite !== undefined && limite !== null && limite !== '') {
      const limiteNum = parseInt(limite, 10);
      const yaPreparados = (preparedByEffectiveLevel[effLevel] || []).length;
      if (!isNaN(limiteNum) && yaPreparados >= limiteNum) {
        showToast(`No hay espacios libres de nivel ${effLevel} (límite: ${limiteNum})`);
        return;
      }
    }
    const id = metaModalSpell.nombre + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setCharState(prev => ({
      ...prev,
      preparados: {
        ...prev.preparados,
        [id]: {
          spellKey: spellKey(metaModalSpell.nombre, metaModalSpell.nivel),
          dotesAplicadas: [...selectedMetamagic],
        },
      },
    }));
    showToast(`${metaModalSpell.nombre} preparado`);
    setMetaModalSpell(null);
    setSelectedMetamagic([]);
  }, [metaModalSpell, selectedMetamagic, showToast, combinedFeats, charState.dotesActivas, charState.limitesPreparados, preparedByEffectiveLevel]);

  const removePrepared = useCallback((id) => {
    setCharState(prev => ({
      ...prev,
      ocultosPreparados: { ...prev.ocultosPreparados, [id]: true },
    }));
  }, []);

  const deletePrepared = useCallback((id) => {
    setCharState(prev => {
      const next = { ...prev, preparados: { ...prev.preparados }, ocultosPreparados: { ...prev.ocultosPreparados } };
      delete next.preparados[id];
      delete next.ocultosPreparados[id];
      return next;
    });
  }, []);

  const resetAllPrepared = useCallback(() => {
    setCharState(prev => ({ ...prev, ocultosPreparados: {} }));
    showToast('Todos los conjuros preparados vuelven a mostrarse');
  }, [showToast]);

  const updateLimitePreparado = useCallback((nivel, value) => {
    setCharState(prev => ({
      ...prev,
      limitesPreparados: { ...prev.limitesPreparados, [nivel]: value },
    }));
  }, []);

  const toggleMetamagic = useCallback((featName) => {
    setSelectedMetamagic(prev =>
      prev.includes(featName) ? prev.filter(f => f !== featName) : [...prev, featName]
    );
  }, []);

  const updateFeatModifier = useCallback((featName, value) => {
    setCharState(prev => ({
      ...prev,
      dotesActivas: { ...prev.dotesActivas, [featName]: value },
    }));
  }, []);

  const addCustomSpell = useCallback((spell) => {
    setCharState(prev => ({
      ...prev,
      customSpells: [...(prev.customSpells || []), spell],
    }));
    showToast(`${spell.nombre} añadido a tu libro de conjuros`);
  }, [showToast]);

  const addCustomFeat = useCallback((feat) => {
    setCharState(prev => ({
      ...prev,
      customFeats: [...(prev.customFeats || []), feat],
    }));
    showToast(`${feat.nombre} añadida`);
  }, [showToast]);

  const updateSpell = useCallback((spell, fields) => {
    setCharState(prev => {
      const isCustom = (prev.customSpells || []).some(s => spellKey(s.nombre, s.nivel) === spell._origKey);
      if (isCustom) {
        return {
          ...prev,
          customSpells: prev.customSpells.map(s =>
            spellKey(s.nombre, s.nivel) === spell._origKey ? { ...s, ...fields } : s
          ),
        };
      }
      return {
        ...prev,
        spellOverrides: { ...prev.spellOverrides, [spell._origKey]: { ...(prev.spellOverrides || {})[spell._origKey], ...fields } },
      };
    });
    showToast(`${fields.nombre || spell.nombre} actualizado`);
  }, [showToast]);

  const updateFeat = useCallback((feat, fields) => {
    setCharState(prev => {
      const isCustom = (prev.customFeats || []).some(f => f.nombre === feat._origNombre);
      if (isCustom) {
        return {
          ...prev,
          customFeats: prev.customFeats.map(f =>
            f.nombre === feat._origNombre ? { ...f, ...fields } : f
          ),
        };
      }
      return {
        ...prev,
        featOverrides: { ...prev.featOverrides, [feat._origNombre]: { ...(prev.featOverrides || {})[feat._origNombre], ...fields } },
      };
    });
    showToast(`${fields.nombre || feat.nombre} actualizada`);
  }, [showToast]);

  if (coverOpen) {
    return <CoverScreen onOpen={() => setCoverOpen(false)} />;
  }

  const tabIndex = TABS.indexOf(view);
  const goToTab = (idx) => {
    const clamped = Math.max(0, Math.min(TABS.length - 1, idx));
    setView(TABS[clamped]);
  };

  return (
    <div className="grimoire-root">
      <style>{STYLES}</style>
      <div className="grimoire-bg" />
      <header className="gr-header">
        <div className="gr-header-inner">
          <CharacterHeader
            nombre={charState.nombre}
            onChangeNombre={updateNombre}
            clase={charState.clase}
            onChangeClase={updateClase}
            cdConjuros={charState.cdConjuros}
            onChangeCd={updateCdConjuros}
            nivelLanzador={charState.nivelLanzador}
            onChangeNivelLanzador={updateNivelLanzador}
            charList={charList}
            activeId={charState.id}
            onSwitchCharacter={switchCharacter}
            onCreateCharacter={createCharacter}
            limitesPreparados={charState.limitesPreparados}
            updateLimitePreparado={updateLimitePreparado}
          />
        </div>
        <nav className="gr-tabs">
          {[
            ['conocidos', 'Conjuros conocidos'],
            ['preparados', 'Preparados hoy'],
            ['dotes', 'Dotes de metamagia'],
            ['catalogo', 'Todos los conjuros'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={'gr-tab' + (view === key ? ' active' : '')}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <SwipeArea tabIndex={tabIndex} totalTabs={TABS.length} onSwipe={goToTab}>
        <main className="gr-main">
          {view === 'conocidos' && (
            <ConocidosView
              levelCounts={levelCounts}
              levelsOn={knownLevelsOn}
              setLevelsOn={setKnownLevelsOn}
              schoolsOn={knownSchoolsOn}
              setSchoolsOn={setKnownSchoolsOn}
              sortBy={sortBy}
              setSortBy={setSortBy}
              search={search}
              setSearch={setSearch}
              escuelasPresentes={escuelasPresentes}
              filteredSpells={filteredSpells}
              charState={charState}
              toggleConocido={toggleConocido}
              openPrepareModal={openPrepareModal}
            />
          )}

          {view === 'preparados' && (
            <PreparadosView
              preparedByEffectiveLevel={preparedByEffectiveLevel}
              visiblePreparedByEffectiveLevel={visiblePreparedByEffectiveLevel}
              removePrepared={removePrepared}
              deletePrepared={deletePrepared}
              resetAllPrepared={resetAllPrepared}
              limitesPreparados={charState.limitesPreparados}
            />
          )}

          {view === 'dotes' && (
            <DotesView
              combinedFeats={combinedFeats}
              dotesActivas={charState.dotesActivas}
              dotesTenidas={charState.dotesTenidas}
              toggleDoteTenida={toggleDoteTenida}
              updateFeatModifier={updateFeatModifier}
              addCustomFeat={addCustomFeat}
              updateFeat={updateFeat}
            />
          )}

          {view === 'catalogo' && (
            <CatalogoView
              activeLevel={activeLevel}
              levelsOn={catLevelsOn}
              setLevelsOn={setCatLevelsOn}
              schoolsOn={catSchoolsOn}
              setSchoolsOn={setCatSchoolsOn}
              sortBy={catSortBy}
              setSortBy={setCatSortBy}
              search={catSearch}
              setSearch={setCatSearch}
              escuelasPresentes={escuelasPresentes}
              filteredCatalog={filteredCatalog}
              charState={charState}
              toggleConocido={toggleConocido}
              addCustomSpell={addCustomSpell}
              updateSpell={updateSpell}
            />
          )}
        </main>
        <div className="gr-page-footer" />
      </SwipeArea>

      {metaModalSpell && (
        <MetamagicModal
          spell={metaModalSpell}
          feats={combinedFeats}
          dotesActivas={charState.dotesActivas}
          dotesTenidas={charState.dotesTenidas}
          selected={selectedMetamagic}
          onToggle={toggleMetamagic}
          onConfirm={confirmPrepare}
          onClose={() => setMetaModalSpell(null)}
        />
      )}

      {toast && <div className="gr-toast">{toast}</div>}
    </div>
  );
}

function CharacterHeader({
  nombre, onChangeNombre, clase, onChangeClase,
  cdConjuros, onChangeCd, nivelLanzador, onChangeNivelLanzador,
  charList, activeId, onSwitchCharacter, onCreateCharacter,
  limitesPreparados, updateLimitePreparado,
}) {
  const [showSheet, setShowSheet] = useState(false);

  const handleCharSelect = (e) => {
    const val = e.target.value;
    if (val === '__new__') {
      onCreateCharacter();
    } else {
      onSwitchCharacter(val);
    }
  };

  const sinDatos = !cdConjuros && !nivelLanzador;

  return (
    <div className="gr-sub-block">
      {charList && charList.length > 1 && (
        <select className="gr-char-select" value={activeId} onChange={handleCharSelect} title="Cambiar de personaje">
          {charList.map(c => (
            <option key={c.id} value={c.id}>{c.nombre} ({c.clase})</option>
          ))}
          <option value="__new__">+ Nuevo personaje</option>
        </select>
      )}
      {charList && charList.length <= 1 && (
        <button className="gr-new-char-link" onClick={onCreateCharacter} title="Crear otro personaje">
          + Nuevo personaje
        </button>
      )}
      <p className="gr-sub">
        <button
          className={'gr-emblem-btn' + (sinDatos ? ' unset' : '')}
          onClick={() => setShowSheet(true)}
          title="Datos del personaje que afectan a los conjuros"
        >
          <svg width="20" height="20" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.8"/>
            <circle cx="50" cy="50" r="41" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.55"/>
            <g stroke="#a060d0" strokeWidth="1" fill="none" opacity="0.9" strokeLinecap="round">
              <path d="M30,11 L30,17 M27,14 L33,14"/>
              <path d="M70,11 L70,17 M67,13 L73,15 M67,15 L73,13"/>
              <path d="M89,30 L83,30 M86,27 L86,33"/>
              <path d="M89,70 L83,70 M83,67 L89,73"/>
              <path d="M70,89 L70,83 M67,86 L73,86"/>
              <path d="M30,89 L30,83 M27,84 L33,88 M27,88 L33,84"/>
              <path d="M11,70 L17,70 M14,67 L14,73"/>
              <path d="M11,30 L17,30 M11,27 L17,33 M11,33 L17,27"/>
            </g>
            <g fill="currentColor">
              <path d="M50,3 L53,9 L50,15 L47,9 Z"/>
              <path d="M50,97 L53,91 L50,85 L47,91 Z"/>
              <path d="M3,50 L9,53 L15,50 L9,47 Z"/>
              <path d="M97,50 L91,53 L85,50 L91,47 Z"/>
            </g>
            <circle cx="50" cy="9" r="2" fill="#b070e0"/>
            <circle cx="50" cy="91" r="2" fill="#b070e0"/>
            <circle cx="9" cy="50" r="2" fill="#b070e0"/>
            <circle cx="91" cy="50" r="2" fill="#b070e0"/>
            <circle cx="50" cy="50" r="29" fill="#0e0a16" stroke="#c9952c" strokeWidth="2.2"/>
            <circle cx="50" cy="50" r="25" fill="none" stroke="#8a5a1a" strokeWidth="0.8"/>
            <path d="M50,30 C42,30 36,36 35,44 L33,60 C33,62 35,63 37,62 C41,59 45,57 50,57 C55,57 59,59 63,62 C65,63 67,62 67,60 L65,44 C64,36 58,30 50,30 Z" fill="#d4af6a"/>
            <path d="M50,30 L50,24" stroke="#d4af6a" strokeWidth="2" strokeLinecap="round"/>
            <ellipse cx="50" cy="46" rx="9" ry="12" fill="#0e0a16"/>
            <circle cx="46" cy="45" r="0.9" fill="#a060d0" opacity="0.7"/>
            <circle cx="54" cy="45" r="0.9" fill="#a060d0" opacity="0.7"/>
            <g fill="#c9952c">
              <path d="M50,66 C47,66 45,64 45,61 C47,62 49,63 50,66 Z"/>
              <path d="M50,66 C53,66 55,64 55,61 C53,62 51,63 50,66 Z"/>
              <path d="M50,62 C49,60 49,58 50,56 C51,58 51,60 50,62 Z"/>
            </g>
            <path d="M50,66 L50,73" stroke="#c9952c" strokeWidth="1" fill="none"/>
          </svg>
        </button>
        {' '}Conjuros de {nombre} · {clase}
      </p>

      {showSheet && (
        <div className="gr-modal-overlay" onClick={() => setShowSheet(false)}>
          <div className="gr-modal" onClick={e => e.stopPropagation()}>
            <h3>Datos del personaje</h3>

            <div className="gr-sheet-grid gr-sheet-grid-2">
              <label className="gr-sheet-field">
                <span>Nombre</span>
                <input
                  type="text"
                  className="gr-input"
                  value={nombre}
                  onChange={e => onChangeNombre(e.target.value)}
                />
              </label>
              <label className="gr-sheet-field">
                <span>Clase</span>
                <select className="gr-select" value={clase} onChange={e => onChangeClase(e.target.value)}>
                  {ALL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>

            <div className="gr-sheet-grid gr-sheet-grid-2">
              <label className="gr-sheet-field">
                <span>Nivel de lanzador</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="gr-input"
                  placeholder="0"
                  value={nivelLanzador}
                  onChange={e => onChangeNivelLanzador(e.target.value)}
                />
              </label>
              <label className="gr-sheet-field">
                <span>CD de tus conjuros</span>
                <input
                  type="text"
                  className="gr-input"
                  placeholder="0"
                  value={cdConjuros}
                  onChange={e => onChangeCd(e.target.value)}
                />
              </label>
            </div>

            <h3 className="gr-mini-title" style={{ marginTop: '14px' }}>Límites de preparación</h3>
            <p className="gr-modal-sub">Número máximo de conjuros que puedes tener preparados por nivel de espacio efectivo. Deja en blanco para no limitar ese nivel.</p>
            <div className="gr-limits-grid">
              {ALL_LEVELS.map(lvl => (
                <label key={lvl} className="gr-limit-row">
                  <span>Nivel {lvl}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="gr-feat-mod-input"
                    placeholder="∞"
                    value={limitesPreparados && limitesPreparados[lvl] !== undefined ? limitesPreparados[lvl] : ''}
                    onChange={e => updateLimitePreparado(lvl, e.target.value)}
                  />
                </label>
              ))}
            </div>

            <div className="gr-form-actions">
              <button className="gr-btn-prepare" onClick={() => setShowSheet(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EscuelaTag({ escuela }) {
  return (
    <span className="gr-escuela-tag" style={{ '--esc-color': '#722f37' }}>
      {escuela}
    </span>
  );
}

function LevelRibbon({ activeLevel, setActiveLevel, counts }) {
  return (
    <div className="gr-level-ribbon">
      {Array.from({ length: 10 }, (_, i) => i).map(lvl => (
        <button
          key={lvl}
          className={'gr-level-tab' + (activeLevel === lvl ? ' active' : '')}
          onClick={() => setActiveLevel(lvl)}
        >
          <span className="gr-level-num">{lvl}</span>
          {counts && counts[lvl] > 0 && <span className="gr-level-count">{counts[lvl]}</span>}
        </button>
      ))}
    </div>
  );
}

function ConocidosView({
  levelCounts, levelsOn, setLevelsOn, schoolsOn, setSchoolsOn,
  sortBy, setSortBy, search, setSearch, escuelasPresentes,
  filteredSpells, charState, toggleConocido, openPrepareModal,
}) {
  const toggleLevel = (lvl) => setLevelsOn(prev => ({ ...prev, [lvl]: !prev[lvl] }));
  const toggleSchool = (esc) => setSchoolsOn(prev => ({ ...prev, [esc]: prev[esc] === false ? true : false }));

  return (
    <div className="gr-page">
      <h2 className="gr-page-title">Conjuros conocidos</h2>
      <p className="gr-page-desc">Los conjuros que tu personaje ya conoce. Apaga un nivel o escuela para ocultarlos. Pulsa una tarjeta para prepararla o quitarla.</p>

      <LevelToggleRow levelsOn={levelsOn} onToggle={toggleLevel} counts={levelCounts} />
      <SchoolToggleRow schoolsOn={schoolsOn} onToggle={toggleSchool} escuelas={escuelasPresentes} />

      <div className="gr-toolbar">
        <input
          className="gr-input"
          placeholder="Buscar conjuro por nombre..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="gr-sort-toggle">
          <button className={sortBy === 'nivel' ? 'active' : ''} onClick={() => setSortBy('nivel')}>Por nivel</button>
          <button className={sortBy === 'nombre' ? 'active' : ''} onClick={() => setSortBy('nombre')}>A-Z</button>
        </div>
      </div>

      <div className="gr-spell-grid">
        {filteredSpells.length === 0 && (
          <div className="gr-empty">No conoces conjuros con estos filtros. Márcalos desde «Todos los conjuros».</div>
        )}
        {filteredSpells.map(spell => {
          const key = spell.nombre + '@@' + spell.nivel;
          return (
            <div key={key} className="gr-spell-card known">
              <div className="gr-spell-card-head">
                <h3>{spell.nombre}</h3>
                <span className="gr-spell-level">Nv.{spell.nivel}</span>
              </div>
              <EscuelaTag escuela={spell.escuela} />
              <p className="gr-spell-summary">{spell.resumen}</p>
              <div className="gr-spell-meta">
                <span>{manualLabel(spell.manual)}{spell.pagina ? `, pág. ${spell.pagina}` : ''}</span>
              </div>
              <div className="gr-spell-actions">
                <button className="gr-btn-prepare" onClick={() => openPrepareModal(spell)}>
                  Preparar
                </button>
                <button className="gr-btn-remove" onClick={() => toggleConocido(spell)}>
                  Quitar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LevelToggleRow({ levelsOn, onToggle, counts }) {
  return (
    <div className="gr-level-ribbon">
      {ALL_LEVELS.map(lvl => (
        <button
          key={lvl}
          className={'gr-level-tab' + (levelsOn[lvl] ? ' active' : ' off')}
          onClick={() => onToggle(lvl)}
          title={levelsOn[lvl] ? 'Ocultar nivel ' + lvl : 'Mostrar nivel ' + lvl}
        >
          <span className="gr-level-num">{lvl}</span>
          {counts && counts[lvl] > 0 && <span className="gr-level-count">{counts[lvl]}</span>}
        </button>
      ))}
    </div>
  );
}

function SchoolToggleRow({ schoolsOn, onToggle, escuelas }) {
  return (
    <div className="gr-school-row">
      {escuelas.map(esc => {
        const on = schoolsOn[esc] !== false;
        return (
          <button
            key={esc}
            className={'gr-school-chip' + (on ? ' on' : ' off')}
            style={{ '--esc-color': '#722f37' }}
            onClick={() => onToggle(esc)}
          >
            {esc}
          </button>
        );
      })}
    </div>
  );
}

function PreparadosView({ preparedByEffectiveLevel, visiblePreparedByEffectiveLevel, removePrepared, deletePrepared, resetAllPrepared, limitesPreparados }) {
  const [detailPrepared, setDetailPrepared] = useState(null);
  const pressTimer = React.useRef(null);
  const longPressFired = React.useRef(false);

  const effLevels = Object.keys(visiblePreparedByEffectiveLevel).map(Number).sort((a, b) => a - b);
  const totalPreparados = Object.values(preparedByEffectiveLevel).reduce((sum, list) => sum + list.length, 0);

  const startPress = (p) => {
    longPressFired.current = false;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setDetailPrepared(p);
    }, 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  const handleClick = (p) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    removePrepared(p.id);
  };

  return (
    <div className="gr-page">
      <div className="gr-catalog-head">
        <div>
          <h2 className="gr-page-title">Libro de conjuros preparados</h2>
          <p className="gr-page-desc">Pulsa un conjuro preparado para ocultarlo tras lanzarlo, o mantén pulsado para ver sus detalles. Pulsa la ✕ para eliminarlo de la lista. Restablece todos para que vuelvan a mostrarse los ocultos.</p>
        </div>
        <button className="gr-btn-fab" onClick={resetAllPrepared} title="Restablecer todos los preparados">↺</button>
      </div>

      {totalPreparados === 0 && <div className="gr-empty">Aún no has preparado ningún conjuro. Ve a «Conjuros conocidos» y pulsa «Preparar».</div>}

      {effLevels.map(lvl => {
        const limite = limitesPreparados ? limitesPreparados[lvl] : null;
        const limiteNum = limite !== undefined && limite !== null && limite !== '' ? parseInt(limite, 10) : null;
        const ocupados = (preparedByEffectiveLevel[lvl] || []).length;
        return (
          <div key={lvl} className="gr-eff-level-block">
            <div className="gr-eff-level-header">
              Nivel de espacio {lvl}
              {!isNaN(limiteNum) && limiteNum !== null && <span className="gr-limit-badge"> · {ocupados}/{limiteNum}</span>}
            </div>
            {visiblePreparedByEffectiveLevel[lvl].map(p => (
              <div
                key={p.id}
                className="gr-prepared-row clickable"
                onClick={() => handleClick(p)}
                onMouseDown={() => startPress(p)}
                onMouseUp={cancelPress}
                onMouseLeave={cancelPress}
                onTouchStart={() => startPress(p)}
                onTouchEnd={cancelPress}
                role="button"
                tabIndex={0}
                title="Pulsa para ocultar, mantén pulsado para ver detalles"
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick(p); }}
              >
                <div className="gr-prepared-info">
                  <strong>{p.nombre}</strong>
                  <span className="gr-prepared-base">base Nv.{p.nivelBase}</span>
                  {p.dotesAplicadas && p.dotesAplicadas.length > 0 && (
                    <div className="gr-prepared-feats">
                      {p.dotesAplicadas.map(f => <span key={f} className="gr-feat-chip">{f}</span>)}
                    </div>
                  )}
                </div>
                <span
                  className="gr-prepared-x clickable-x"
                  onClick={e => { e.stopPropagation(); cancelPress(); deletePrepared(p.id); }}
                  role="button"
                  tabIndex={0}
                  title="Eliminar de la lista de preparados"
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); deletePrepared(p.id); } }}
                >✕</span>
              </div>
            ))}
          </div>
        );
      })}

      {detailPrepared && (
        <div className="gr-modal-overlay" onClick={() => setDetailPrepared(null)}>
          <div className="gr-modal" onClick={() => setDetailPrepared(null)}>
            <h3>{detailPrepared.nombre}</h3>
            <p className="gr-modal-sub">Nivel base {detailPrepared.nivelBase} · Espacio de nivel {detailPrepared.effLevel}</p>
            {detailPrepared.spell && detailPrepared.spell.resumen && (
              <p className="gr-feat-desc">{detailPrepared.spell.resumen}</p>
            )}
            {detailPrepared.spell && (
              <div className="gr-spell-meta">
                <span>{detailPrepared.spell.escuela}{detailPrepared.spell.componentes ? ` · ${detailPrepared.spell.componentes}` : ''}</span>
              </div>
            )}
            {detailPrepared.dotesAplicadas && detailPrepared.dotesAplicadas.length > 0 && (
              <>
                <h3 className="gr-mini-title" style={{ marginTop: '14px' }}>Dotes aplicadas</h3>
                <div className="gr-prepared-feats">
                  {detailPrepared.dotesAplicadas.map(f => <span key={f} className="gr-feat-chip">{f}</span>)}
                </div>
              </>
            )}
            <p className="gr-modal-sub" style={{ marginTop: '14px' }}>Toca en cualquier lugar para cerrar.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DotesView({ combinedFeats, dotesActivas, dotesTenidas, toggleDoteTenida, updateFeatModifier, addCustomFeat, updateFeat }) {
  const [showForm, setShowForm] = useState(false);
  const [editingFeat, setEditingFeat] = useState(null); // feat object being edited, or null = creating new
  const [form, setForm] = useState({ nombre: '', modificador_nivel: '1', libro: '', pagina: '', descripcion: '', mejorable: 'no' });
  const [filterMode, setFilterMode] = useState('tenidas'); // 'tenidas' | 'todas'
  const [search, setSearch] = useState('');

  const openCreate = () => {
    setEditingFeat(null);
    setForm({ nombre: '', modificador_nivel: '1', libro: '', pagina: '', descripcion: '', mejorable: 'no' });
    setShowForm(true);
  };

  const openEdit = (e, feat) => {
    e.stopPropagation();
    setEditingFeat(feat);
    setForm({
      nombre: feat.nombre || '',
      modificador_nivel: feat.modificador_nivel || '1',
      libro: feat.libro || '',
      pagina: feat.pagina || '',
      descripcion: feat.descripcion || '',
      mejorable: feat.mejorable || 'no',
    });
    setShowForm(true);
  };

  const submit = () => {
    if (!form.nombre.trim()) return;
    if (editingFeat) {
      updateFeat(editingFeat, { ...form });
    } else {
      addCustomFeat({ ...form });
    }
    setShowForm(false);
    setEditingFeat(null);
  };

  const visibleFeats = combinedFeats.filter(f => {
    if (filterMode === 'tenidas' && !dotesTenidas[f.nombre]) return false;
    if (search.trim() && !f.nombre.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="gr-page">
      <div className="gr-catalog-head">
        <div>
          <h2 className="gr-page-title">Dotes de metamagia</h2>
          <p className="gr-page-desc">Pulsa una tarjeta para marcarla como tenida. El modificador de nivel es editable directamente, y «Editar» cambia cualquier otro dato, incluso en dotes oficiales.</p>
        </div>
        <button className="gr-btn-fab" onClick={openCreate} title="Añadir dote nueva">+</button>
      </div>

      <div className="gr-toolbar">
        <input
          className="gr-input"
          placeholder="Buscar dote por nombre..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="gr-sort-toggle">
          <button className={filterMode === 'tenidas' ? 'active' : ''} onClick={() => setFilterMode('tenidas')}>Tenidas</button>
          <button className={filterMode === 'todas' ? 'active' : ''} onClick={() => setFilterMode('todas')}>Todas</button>
        </div>
      </div>

      <div className="gr-feats-grid">
        {visibleFeats.length === 0 && (
          <div className="gr-empty">
            {filterMode === 'tenidas' ? 'No tienes ninguna dote marcada todavía.' : 'No hay dotes con estos filtros.'}
          </div>
        )}
        {visibleFeats.map(f => {
          const isTenida = !!dotesTenidas[f.nombre];
          return (
            <div
              key={f._origNombre || f.nombre}
              className={'gr-feat-card clickable' + (isTenida ? ' known' : '')}
              onClick={() => toggleDoteTenida(f.nombre)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleDoteTenida(f.nombre); }}
            >
              <div className="gr-feat-card-head">
                <h3>{f.nombre}</h3>
                {f.modificador_nivel !== undefined && f.modificador_nivel !== '-' && (
                  <div className="gr-feat-mod-edit" onClick={e => e.stopPropagation()}>
                    <span>Nv.</span>
                    <input
                      type="text"
                      className="gr-feat-mod-input"
                      value={dotesActivas[f.nombre] ?? f.modificador_nivel}
                      onChange={e => updateFeatModifier(f.nombre, e.target.value)}
                    />
                  </div>
                )}
              </div>
              <p className="gr-feat-desc">{f.descripcion}</p>
              <div className="gr-spell-meta">
                <span>{f.libro}{f.pagina && f.pagina !== '-' ? `, pág. ${f.pagina}` : ''}</span>
              </div>
              <div className={'gr-known-pill' + (isTenida ? ' on' : '')}>
                {isTenida ? '✓ Tenida' : 'Pulsa para marcar tenida'}
              </div>
              <button className="gr-btn-prepare small gr-btn-edit" onClick={e => openEdit(e, f)}>Editar</button>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="gr-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="gr-modal" onClick={e => e.stopPropagation()}>
            <h3>{editingFeat ? 'Editar dote de metamagia' : 'Nueva dote de metamagia'}</h3>
            <p className="gr-modal-sub">{editingFeat ? 'Los cambios se guardan solo en tu libro de conjuros.' : 'Se añadirá a tus dotes de metamagia.'}</p>
            <div className="gr-form-grid">
              <input className="gr-input" placeholder="Nombre" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
              <input className="gr-input" placeholder="Modificador de nivel (ej. 2)" value={form.modificador_nivel} onChange={e => setForm({ ...form, modificador_nivel: e.target.value })} />
              <input className="gr-input" placeholder="Libro de origen" value={form.libro} onChange={e => setForm({ ...form, libro: e.target.value })} />
              <input className="gr-input" placeholder="Página" value={form.pagina} onChange={e => setForm({ ...form, pagina: e.target.value })} />
            </div>
            <textarea className="gr-textarea" placeholder="Descripción / beneficio" value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
            <div className="gr-form-actions">
              <button className="gr-btn-prepare" onClick={submit}>{editingFeat ? 'Guardar cambios' : 'Guardar dote'}</button>
              <button className="gr-btn-remove" onClick={() => { setShowForm(false); setEditingFeat(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogoView({
  activeLevel, levelsOn, setLevelsOn, schoolsOn, setSchoolsOn,
  sortBy, setSortBy, search, setSearch, escuelasPresentes,
  filteredCatalog, charState, toggleConocido, addCustomSpell, updateSpell,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingSpell, setEditingSpell] = useState(null); // spell object being edited, or null = creating new
  const [form, setForm] = useState({
    nombre: '', nivel: String(activeLevel), escuela: escuelasPresentes[0] || 'Evocación', manual: 'Homebrew', pagina: '', resumen: '', clases: 'Mago,Hechicero',
  });

  const toggleLevel = (lvl) => setLevelsOn(prev => ({ ...prev, [lvl]: !prev[lvl] }));
  const toggleSchool = (esc) => setSchoolsOn(prev => ({ ...prev, [esc]: prev[esc] === false ? true : false }));

  const openForm = () => {
    setEditingSpell(null);
    setForm({ nombre: '', nivel: String(activeLevel), escuela: escuelasPresentes[0] || 'Evocación', manual: 'Homebrew', pagina: '', resumen: '', clases: 'Mago,Hechicero' });
    setShowForm(true);
  };

  const openEdit = (e, spell) => {
    e.stopPropagation();
    setEditingSpell(spell);
    setForm({
      nombre: spell.nombre || '',
      nivel: String(spell.nivel ?? 0),
      escuela: spell.escuela || 'Evocación',
      manual: spell.manual || 'Homebrew',
      pagina: spell.pagina || '',
      resumen: spell.resumen || '',
      clases: spell.clases || 'Mago,Hechicero',
    });
    setShowForm(true);
  };

  const submit = () => {
    if (!form.nombre.trim()) return;
    if (editingSpell) {
      updateSpell(editingSpell, { ...form, nivel: parseInt(form.nivel, 10) || 0 });
    } else {
      addCustomSpell({ ...form, nivel: parseInt(form.nivel, 10) || 0 });
    }
    setShowForm(false);
    setEditingSpell(null);
  };

  return (
    <div className="gr-page">
      <div className="gr-catalog-head">
        <div>
          <h2 className="gr-page-title">Todos los conjuros</h2>
          <p className="gr-page-desc">El catálogo completo de conjuros. Pulsa una tarjeta para marcarla como conocida, usa «Editar» para modificarla (incluso conjuros oficiales), o añade una nueva con el botón +.</p>
        </div>
        <button className="gr-btn-fab" onClick={openForm} title="Añadir conjuro nuevo">+</button>
      </div>

      <LevelToggleRow levelsOn={levelsOn} onToggle={toggleLevel} />
      <SchoolToggleRow schoolsOn={schoolsOn} onToggle={toggleSchool} escuelas={escuelasPresentes} />

      <div className="gr-toolbar">
        <input
          className="gr-input"
          placeholder="Buscar conjuro por nombre..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="gr-sort-toggle">
          <button className={sortBy === 'nivel' ? 'active' : ''} onClick={() => setSortBy('nivel')}>Por nivel</button>
          <button className={sortBy === 'nombre' ? 'active' : ''} onClick={() => setSortBy('nombre')}>A-Z</button>
        </div>
      </div>

      <div className="gr-spell-grid">
        {filteredCatalog.length === 0 && (
          <div className="gr-empty">No hay conjuros con estos filtros.</div>
        )}
        {filteredCatalog.map(spell => {
          const key = spell.nombre + '@@' + spell.nivel;
          const isKnown = !!charState.conocidos[key];
          return (
            <div
              key={key}
              className={'gr-spell-card clickable' + (isKnown ? ' known' : '')}
              onClick={() => toggleConocido(spell)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleConocido(spell); }}
            >
              <div className="gr-spell-card-head">
                <h3>{spell.nombre}</h3>
                <span className="gr-spell-level">Nv.{spell.nivel}</span>
              </div>
              <EscuelaTag escuela={spell.escuela} />
              <p className="gr-spell-summary">{spell.resumen}</p>
              <div className="gr-spell-meta">
                <span>{manualLabel(spell.manual)}{spell.pagina ? `, pág. ${spell.pagina}` : ''}</span>
              </div>
              <div className={'gr-known-pill' + (isKnown ? ' on' : '')}>
                {isKnown ? '✓ Conocido' : 'Pulsa para marcar conocido'}
              </div>
              <button className="gr-btn-prepare small gr-btn-edit" onClick={e => openEdit(e, spell)}>Editar</button>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="gr-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="gr-modal" onClick={e => e.stopPropagation()}>
            <h3>{editingSpell ? 'Editar conjuro' : 'Nuevo conjuro'}</h3>
            <p className="gr-modal-sub">{editingSpell ? 'Los cambios se guardan solo en tu libro de conjuros.' : 'Se añadirá al catálogo en su sitio correspondiente por nivel.'}</p>
            <div className="gr-form-grid">
              <input className="gr-input" placeholder="Nombre del conjuro" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
              <select className="gr-select" value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })}>
                {ALL_LEVELS.map(n => <option key={n} value={n}>Nivel {n}</option>)}
              </select>
              <select className="gr-select" value={form.escuela} onChange={e => setForm({ ...form, escuela: e.target.value })}>
                {ALL_SCHOOLS.map(e => <option key={e} value={e}>{e}</option>)}
                <option value="Homebrew">Otra / Homebrew</option>
              </select>
              <input className="gr-input" placeholder="Página del libro (opcional)" value={form.pagina} onChange={e => setForm({ ...form, pagina: e.target.value })} />
            </div>
            <textarea className="gr-textarea" placeholder="Resumen / efecto del conjuro" value={form.resumen} onChange={e => setForm({ ...form, resumen: e.target.value })} />
            <div className="gr-form-actions">
              <button className="gr-btn-prepare" onClick={submit}>{editingSpell ? 'Guardar cambios' : 'Añadir al libro de conjuros'}</button>
              <button className="gr-btn-remove" onClick={() => { setShowForm(false); setEditingSpell(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CoverScreen({ onOpen }) {
  return (
    <div className="gr-cover" onClick={onOpen}>
      <style>{STYLES}</style>
      <div className="gr-cover-book" style={{ backgroundImage: `url(${COVER_IMAGE})` }}>
        <div className="gr-cover-hint-wrap">
          <p className="gr-cover-hint">Toca para abrir</p>
        </div>
      </div>
    </div>
  );
}

function SwipeArea({ children, onSwipe, tabIndex, totalTabs }) {
  const touchRef = React.useRef({ x: 0, y: 0, active: false });
  const [slideDir, setSlideDir] = useState(null); // 'next' | 'prev' | null
  const prevTabIndex = React.useRef(tabIndex);

  useEffect(() => {
    if (tabIndex !== prevTabIndex.current) {
      const dir = tabIndex > prevTabIndex.current ? 'next' : 'prev';
      setSlideDir(dir);
      prevTabIndex.current = tabIndex;
      const t = setTimeout(() => {
        setSlideDir(null);
      }, 320);
      return () => clearTimeout(t);
    }
  }, [tabIndex]);

  const handleStart = (e) => {
    const t = e.touches ? e.touches[0] : e;
    touchRef.current = { x: t.clientX, y: t.clientY, active: true };
  };

  const handleEnd = (e) => {
    if (!touchRef.current.active) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    touchRef.current.active = false;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && tabIndex < totalTabs - 1) onSwipe(tabIndex + 1);
      if (dx > 0 && tabIndex > 0) onSwipe(tabIndex - 1);
    }
  };

  return (
    <div
      className="gr-swipe-area"
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
    >
      <div
        key={tabIndex}
        className={
          'gr-slide-sheet' +
          (slideDir === 'next' ? ' slide-in-next' : slideDir === 'prev' ? ' slide-in-prev' : '')
        }
      >
        {children}
      </div>
    </div>
  );
}


function MetamagicModal({ spell, feats, dotesActivas, dotesTenidas, selected, onToggle, onConfirm, onClose }) {
  const metaFeats = feats.filter(f => f.modificador_nivel !== undefined && f.modificador_nivel !== '-' && dotesTenidas && dotesTenidas[f.nombre]);
  const totalMod = selected.reduce((sum, fname) => {
    const f = feats.find(ft => ft.nombre === fname);
    if (!f) return sum;
    const v = parseInt(dotesActivas[fname] ?? f.modificador_nivel, 10);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
  const effLevel = spell.nivel + totalMod;

  return (
    <div className="gr-modal-overlay" onClick={onClose}>
      <div className="gr-modal" onClick={e => e.stopPropagation()}>
        <h3>Preparar «{spell.nombre}»</h3>
        <p className="gr-modal-sub">Nivel base {spell.nivel}. Selecciona dotes de metamagia a aplicar (opcional).</p>
        <div className="gr-modal-feats">
          {metaFeats.length === 0 && <div className="gr-empty">No tienes ninguna dote de metamagia marcada como tenida. Ve a «Dotes de metamagia» y márcalas.</div>}
          {metaFeats.map(f => {
            const active = selected.includes(f.nombre);
            const modVal = parseInt(dotesActivas[f.nombre] ?? f.modificador_nivel, 10);
            const modDisplay = isNaN(modVal) ? (dotesActivas[f.nombre] ?? f.modificador_nivel) : (modVal >= 0 ? `+${modVal}` : `${modVal}`);
            return (
              <label key={f.nombre} className={'gr-modal-feat-row' + (active ? ' active' : '')}>
                <input type="checkbox" checked={active} onChange={() => onToggle(f.nombre)} />
                <span className="gr-modal-feat-name">{f.nombre}</span>
                <span className="gr-modal-feat-mod">{modDisplay}</span>
              </label>
            );
          })}
        </div>
        <div className="gr-modal-result">
          Espacio final ocupado: <strong>Nivel {effLevel}</strong>
          {effLevel > 9 && <span className="gr-warn"> — supera el nivel 9, revisa la combinación</span>}
          {effLevel < 0 && <span className="gr-warn"> — el nivel no puede ser negativo, revisa la combinación</span>}
        </div>
        <div className="gr-form-actions">
          <button className="gr-btn-prepare" onClick={onConfirm}>Confirmar preparación</button>
          <button className="gr-btn-remove" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&family=Cinzel:wght@500;700&family=Almendra:ital,wght@0,400;0,700;1,400;1,700&display=swap');

.grimoire-root {
  position: relative;
  min-height: 100vh;
  background: #1a1812;
  color: #4a3a20;
  font-family: 'Almendra', Georgia, serif;
  padding-bottom: 60px;
}

.grimoire-bg {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(60,52,38,0.4), transparent 60%), #14120e;
  z-index: -1;
}

.gr-header {
  border-bottom: none;
  padding: 28px 24px 7px;
  background-image: url(${PAGE_HEADER_IMAGE});
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  position: sticky;
  top: 0;
  z-index: 20;
}

.gr-header-inner {
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 1100px;
  margin: 0 auto 18px;
}

.gr-sub {
  margin: 0;
  font-size: 17px;
  color: #3a2a10;
  font-family: 'Almendra', serif;
  font-weight: 700;
  font-style: normal;
  letter-spacing: 0.02em;
}

.gr-sub-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gr-char-select {
  align-self: flex-start;
  background: rgba(255,250,230,0.4);
  border: none;
  border-bottom: 1px solid rgba(154,100,24,0.4);
  color: #6b5230;
  font-family: 'Almendra', serif;
  font-size: 12.5px;
  padding: 2px 2px;
  outline: none;
  cursor: pointer;
}

.gr-new-char-link {
  align-self: flex-start;
  background: none;
  border: none;
  color: #9a6418;
  font-family: 'Almendra', serif;
  font-size: 12.5px;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.gr-new-char-link:hover {
  color: #8b0000;
}

.gr-emblem-btn {
  background: none;
  border: none;
  color: #722f37;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  vertical-align: middle;
  display: inline-flex;
  transition: color 0.2s, filter 0.2s, transform 0.2s;
}

.gr-emblem-btn svg {
  display: block;
}

.gr-emblem-btn:hover {
  color: #8b0000;
  filter: drop-shadow(0 0 4px rgba(139,0,0,0.6));
  transform: scale(1.15) rotate(15deg);
}

.gr-emblem-btn.unset {
  color: #8b0000;
  filter: drop-shadow(0 0 3px rgba(139,0,0,0.5));
}

.gr-emblem-btn.unset:hover {
  filter: drop-shadow(0 0 6px rgba(139,0,0,0.7));
}

.gr-tabs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  max-width: 1100px;
  margin: 0 auto;
}

.gr-tab {
  background: transparent;
  border: none;
  color: #8a6a30;
  font-family: 'Almendra', serif;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: rgba(138,106,48,0.6);
  font-size: 12px;
  letter-spacing: 0.03em;
  padding: 12px 6px;
  cursor: pointer;
  white-space: normal;
  line-height: 1.3;
  text-align: center;
  transition: color 0.25s, text-shadow 0.25s, text-decoration-color 0.25s;
}

.gr-tab:hover { color: #b8821e; }

.gr-tab.active {
  color: #8b0000;
  text-decoration-color: #8b0000;
  text-shadow: 0 0 6px rgba(139,0,0,0.65), 0 0 14px rgba(139,0,0,0.4);
}

@media (min-width: 560px) {
  .gr-tab {
    font-size: 13px;
    padding: 12px 16px;
  }
}

.gr-main {
  max-width: 900px;
  margin: 0 auto;
  padding: 18px 56px 48px;
  position: relative;
  background-image: url(${PAGE_MIDDLE_IMAGE});
  background-size: 100% auto;
  background-repeat: repeat-y;
  background-position: top center;
}

.gr-page-title {
  font-family: 'UnifrakturMaguntia', 'Cinzel', serif;
  font-size: 28px;
  font-weight: normal;
  color: #3a2a10;
  margin: 0 0 4px;
}

.gr-page-desc {
  color: #6b5230;
  font-size: 12.5px;
  margin: 0 0 10px;
  max-width: 700px;
}

.gr-mini-title {
  font-family: 'Almendra', serif;
  font-weight: 700;
  font-size: 15px;
  color: #9a6418;
  margin: 0 0 10px;
  letter-spacing: 0.03em;
}

/* Level toggle - plain glowing text, no boxes */
.gr-level-ribbon {
  display: flex;
  gap: 14px;
  margin-bottom: 14px;
  overflow-x: auto;
  padding-bottom: 4px;
  flex-wrap: wrap;
}

.gr-level-tab {
  position: relative;
  background: none;
  border: none;
  padding: 4px 2px;
  color: #9a7a40;
  font-family: 'Almendra', serif;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: rgba(154,122,64,0.6);
  font-size: 17px;
  cursor: pointer;
  transition: color 0.25s, text-shadow 0.25s, opacity 0.25s, text-decoration-color 0.25s;
}

.gr-level-tab:hover { color: #b8821e; }

.gr-level-tab.active {
  color: #8b0000;
  text-decoration-color: #8b0000;
  text-shadow: 0 0 6px rgba(139,0,0,0.7), 0 0 16px rgba(139,0,0,0.45);
}

.gr-level-tab.off {
  opacity: 0.45;
  filter: saturate(0.5);
  text-decoration-color: rgba(154,122,64,0.6);
}

.gr-level-tab.off:hover {
  opacity: 0.7;
}

.gr-level-count {
  position: absolute;
  top: -8px;
  right: -10px;
  color: #9a3a10;
  font-size: 10px;
  font-family: 'Almendra', Georgia, serif;
  font-style: italic;
}

/* School "chips" - plain text, colored, glowing when on */
.gr-school-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 18px;
}

.gr-school-chip {
  background: none;
  border: none;
  padding: 2px 0;
  color: var(--esc-color);
  font-size: 13px;
  font-family: 'Almendra', Georgia, serif;
  font-style: italic;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.25s, text-shadow 0.25s;
}

.gr-school-chip.on {
  opacity: 1;
  text-shadow: 0 0 6px var(--esc-color);
}

.gr-school-chip.off {
  opacity: 0.3;
}

.gr-school-chip.off:hover {
  opacity: 0.55;
}

/* Toolbar */
.gr-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
  align-items: center;
}

.gr-input, .gr-select {
  background: rgba(255,250,230,0.4);
  border: none;
  border-bottom: 1px solid rgba(120,80,30,0.4);
  color: #3a2a10;
  padding: 7px 4px;
  border-radius: 0;
  font-family: 'Almendra', Georgia, serif;
  font-size: 14px;
}

.gr-input::placeholder { color: #9a8050; font-style: italic; }

.gr-input:focus, .gr-select:focus {
  outline: none;
  border-bottom-color: #8b0000;
}

.gr-input { flex: 1; min-width: 180px; }

.gr-sort-toggle {
  display: flex;
  gap: 14px;
}

.gr-sort-toggle button {
  background: none;
  border: none;
  color: #9a7a40;
  padding: 4px 0;
  cursor: pointer;
  font-family: 'Almendra', serif;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: rgba(154,122,64,0.4);
  font-size: 12.5px;
  transition: color 0.25s, text-shadow 0.25s;
}

.gr-sort-toggle button.active {
  color: #8b0000;
  text-decoration-color: #8b0000;
  text-shadow: 0 0 6px rgba(139,0,0,0.6);
}

.gr-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #6b5230;
  cursor: pointer;
}

/* Spell grid */
.gr-spell-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.gr-spell-card {
  background:
    radial-gradient(ellipse at 20% 15%, rgba(150,115,70,0.08), transparent 50%),
    linear-gradient(160deg, rgba(255,250,235,0.4), rgba(232,210,170,0.3));
  border: none;
  border-bottom: 1px solid rgba(120,80,30,0.25);
  border-radius: 0;
  padding: 8px 4px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.gr-spell-card.known {
  border-bottom-color: rgba(160,90,20,0.5);
}

.gr-spell-card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.gr-spell-card-head h3 {
  font-family: 'Almendra', serif;
  font-weight: 700;
  font-size: 15px;
  color: #3a2a10;
  margin: 0;
  line-height: 1.15;
}

.gr-spell-level {
  font-size: 11px;
  color: #9a8050;
  white-space: nowrap;
}

.gr-escuela-tag {
  display: inline-block;
  font-size: 11.5px;
  color: var(--esc-color);
  font-style: italic;
  width: fit-content;
  letter-spacing: 0.02em;
  line-height: 1.1;
  margin: 0;
}

.gr-spell-summary {
  font-size: 13.5px;
  color: #4a3a22;
  line-height: 1.25;
  margin: 0;
  flex: 1;
}

.gr-spell-meta {
  font-size: 11.5px;
  color: #8a7250;
  font-style: italic;
  line-height: 1.1;
}

.gr-spell-actions {
  display: flex;
  gap: 18px;
  margin-top: 4px;
}

.gr-btn-toggle {
  background: none;
  border: none;
  padding: 0;
  color: #9a7a40;
  cursor: pointer;
  font-size: 12.5px;
  font-family: 'Almendra', serif;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: rgba(154,122,64,0.4);
  transition: color 0.25s, text-shadow 0.25s;
}

.gr-btn-toggle.on {
  color: #8b0000;
  text-decoration-color: #8b0000;
  text-shadow: 0 0 6px rgba(139,0,0,0.55);
}

.gr-btn-prepare {
  background: none;
  border: none;
  padding: 0;
  color: #9a6418;
  cursor: pointer;
  font-size: 12.5px;
  font-family: 'Almendra', serif;
  font-weight: 700;
  text-decoration: underline;
  white-space: nowrap;
  transition: color 0.2s, text-shadow 0.2s;
}

.gr-btn-prepare:hover {
  color: #8b0000;
  text-shadow: 0 0 8px rgba(139,0,0,0.6), 0 0 18px rgba(139,0,0,0.35);
}

.gr-btn-prepare.small { font-size: 12px; }

.gr-btn-remove {
  background: none;
  border: none;
  padding: 0;
  color: #8a7a5a;
  cursor: pointer;
  font-size: 12.5px;
  font-family: 'Almendra', Georgia, serif;
  font-style: italic;
  font-weight: 700;
  text-decoration: underline;
  transition: color 0.2s;
}

.gr-btn-remove:hover { color: #9a3a10; }

.gr-empty {
  color: #8a7250;
  font-style: italic;
  padding: 30px 10px;
  text-align: center;
  grid-column: 1 / -1;
}

/* Clickable catalog card */
.gr-spell-card.clickable {
  cursor: pointer;
}

.gr-spell-card.clickable:hover {
  border-bottom-color: #8b0000;
}

.gr-spell-card.clickable:focus-visible {
  outline: 1px dotted #8b0000;
  outline-offset: 2px;
}

.gr-known-pill {
  margin-top: 4px;
  text-align: center;
  font-size: 12px;
  font-family: 'Almendra', serif;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: rgba(154,128,80,0.4);
  color: #9a8050;
}

.gr-known-pill.on {
  color: #8b0000;
  text-decoration-color: #8b0000;
  text-shadow: 0 0 6px rgba(139,0,0,0.55);
}

.gr-btn-edit {
  width: 100%;
  text-align: center;
  margin-top: 2px;
}

/* Preparados */
.gr-prepare-columns {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 30px;
}

@media (max-width: 800px) {
  .gr-prepare-columns { grid-template-columns: 1fr; }
}

.gr-known-list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }

.gr-known-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(120,80,30,0.2);
  padding: 8px 2px;
}

.gr-known-row strong {
  color: #3a2a10;
  font-size: 14px;
  margin-right: 10px;
}

.gr-eff-level-block {
  margin-bottom: 18px;
  border-left: 2px solid #9a6418;
  padding-left: 14px;
}

.gr-eff-level-header {
  font-family: 'Almendra', serif;
  color: #9a6418;
  font-size: 13px;
  margin-bottom: 8px;
  letter-spacing: 0.03em;
}

.gr-prepared-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid rgba(120,80,30,0.18);
  padding: 8px 2px;
  margin-bottom: 4px;
}

.gr-prepared-row.clickable {
  cursor: pointer;
  transition: opacity 0.15s, border-color 0.15s;
  user-select: none;
  -webkit-touch-callout: none;
}

.gr-prepared-row.clickable:hover {
  opacity: 0.7;
  border-bottom-color: #8b0000;
}

.gr-prepared-row.clickable:focus-visible {
  outline: 1px dotted #8b0000;
  outline-offset: 2px;
}

.gr-prepared-x {
  color: #8b0000;
  font-size: 14px;
  opacity: 0.55;
  margin-left: 10px;
  flex-shrink: 0;
  cursor: pointer;
  padding: 4px;
  transition: opacity 0.15s, transform 0.15s;
}

.gr-prepared-x:hover {
  opacity: 1;
  transform: scale(1.2);
}

.gr-limit-badge {
  font-size: 12px;
  color: #9a6418;
  font-weight: normal;
  letter-spacing: 0;
}

.gr-sheet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.gr-sheet-grid-2 {
  grid-template-columns: 1fr 1fr;
}

.gr-sheet-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
  color: #6b5230;
  min-width: 0;
}

.gr-sheet-field .gr-input,
.gr-sheet-field .gr-select {
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.gr-limits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.gr-limit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: #3a2a10;
}

.gr-prepared-info strong { color: #3a2a10; font-size: 14px; }
.gr-prepared-base { font-size: 11px; color: #8a7250; margin-left: 8px; }

.gr-prepared-feats { margin-top: 4px; display: flex; gap: 10px; flex-wrap: wrap; }

.gr-feat-chip {
  font-size: 10.5px;
  font-style: italic;
  color: #9a6418;
}

/* Dotes */
.gr-feats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.gr-feat-card {
  background: linear-gradient(160deg, rgba(255,250,235,0.35), rgba(232,210,170,0.25));
  border: none;
  border-bottom: 1px solid rgba(120,80,30,0.25);
  padding: 8px 4px 10px;
}

.gr-feat-card.clickable {
  cursor: pointer;
}

.gr-feat-card.clickable:hover {
  border-bottom-color: #8b0000;
}

.gr-feat-card.clickable:focus-visible {
  outline: 1px dotted #8b0000;
  outline-offset: 2px;
}

.gr-feat-card.known {
  border-bottom-color: rgba(160,90,20,0.5);
}

.gr-feat-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.gr-feat-card-head h3 {
  font-family: 'Almendra', serif;
  font-weight: 700;
  font-size: 14.5px;
  color: #3a2a10;
  margin: 0;
}

.gr-feat-mod-edit {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #6b5230;
}

.gr-feat-mod-input {
  width: 32px;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(120,80,30,0.4);
  color: #9a6418;
  text-align: center;
  padding: 2px 0;
  font-family: 'Almendra', serif;
  font-size: 13px;
}

.gr-feat-desc {
  font-size: 13px;
  color: #4a3a22;
  line-height: 1.25;
  margin: 0 0 5px;
}

.gr-btn-add-new {
  background: none;
  border: none;
  padding: 6px 0;
  color: #9a6418;
  cursor: pointer;
  font-family: 'Almendra', serif;
  font-weight: 700;
  text-decoration: underline;
  font-size: 14px;
  width: 100%;
  text-align: left;
  transition: color 0.2s, text-shadow 0.2s;
}

.gr-btn-add-new:hover {
  color: #8b0000;
  text-shadow: 0 0 8px rgba(139,0,0,0.5);
}

.gr-add-form {
  background: rgba(255,250,235,0.3);
  border: none;
  border-top: 1px solid rgba(120,80,30,0.25);
  padding: 18px 2px;
  margin-top: 14px;
}

.gr-add-form.wide { max-width: 700px; }

.gr-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.gr-textarea {
  width: 100%;
  background: rgba(255,250,230,0.4);
  border: none;
  border-bottom: 1px solid rgba(120,80,30,0.4);
  color: #3a2a10;
  padding: 8px 4px;
  font-family: 'Almendra', Georgia, serif;
  font-size: 14px;
  min-height: 70px;
  resize: vertical;
  margin-bottom: 10px;
  box-sizing: border-box;
}

.gr-form-actions { display: flex; gap: 24px; }

/* Catalog head with + */
.gr-catalog-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 4px;
}

.gr-btn-fab {
  flex-shrink: 0;
  background: none;
  border: none;
  width: auto;
  height: auto;
  color: #9a6418;
  font-size: 30px;
  line-height: 1;
  cursor: pointer;
  font-family: 'Almendra', serif;
  transition: color 0.2s, text-shadow 0.2s, transform 0.2s;
}

.gr-btn-fab:hover {
  color: #8b0000;
  text-shadow: 0 0 10px rgba(139,0,0,0.6), 0 0 20px rgba(139,0,0,0.35);
  transform: scale(1.15);
}

/* Modal */
.gr-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(40,28,10,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.gr-modal {
  background: linear-gradient(160deg, #f2e4bc, #e3cb98);
  border: none;
  border-radius: 2px;
  padding: 26px;
  max-width: 480px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 14px 50px rgba(40,25,5,0.35);
}

.gr-modal h3 {
  font-family: 'UnifrakturMaguntia', 'Cinzel', serif;
  font-weight: normal;
  color: #3a2a10;
  margin: 0 0 8px;
  font-size: 24px;
}

.gr-modal-sub { color: #6b5230; font-size: 13.5px; margin: 0 0 16px; }

.gr-modal-feats {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
  max-height: 240px;
  overflow-y: auto;
}

.gr-modal-feat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(120,80,30,0.2);
  padding: 6px 2px;
  cursor: pointer;
  font-size: 13.5px;
}

.gr-modal-feat-row.active {
  color: #8b0000;
}

.gr-modal-feat-name { flex: 1; color: #3a2a10; }
.gr-modal-feat-row.active .gr-modal-feat-name { color: #8b0000; text-shadow: 0 0 6px rgba(139,0,0,0.5); }
.gr-modal-feat-mod { color: #9a6418; font-family: 'Almendra', serif; font-size: 12px; }

.gr-modal-result {
  border-left: 2px solid #9a6418;
  padding: 8px 12px;
  font-size: 14px;
  color: #3a2a10;
  margin-bottom: 16px;
}

.gr-warn { color: #9a2010; }

/* Toast */
.gr-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #3a2a10;
  border: none;
  color: #f0c674;
  padding: 10px 22px;
  border-radius: 4px;
  font-size: 14px;
  font-family: 'Almendra', serif;
  z-index: 200;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: #e3cb98; }
::-webkit-scrollbar-thumb { background: rgba(120,80,30,0.35); border-radius: 4px; }

/* Cover screen - real leather tome photo */
.gr-cover {
  position: fixed;
  inset: 0;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-family: 'Almendra', Georgia, serif;
  z-index: 1000;
  overflow: hidden;
  padding: 0;
}

.gr-cover-book {
  position: relative;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: gr-cover-zoom 14s ease-in-out infinite alternate;
}

@keyframes gr-cover-zoom {
  0% { transform: scale(1); }
  100% { transform: scale(1.08); }
}

.gr-cover-book::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0) 70%, rgba(0,0,0,0.55) 100%);
  pointer-events: none;
}

.gr-cover-hint-wrap {
  position: relative;
  z-index: 2;
  padding-bottom: 48px;
}

.gr-cover-hint {
  color: #cfc4a8;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin: 0;
  text-shadow: 0 2px 6px rgba(0,0,0,0.8);
  animation: gr-hint-fade 2.5s ease-in-out infinite;
}

@keyframes gr-hint-fade {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.95; }
}

/* Swipe area + simple slide transition */
.gr-swipe-area {
  touch-action: pan-y;
  user-select: none;
  overflow: hidden;
}

.gr-slide-sheet {
  width: 100%;
}

.gr-slide-sheet.slide-in-next {
  animation: gr-slide-in-next 0.32s ease-out;
}

.gr-slide-sheet.slide-in-prev {
  animation: gr-slide-in-prev 0.32s ease-out;
}

@keyframes gr-slide-in-next {
  0% { opacity: 0; transform: translateX(24px); }
  100% { opacity: 1; transform: translateX(0); }
}

@keyframes gr-slide-in-prev {
  0% { opacity: 0; transform: translateX(-24px); }
  100% { opacity: 1; transform: translateX(0); }
}

/* Page footer: real papyrus bottom-edge image, slides with content */
.gr-page-footer {
  max-width: 900px;
  margin: 0 auto;
  height: 70px;
  background-image: url(${PAGE_FOOTER_IMAGE});
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
}

@media (max-width: 700px) {
  .gr-main {
    padding: 14px 28px 36px;
  }
  .gr-page-footer {
    height: 50px;
  }
}
`;
