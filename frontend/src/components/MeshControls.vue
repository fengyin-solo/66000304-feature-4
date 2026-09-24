<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useFEAStore } from '../store/fea';
import {
  MESH_PARAM_LIMITS,
  MESH_PARAM_LABELS,
  MESH_PARAM_UNITS,
} from '../utils/fea-solver';
import type { MeshParamKey, PresetName } from '../types';

const store = useFEAStore();

const presetLabels: Record<PresetName, string> = {
  cantilever: '悬臂梁',
  bridge: '桥梁桁架',
  frame: '简单框架',
};

// Text drafts so the user can clear a field while typing without being
// forced back to a number mid-edit.
const draft = reactive<Record<MeshParamKey, string>>({
  spans: String(store.meshParams.spans),
  layers: String(store.meshParams.layers),
  spanLength: String(store.meshParams.spanLength),
  storyHeight: String(store.meshParams.storyHeight),
  area: String(store.meshParams.area),
});

const fields: MeshParamKey[] = ['spans', 'layers', 'spanLength', 'storyHeight', 'area'];

// Switching cases restores that case's parameters; sync the inputs.
watch(
  () => store.meshParams,
  (params) => {
    for (const key of fields) draft[key] = String(params[key]);
  },
  { deep: true }
);

function regenerate() {
  const candidate = {
    spans: Number(draft.spans),
    layers: Number(draft.layers),
    spanLength: Number(draft.spanLength),
    storyHeight: Number(draft.storyHeight),
    area: Number(draft.area),
  };
  store.applyMeshParams(candidate);
  // On success the watcher above rewrites the drafts; on failure the drafts
  // stay so the user can see and fix the illegal value.
}
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4 space-y-3">
    <h3 class="text-sm font-bold text-slate-200 border-b border-slate-700 pb-2">
      网格控制
    </h3>

    <!-- Preset buttons -->
    <div>
      <div class="text-xs text-slate-400 mb-1">预设模型</div>
      <div class="grid grid-cols-3 gap-1">
        <button
          @click="store.loadPreset('cantilever')"
          :class="store.selectedPreset === 'cantilever' ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-400'"
          class="py-1.5 rounded text-[10px] font-medium hover:opacity-90 transition"
        >
          悬臂梁
        </button>
        <button
          @click="store.loadPreset('bridge')"
          :class="store.selectedPreset === 'bridge' ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-400'"
          class="py-1.5 rounded text-[10px] font-medium hover:opacity-90 transition"
        >
          桥梁桁架
        </button>
        <button
          @click="store.loadPreset('frame')"
          :class="store.selectedPreset === 'frame' ? 'bg-sky-700 text-white' : 'bg-slate-700 text-slate-400'"
          class="py-1.5 rounded text-[10px] font-medium hover:opacity-90 transition"
        >
          简单框架
        </button>
      </div>
      <!-- Current case kept as the comparison baseline -->
      <div class="mt-1.5 text-[10px] text-slate-500 flex items-center justify-between">
        <span>
          比较基线：<span class="text-slate-300">{{ presetLabels[store.selectedPreset] }}</span>
          <span v-if="store.isCustomized" class="text-amber-400">（已自定义）</span>
        </span>
        <button
          v-if="store.isCustomized"
          @click="store.resetMeshParams()"
          class="text-sky-400 hover:text-sky-300 underline underline-offset-2"
        >
          恢复基线
        </button>
      </div>
    </div>

    <!-- Editable mesh parameters -->
    <div class="space-y-2 border-t border-slate-700 pt-3">
      <div class="text-xs text-slate-400">模型参数</div>
      <div class="grid grid-cols-2 gap-2">
        <div v-for="key in fields" :key="key">
          <label class="flex justify-between text-[10px] text-slate-400 mb-0.5">
            <span>{{ MESH_PARAM_LABELS[key] }}</span>
            <span class="text-slate-600">
              {{ MESH_PARAM_LIMITS[key].min }}~{{ MESH_PARAM_LIMITS[key].max }}{{ MESH_PARAM_UNITS[key] }}
            </span>
          </label>
          <div class="relative">
            <input
              v-model="draft[key]"
              type="number"
              inputmode="decimal"
              :min="MESH_PARAM_LIMITS[key].min"
              :max="MESH_PARAM_LIMITS[key].max"
              :step="MESH_PARAM_LIMITS[key].step"
              @change="regenerate"
              @keyup.enter="regenerate"
              :class="store.paramError?.key === key
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-600 focus:ring-sky-500'"
              class="w-full bg-slate-900 border rounded px-2 py-1 pr-9 text-xs text-slate-200 font-mono focus:outline-none focus:ring-1"
            />
            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">
              {{ MESH_PARAM_UNITS[key] }}
            </span>
          </div>
        </div>
      </div>

      <button
        @click="regenerate"
        class="w-full py-1.5 rounded text-xs font-bold bg-sky-700 text-white hover:bg-sky-600 transition"
      >
        🔄 重新生成网格
      </button>

      <!-- Illegal parameter feedback: names the offending field -->
      <div v-if="store.paramError" class="text-[11px] text-red-400 bg-red-950/50 border border-red-900 rounded px-2 py-1.5">
        ⚠ {{ store.paramError.message }}，已保留上一次可用结果
      </div>
    </div>

    <!-- Solve button -->
    <button
      @click="store.solve()"
      class="w-full py-2 rounded text-xs font-bold bg-green-700 text-white hover:bg-green-600 transition"
    >
      ⚙ 求解 FEA
    </button>

    <!-- Deformed mesh toggle -->
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        :checked="store.showDeformed"
        @change="store.toggleDeformed()"
        class="accent-sky-500"
      />
      <span class="text-xs text-slate-300">显示变形网格</span>
    </label>

    <!-- Deformation scale -->
    <div>
      <div class="flex justify-between text-xs text-slate-400 mb-1">
        <span>变形缩放</span>
        <span class="text-sky-400 font-mono">{{ store.deformationScale }}x</span>
      </div>
      <input
        type="range"
        min="1"
        max="100"
        :value="store.deformationScale"
        @input="store.deformationScale = Number(($event.target as HTMLInputElement).value)"
        class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
      />
    </div>

    <!-- Heatmap mode -->
    <div>
      <div class="text-xs text-slate-400 mb-1">热力图模式</div>
      <div class="grid grid-cols-3 gap-1">
        <label class="cursor-pointer">
          <input type="radio" value="stress" v-model="store.heatmapMode" class="hidden peer" />
          <div class="text-center py-1.5 rounded text-[10px] font-medium peer-checked:bg-purple-700 peer-checked:text-white bg-slate-700 text-slate-400 transition">
            应力
          </div>
        </label>
        <label class="cursor-pointer">
          <input type="radio" value="strain" v-model="store.heatmapMode" class="hidden peer" />
          <div class="text-center py-1.5 rounded text-[10px] font-medium peer-checked:bg-purple-700 peer-checked:text-white bg-slate-700 text-slate-400 transition">
            应变
          </div>
        </label>
        <label class="cursor-pointer">
          <input type="radio" value="force" v-model="store.heatmapMode" class="hidden peer" />
          <div class="text-center py-1.5 rounded text-[10px] font-medium peer-checked:bg-purple-700 peer-checked:text-white bg-slate-700 text-slate-400 transition">
            轴力
          </div>
        </label>
      </div>
    </div>

    <!-- Display stats -->
    <div class="border-t border-slate-700 pt-2">
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">最大应力</div>
          <div class="text-sm font-bold text-red-400">
            {{ store.result ? (store.maxStress / 1e6).toFixed(2) + ' MPa' : '—' }}
          </div>
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">最大位移</div>
          <div class="text-sm font-bold text-amber-400">
            {{ store.result ? (store.maxDisplacement * 1000).toFixed(3) + ' mm' : '—' }}
          </div>
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">单元数</div>
          <div class="text-sm font-bold text-slate-300">{{ store.model.elements.length }}</div>
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">节点数</div>
          <div class="text-sm font-bold text-slate-300">{{ store.model.nodes.length }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
