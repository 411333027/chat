<script setup lang="ts">
import { onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import DevPanel from '@/components/DevPanel.vue'
import ChatScreen from '@/screens/ChatScreen.vue'
import JoinScreen from '@/screens/JoinScreen.vue'

const store = useChatStore()
onMounted(() => store.init())
</script>

<template>
  <div v-if="store.booting" class="boot" role="status">載入中…</div>
  <ChatScreen v-else-if="store.phase === 'chat'" />
  <JoinScreen v-else />
  <DevPanel />
</template>

<style scoped>
.boot {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
</style>
