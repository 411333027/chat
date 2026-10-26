<script setup lang="ts">
// 顯示頭像：訊息旁（22px）、名單（34／40px）、進入畫面預覽（72px）共用。
import { computed, toRef } from 'vue'
import type { Avatar } from '@/services/chatService'
import { AVATAR_COLOR_VALUES, AVATAR_ICON_PATHS } from '@/utils/avatar'
import { useFileUrl } from '@/composables/useFileUrl'

const props = withDefaults(defineProps<{ avatar: Avatar; size?: number; ring?: boolean }>(), {
  size: 34,
  ring: false,
})

const preset = computed(() => (props.avatar.kind === 'preset' ? props.avatar : null))
const colors = computed(() => (preset.value ? AVATAR_COLOR_VALUES[preset.value.color] : null))
const paths = computed(() => (preset.value ? AVATAR_ICON_PATHS[preset.value.icon] : []))
const uploadPath = toRef(() => (props.avatar.kind === 'upload' ? props.avatar.path : null))
const { url } = useFileUrl(uploadPath)
const iconSize = computed(() => Math.round(props.size * 0.55))
</script>

<template>
  <span
    class="avatar"
    :class="{ ring }"
    :style="{
      width: size + 'px',
      height: size + 'px',
      background: colors?.bg ?? 'var(--bg-placeholder)',
      color: colors?.fg,
    }"
  >
    <svg
      v-if="preset"
      viewBox="0 0 24 24"
      :width="iconSize"
      :height="iconSize"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path v-for="d in paths" :key="d" :d="d" />
    </svg>
    <img v-else-if="url" :src="url" alt="" draggable="false" />
  </span>
</template>

<style scoped>
.avatar {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
}

.avatar.ring {
  box-shadow: 0 0 0 2px var(--accent);
}

img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
