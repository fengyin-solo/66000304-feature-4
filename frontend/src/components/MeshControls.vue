<script setup lang="ts">
import { useFEAStore } from '../store/fea';
import { PARAM_KEYS, PARAM_LIMITS } from '../utils/fea-solver';

const store = useFEAStore();
const paramKeys = PARAM_KEYS;
const limits = PARAM_LIMITS;
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
    </div>

    <!-- Model parameters -->
    <div>
      <div class="flex items-baseline justify-between mb-1">
        <div class="text-xs text-slate-400">模型参数</div>
        <div class="text-[10px] text-slate-500">
          基线: {{ store.presetLabel }}
          <span v-if="store.isModified" class="text-amber-400">· 已修改</span>
          <span v-else>· 默认</span>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div
          v-for="key in paramKeys"
          :key="key"
          :class="{ 'col-span-2': key === 'area' }"
        >
          <div class="flex justify-between text-[10px] mb-0.5">
            <span :class="store.paramErrors[key] ? 'text-red-400' : 'text-slate-400'">
              {{ limits[key].label }}<span v-if="limits[key].unit" class="text-slate-500"> ({{ limits[key].unit }})</span>
            </span>
            <span class="text-slate-600">{{ limits[key].min }} ~ {{ limits[key].max }}</span>
          </div>
          <input
            type="number"
            v-model="store.paramDraft[key]"
            @input="store.applyMeshParams()"
            :min="limits[key].min"
            :max="limits[key].max"
            :step="limits[key].step"
            class="w-full bg-slate-900 border rounded px-2 py-1 text-xs focus:outline-none transition"
            :class="store.paramErrors[key]
              ? 'border-red-500 text-red-300 focus:border-red-400'
              : 'border-slate-600 text-slate-200 focus:border-sky-500'"
          />
          <div v-if="store.paramErrors[key]" class="text-[10px] text-red-400 mt-0.5 leading-tight">
            {{ store.paramErrors[key] }}
          </div>
        </div>
      </div>
      <div
        v-if="store.hasParamErrors"
        class="mt-2 text-[10px] text-red-300 bg-red-950/50 border border-red-900 rounded px-2 py-1"
      >
        存在非法参数，未重新划分 —— 已保留上一次可用的模型与结果
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
