import { defineStore } from 'pinia';
import { ref, computed, reactive } from 'vue';
import type { FEAModel, FEAResult, MeshParams, PresetName, MeshParamKey } from '../types';
import {
  solve as feaSolve,
  buildModel,
  DEFAULT_MESH_PARAMS,
  validateMeshParams,
  jetColormap,
} from '../utils/fea-solver';

export const useFEAStore = defineStore('fea', () => {
  const model = ref<FEAModel>({ nodes: [], elements: [], loads: [] });
  const result = ref<FEAResult | null>(null);
  const selectedPreset = ref<PresetName>('cantilever');
  const showDeformed = ref(false);
  const deformationScale = ref(10);
  const selectedElement = ref<number | null>(null);
  const heatmapMode = ref<'stress' | 'strain' | 'force'>('stress');

  // Parameters of the currently generated model (the last *valid* state).
  const meshParams = ref<MeshParams>({ ...DEFAULT_MESH_PARAMS.cantilever });

  // Each named case keeps its own parameter set, so switching away and back
  // restores the values the user left them at.
  const paramSets = reactive<Record<PresetName, MeshParams>>({
    cantilever: { ...DEFAULT_MESH_PARAMS.cantilever },
    bridge: { ...DEFAULT_MESH_PARAMS.bridge },
    frame: { ...DEFAULT_MESH_PARAMS.frame },
  });

  // Validation feedback for the most recent regeneration attempt.
  const paramError = ref<{ key: MeshParamKey; message: string } | null>(null);

  // ─── Actions ──────────────────────────────────────────────────────────────
  function rebuild() {
    model.value = buildModel(selectedPreset.value, meshParams.value);
    result.value = null;
    selectedElement.value = null;
  }

  function loadPreset(name: string) {
    selectedPreset.value = name as PresetName;
    // Restore the parameter set stored for this case.
    meshParams.value = { ...paramSets[selectedPreset.value] };
    paramError.value = null;
    rebuild();
  }

  /**
   * Regenerate the mesh from the given parameters.
   * Returns true on success; on failure reports which field is illegal and
   * keeps the previously generated (last valid) model and its result intact.
   */
  function applyMeshParams(params: MeshParams): boolean {
    const invalid = validateMeshParams(params);
    if (invalid) {
      paramError.value = invalid;
      return false;
    }
    paramError.value = null;
    meshParams.value = { ...params };
    paramSets[selectedPreset.value] = { ...params };
    rebuild();
    return true;
  }

  /** Restore the current case to its built-in baseline parameters. */
  function resetMeshParams() {
    const baseline = { ...DEFAULT_MESH_PARAMS[selectedPreset.value] };
    paramError.value = null;
    meshParams.value = baseline;
    paramSets[selectedPreset.value] = { ...baseline };
    rebuild();
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
  const isCustomized = computed(
    () =>
      JSON.stringify(meshParams.value) !==
      JSON.stringify(DEFAULT_MESH_PARAMS[selectedPreset.value])
  );

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
    meshParams,
    paramError,
    isCustomized,
    maxStress,
    maxDisplacement,
    elementColors,
    loadPreset,
    applyMeshParams,
    resetMeshParams,
    solve,
    toggleDeformed,
    selectElement,
    setHeatmapMode,
    addLoad,
    toggleFixed,
  };
});
