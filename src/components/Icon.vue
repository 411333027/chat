<script setup lang="ts">
// 全部是單色線條圖示（描邊 1.75、圓頭圓角、24×24 座標），顏色跟著文字色走。
import { computed } from 'vue'

const PATHS = {
  chat: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'],
  reply: ['M9 14L4 9l5-5', 'M20 20v-7a4 4 0 0 0-4-4H4'],
  users: [
    'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1',
    'M21 19v-1a4 4 0 0 0-3-3.87M15.5 4.2a3.5 3.5 0 0 1 0 7.6',
  ],
  exit: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5M21 12H9'],
  clip: ['M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4 20-7z'],
  back: ['M15 18l-6-6 6-6'],
  down: ['M6 9l6 6 6-6'],
  up: ['M6 15l6-6 6 6'],
  file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
  image: ['M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M21 16l-5-5-8 8'],
  download: ['M12 3v12M7 10l5 5 5-5M5 21h14'],
  upload: ['M12 16V4M7 9l5-5 5 5M5 20h14'],
  eyeOff: [
    'M3 3l18 18',
    'M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3.2 3.6M6.2 7.5C3.9 9.2 3 12 3 12s4 6 9 6c1.5 0 2.9-.4 4.1-1',
  ],
  arrowDown: ['M12 5v14M5 12l7 7 7-7'],
  x: ['M6 6l12 12M18 6L6 18'],
  alert: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 8v5M12 16.5v.01'],
  check: ['M5 12l5 5 9-10'],
  sync: ['M12 3a9 9 0 1 0 9 9'],
  clock: ['M12 3a9 9 0 1 0 9 9', 'M12 7v5l3 2'],
} as const

export type IconName = keyof typeof PATHS

const props = withDefaults(defineProps<{ name: IconName; size?: number; stroke?: number }>(), {
  size: 20,
  stroke: 1.75,
})

const paths = computed(() => PATHS[props.name])
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'users'">
      <circle cx="9.5" cy="8" r="3.5" />
    </template>
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>
