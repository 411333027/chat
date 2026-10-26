<script setup lang="ts">
// 圖片大圖：遮罩上置中放大圖，右上角關閉鈕。Esc 或點遮罩也能關閉。
import { onMounted, onUnmounted, ref } from 'vue'
import Icon from './Icon.vue'

defineProps<{ url: string; name: string }>()
const emit = defineEmits<{ close: [] }>()
const closeBtn = ref<HTMLButtonElement | null>(null)

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
  // 對話框開著時，Tab 只在裡面循環（裡面只有一個按鈕）
  if (e.key === 'Tab') {
    e.preventDefault()
    closeBtn.value?.focus()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  closeBtn.value?.focus()
})
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="viewer" role="dialog" aria-modal="true" :aria-label="`圖片：${name}`" @click.self="emit('close')">
      <img :src="url" :alt="name" />
      <button ref="closeBtn" class="close focus-light" type="button" aria-label="關閉大圖" @click="emit('close')">
        <Icon name="x" />
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.viewer {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px 16px 16px;
  background: color-mix(in srgb, var(--ink) 82%, transparent);
}

img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  background: var(--bg-placeholder);
  object-fit: contain;
}

.close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: var(--tap);
  height: var(--tap);
  border: 0;
  border-radius: 50%;
  background: var(--bg-surface);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
