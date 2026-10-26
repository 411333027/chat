<script setup lang="ts">
// 檔案卡片：檔名、大小、「下載」，下面一行警示。上傳中時顯示進度。
import { toRef } from 'vue'
import type { FileInfo } from '@/services/chatService'
import { formatSize } from '@/utils/format'
import { useFileUrl } from '@/composables/useFileUrl'
import Icon from './Icon.vue'

const props = defineProps<{ file: FileInfo; progress?: number; sending?: boolean }>()
const { url, failed } = useFileUrl(toRef(() => (props.sending ? null : props.file.path)))
</script>

<template>
  <div class="card">
    <div class="top">
      <div class="icon"><Icon name="file" :size="22" /></div>
      <div class="meta">
        <span class="name" :title="file.name">{{ file.name }}</span>
        <span class="size">{{ formatSize(file.size) }}</span>
      </div>
    </div>

    <div
      v-if="sending"
      class="progress"
      role="progressbar"
      aria-label="上傳進度"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="progress ?? 0"
    >
      <span :style="{ width: (progress ?? 0) + '%' }" />
    </div>
    <template v-else>
      <p v-if="failed" class="gone">這個檔案已無法取得</p>
      <a v-else class="btn dl" :class="{ wait: !url }" :href="url || undefined" :download="file.name" :aria-disabled="!url">
        <Icon name="download" :size="18" />下載
      </a>
      <p class="warn">下載前請確認來源</p>
    </template>
  </div>
</template>

<style scoped>
.card {
  width: 232px;
  max-width: 100%;
  padding: 12px;
  border-radius: var(--radius-tail) var(--radius-bubble) var(--radius-bubble) var(--radius-bubble);
  background: var(--bg-raised);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.top {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--bg-placeholder);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size {
  font-size: 12px;
  color: var(--muted);
}

.dl {
  height: 40px;
  min-height: 40px;
  text-decoration: none;
}

.dl.wait {
  pointer-events: none;
  color: var(--faint);
}

.warn {
  font-size: 12px;
  line-height: 1.5;
  color: var(--warn);
}

.gone {
  font-size: 13px;
  color: var(--muted);
}

.progress {
  height: 6px;
  border-radius: 3px;
  background: var(--line-strong);
  overflow: hidden;
}

.progress span {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.12s linear;
}
</style>
