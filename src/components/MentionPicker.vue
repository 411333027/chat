<script setup lang="ts">
// 輸入「@」之後跳出的成員選單（在輸入框上方）。選項用 aria-activedescendant 對應輸入框。
import type { Member } from '@/services/chatService'
import AvatarBadge from './AvatarBadge.vue'

defineProps<{ id: string; members: Member[]; active: number }>()
const emit = defineEmits<{ pick: [member: Member] }>()
</script>

<template>
  <ul :id="id" class="picker" role="listbox" aria-label="選擇要 @ 的人">
    <li
      v-for="(m, i) in members"
      :id="`${id}-${i}`"
      :key="m.id"
      role="option"
      :aria-selected="i === active"
      :class="{ on: i === active }"
      @mousedown.prevent="emit('pick', m)"
    >
      <AvatarBadge :avatar="m.avatar" :size="26" />
      <span class="nick">{{ m.nickname }}</span>
      <span class="state">{{ m.online ? '線上' : '離線中' }}</span>
    </li>
  </ul>
</template>

<style scoped>
.picker {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: calc(100% + 6px);
  z-index: 10;
  max-width: 340px;
  max-height: 248px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-float);
}

li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
}

li.on,
li:hover {
  background: var(--bg-raised);
}

.nick {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state {
  flex: none;
  font-size: 12px;
  color: var(--muted);
}

@media (min-width: 860px) {
  .picker {
    left: 32px;
  }
}
</style>
