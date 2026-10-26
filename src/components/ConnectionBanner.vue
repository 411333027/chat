<script setup lang="ts">
import { useChatStore } from '@/stores/chat'
import Icon from './Icon.vue'

const store = useChatStore()
</script>

<template>
  <div v-if="store.connection !== 'connected'" class="banner note note-warn" role="status">
    <Icon name="clock" :size="18" />連線中斷，重新連線中…
  </div>
</template>

<style scoped>
.banner {
  margin: 8px 12px 0;
}
</style>
