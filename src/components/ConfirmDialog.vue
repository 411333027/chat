<script setup lang="ts">
// 離開確認：置中對話框。Esc 取消，Tab 只在對話框裡循環。
import { onMounted, onUnmounted, ref } from 'vue'

defineProps<{ title: string; message: string; confirmLabel: string }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const cancelBtn = ref<HTMLButtonElement | null>(null)
const confirmBtn = ref<HTMLButtonElement | null>(null)
const previous = document.activeElement as HTMLElement | null

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    emit('cancel')
  } else if (e.key === 'Tab') {
    const first = cancelBtn.value
    const last = confirmBtn.value
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first?.focus()
    }
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  cancelBtn.value?.focus()
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  previous?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @click.self="emit('cancel')">
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">
        <div class="text">
          <h2 id="dlg-title">{{ title }}</h2>
          <p id="dlg-msg">{{ message }}</p>
        </div>
        <div class="actions">
          <button ref="cancelBtn" type="button" class="btn" @click="emit('cancel')">取消</button>
          <button ref="confirmBtn" type="button" class="btn btn-danger" @click="emit('confirm')">
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: color-mix(in srgb, var(--ink) 45%, transparent);
}

.dialog {
  width: 100%;
  max-width: 340px;
  padding: 20px;
  border-radius: var(--radius-card);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

h2 {
  font-size: 17px;
  font-weight: 700;
}

p {
  font-size: 14px;
  line-height: 1.6;
  color: var(--muted);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
