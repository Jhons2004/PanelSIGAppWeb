const WAPP_STAGES = [
  'OEC',
  'EVALUACION',
  'EQUIPO',
  'DOCUMENTOS',
  'ASISTENCIA',
  'CIERRE'
];

function WAPP_FLOW_key_() {
  return 'WAPP_FLOW_STATE_V1';
}

function WAPP_FLOW_get_() {
  const p = WAPP_STATE_props_();
  const raw = p.getProperty(WAPP_FLOW_key_());
  if (!raw) {
    return {
      registro: '',
      completed: [],
      data: {},
      updatedAt: ''
    };
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { registro: '', completed: [], data: {}, updatedAt: '' };
  }
}

function WAPP_FLOW_save_(state) {
  state.updatedAt = new Date().toISOString();
  WAPP_STATE_props_()
    .setProperty(WAPP_FLOW_key_(), JSON.stringify(state));
  return state;
}

function WAPP_FLOW_reset_(registro) {
  return WAPP_FLOW_save_({
    registro: String(registro || '').trim().toUpperCase(),
    completed: [],
    data: {},
    updatedAt: ''
  });
}

function WAPP_FLOW_complete_(stage, data) {
  if (!WAPP_STAGES.includes(stage)) throw new Error('Etapa inválida: ' + stage);

  const state = WAPP_FLOW_get_();
  if (!state.completed.includes(stage)) state.completed.push(stage);
  state.data[stage] = data || {};
  return WAPP_FLOW_save_(state);
}

function WAPP_FLOW_assertPrevious_(stage) {
  const idx = WAPP_STAGES.indexOf(stage);
  if (idx <= 0) return true;

  const prev = WAPP_STAGES[idx - 1];
  const state = WAPP_FLOW_get_();
  if (!state.completed.includes(prev)) {
    throw new Error('Debe completar primero la etapa: ' + prev);
  }
  return true;
}

function WAPP_FLOW_publicState_() {
  const state = WAPP_FLOW_get_();
  return {
    registro: state.registro || '',
    completed: state.completed || [],
    updatedAt: state.updatedAt || ''
  };
}

