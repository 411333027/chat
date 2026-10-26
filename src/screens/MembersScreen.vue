<script setup lang="ts">
// 手機版的名單頁：返回、標題「成員」、人數、成員列。
import { ROOM_CAPACITY } from '@/utils/validate'
import { useChatStore } from '@/stores/chat'
import MemberList from '@/components/MemberList.vue'
import Icon from '@/components/Icon.vue'

const store = useChatStore()
</script>

<template>
  <div class="screen">
    <header class="bar on-accent">
      <div class="left">
        <button type="button" class="icon-btn" aria-label="返回訊息" @click="store.showChat()">
          <Icon name="back" :size="24" />
        </button>
        <h1>成員</h1>
      </div>
      <span class="count">{{ store.members.length }} / {{ ROOM_CAPACITY }}</span>
    </header>
    <div class="body">
      <MemberList roomy />
    </div>
  </div>
</template>

<style scoped>
.screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-page);
}

.bar {
  flex: none;
  height: var(--header-h);
  padding: 0 16px 0 8px;
  background: var(--accent);
  color: var(--on-accent);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.left {
  display: flex;
  align-items: center;
  gap: 4px;
}

h1 {
  font-size: 17px;
  font-weight: 700;
}

.count {
  font-size: 14px;
  color: var(--on-accent-muted);
}

.icon-btn {
  width: var(--tap);
  height: var(--tap);
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--on-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:hover {
  background: rgba(245, 241, 234, 0.12);
}

.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
