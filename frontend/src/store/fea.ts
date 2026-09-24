import { defineStore } from 'pinia';
import { ref, reactive, computed } from 'vue';
import type { FEAModel, FEAResult } from '../types';
import {
  solve as feaSolve,
  buildModel,
  defaultMeshParams,
  jetColormap,
  PARAM_KEYS,
  PARAM_LIMITS,
  PRESET_LABELS,
} from '../utils/fea-solver';
import type { MeshParams } from '../utils/fea-solver';

export const useFEAStore = defineStore('fea', () => {
  const model = ref<FEAModel>({ nodes: [], elements: [], loads: [] });
  const result = ref<FEAResult | null>(null);
  const selectedPreset = ref<string>('cantilever');
  const showDeformed = ref(false);
  const deformationScale = ref(10);
  const selectedElement = ref<number | null>(null);
  const heatmapMode = ref<'stress' | 'strain' | 'force'>('stress');

  // ─── Mesh parameters ──────────────────────────────────────────────────────
  // Last valid params per preset — switching presets restores these.
  const savedParams = reactive<Record<string, MeshParams>>({
    cantilever: defaultMeshParams('cantilever'),
    bridge: defaultMeshParams('bridge'),
    frame: defaultMeshParams('frame'),
  });
  // Raw text shown in the parameter inputs (kept as text so out-of-range
  // typing doesn't destroy the last valid model).
  const paramDraft = ref<Record<keyof MeshParams, string>>(toDraft(savedParams.cantilever));
  const paramErrors = ref<Partial<Record<keyof MeshParams, string>>>({});

  function toDraft(p: MeshParams): Record<keyof MeshParams, string> {
    return {
      nDivX: String(p.nDivX),
      nDivY: String(p.nDivY),
      spanLength: String(p.spanLength),
      layerHeight: String(p.layerHeight),
      area: String(p.area),
    };
  }

  function validateDraft(): {
    params: MeshParams;
    errors: Partial<Record<keyof MeshParams, string>>;
  } {
    const errors: Partial<Record<keyof MeshParams, string>> = {};
    const params = {} as MeshParams;
    for (const key of PARAM_KEYS) {
      const lim = PARAM_LIMITS[key];
      const raw = paramDraft.value[key].trim();
      const v = raw === '' ? NaN : Number(raw);
      if (!Number.isFinite(v)) {
        errors[key] = `${lim.label}必须是有效数字`;
        continue;
      }
      if (lim.integer && !Number.isInteger(v)) {
        errors[key] = `${lim.label}必须是整数`;
        continue;
      }
      if (v < lim.min || v > lim.max) {
        errors[key] = `${lim.label}需在 ${lim.min} ~ ${lim.max} 之间`;
        continue;
      }
      params[key] = v;
    }
    return { params, errors };
  }

  // ─── Actions ──────────────────────────────────────────────────────────────
  function loadPreset(name: string) {
    const key = name in savedParams ? name : 'cantilever';
    selectedPreset.value = key;
    result.value = null;
    selectedElement.value = null;
    paramErrors.value = {};
    // Restore this preset's params as they were when left
    paramDraft.value = toDraft(savedParams[key]);
    model.value = buildModel(key, savedParams[key]);
  }

  // Rebuild the mesh from the current draft. Invalid input keeps the last
  // usable model/result and reports which fields are out of range.
  function applyMeshParams() {
    const { params, errors } = validateDraft();
    paramErrors.value = errors;
    if (Object.keys(errors).length > 0) return;
    savedParams[selectedPreset.value] = params;
    model.value = buildModel(selectedPreset.value, params);
    result.value = null;
    selectedElement.value = null;
  }

  function solve() {
    result.value = feaSolve(model.value);
  }

  function toggleDeformed() {
    showDeformed.value = !showDeformed.value;
  }

  function selectElement(id: number | null) {
    selectedElement.value = id;
  }

  function setHeatmapMode(mode: 'stress' | 'strain' | 'force') {
    heatmapMode.value = mode;
  }

  function addLoad(nodeId: number, fx: number, fy: number) {
    model.value.loads.push({ nodeId, fx, fy });
  }

  function toggleFixed(nodeId: number) {
    const node = model.value.nodes.find((n) => n.id === nodeId);
    if (node) node.fixed = !node.fixed;
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  const presetLabel = computed(
    () => PRESET_LABELS[selectedPreset.value] ?? selectedPreset.value
  );

  const hasParamErrors = computed(
    () => Object.keys(paramErrors.value).length > 0
  );

  // Whether the current preset's params deviate from its defaults
  const isModified = computed(() => {
    const def = defaultMeshParams(selectedPreset.value);
    const cur = savedParams[selectedPreset.value];
    if (!cur) return false;
    return PARAM_KEYS.some((k) => cur[k] !== def[k]);
  });

  const maxStress = computed(() => {
    if (!result.value) return 0;
    return result.value.maxStress;
  });

  const maxDisplacement = computed(() => {
    if (!result.value) return 0;
    return result.value.maxDisplacement;
  });

  const elementColors = computed(() => {
    const colors = new Map<number, string>();
    if (!result.value || model.value.elements.length === 0) {
      for (const el of model.value.elements) {
        colors.set(el.id, '#6b7280');
      }
      return colors;
    }

    let values: number[];
    switch (heatmapMode.value) {
      case 'stress':
        values = result.value.stresses.map(Math.abs);
        break;
      case 'strain':
        values = result.value.strains.map(Math.abs);
        break;
      case 'force':
        values = model.value.elements.map((e) => Math.abs(e.force));
        break;
      default:
        values = result.value.stresses.map(Math.abs);
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    for (let i = 0; i < model.value.elements.length; i++) {
      colors.set(
        model.value.elements[i].id,
        jetColormap(values[i], min, max)
      );
    }
    return colors;
  });

  return {
    model,
    result,
    selectedPreset,
    showDeformed,
    deformationScale,
    selectedElement,
    heatmapMode,
    paramDraft,
    paramErrors,
    presetLabel,
    hasParamErrors,
    isModified,
    maxStress,
    maxDisplacement,
    elementColors,
    loadPreset,
    applyMeshParams,
    solve,
    toggleDeformed,
    selectElement,
    setHeatmapMode,
    addLoad,
    toggleFixed,
  };
});
