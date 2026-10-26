<script setup lang="ts">
// 「已編輯」展開後，顯示在訊息正下方的舊版本清單（不是視窗）。
import type { EditRecord } from '@/services/chatService'
import { formatTime } from '@/utils/format'

// records 由新到舊；最後一筆的內容就是最原始送出的版本
const props = defineProps<{ records: EditRecord[]; createdAt: string }>()

function label(i: number): string {
  return i === props.records.length - 1
    ? `原始送出 · ${formatTime(props.createdAt)}`
    : `修改前 · ${formatTime(props.records[i].editedAt)} 編輯`
}
</script>

<template>
  <ul class="history" aria-label="這則訊息的舊版本">
    <li v-for="(r, i) in records" :key="r.editedAt + i">
      <span class="when">{{ label(i) }}</span>
      <span class="what">{{ r.oldText }}</span>
    </li>
  </ul>
</template>

<style scoped>
.history {
  width: 300px;
  max-width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--bg-raised);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

li {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

li + li {
  padding-top: 10px;
  border-top: 1px solid var(--line-strong);
}

.when {
  font-size: 11px;
  color: var(--muted);
}

.what {
  font-size: 14px;
  color: var(--ink-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
