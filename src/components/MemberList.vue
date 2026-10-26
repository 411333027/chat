<script setup lang="ts">
// 成員名單：頭像、代號、線上／離線中、隱藏／取消隱藏。電腦在右側固定欄，手機是獨立頁。
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import AvatarBadge from './AvatarBadge.vue'
import Icon from './Icon.vue'

defineProps<{ roomy?: boolean }>()
const store = useChatStore()

// 自己排第一，其他人照加入順序
const rows = computed(() => {
  const meId = store.me?.id
  return [...store.members].sort((a, b) => {
    if (a.id === meId) return -1
    if (b.id === meId) return 1
    return a.joinedAt.localeCompare(b.joinedAt)
  })
})
</script>

<template>
  <ul class="list" :class="{ roomy }">
    <li v-for="m in rows" :key="m.id" :class="{ hidden: store.hidden.has(m.id) }">
      <span v-if="store.hidden.has(m.id)" class="eye"><Icon name="eyeOff" :size="roomy ? 20 : 18" /></span>
      <AvatarBadge v-else :avatar="m.avatar" :size="roomy ? 40 : 34" />

      <div class="who">
        <span class="name">
          <span class="nick">{{ m.nickname }}</span>
          <span v-if="m.id === store.me?.id" class="chip you">你</span>
          <span v-else-if="store.hidden.has(m.id)" class="chip">已隱藏</span>
        </span>
        <span class="state">
          <span class="dot" :class="m.online ? 'on' : 'off'" aria-hidden="true" />{{ m.online ? '線上' : '離線中' }}
        </span>
      </div>

      <button
        v-if="m.id !== store.me?.id"
        type="button"
        class="hide"
        :aria-label="`${store.hidden.has(m.id) ? '取消隱藏' : '隱藏'} ${m.nickname}`"
        @click="store.toggleHide(m.id)"
      >
        {{ store.hidden.has(m.id) ? '取消隱藏' : '隱藏' }}
      </button>
    </li>
  </ul>
</template>

<style scoped>
.list {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
}

li {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 0 8px;
}

li.hidden {
  opacity: 0.75;
}

.eye {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--bg-page);
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.4;
}

.name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 500;
  min-width: 0;
}

.nick {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip {
  flex: none;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--bg-raised);
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 500;
}

.chip.you {
  background: var(--accent);
  color: var(--on-accent);
}

.state {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-sizing: border-box;
}

.dot.on {
  background: var(--online);
}

/* 離線中用空心圓加文字，不只靠顏色區分 */
.dot.off {
  border: 2px solid var(--faint);
}

.hide {
  flex: none;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--border-input);
  background: transparent;
  font-size: 13px;
  color: var(--ink);
}

.hide:hover {
  background: var(--bg-raised);
}

/* 手機獨立頁：列更高、字更大、按鈕至少 44px */
.roomy {
  padding: 8px 16px;
}

.roomy li {
  gap: 12px;
  min-height: 64px;
  border-bottom: 1px solid var(--line);
}

.roomy li:last-child {
  border-bottom: 0;
}

.roomy .eye {
  width: 40px;
  height: 40px;
}

.roomy .name {
  font-size: 16px;
}

.roomy .state {
  font-size: 13px;
}

.roomy .dot {
  width: 8px;
  height: 8px;
}

.roomy .chip {
  font-size: 12px;
  padding: 1px 8px;
}

.roomy .hide {
  min-height: var(--tap);
  min-width: 64px;
  border-radius: 10px;
  font-size: 14px;
}
</style>
