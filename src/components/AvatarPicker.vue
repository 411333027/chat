<script setup lang="ts">
// 進入畫面的「你的頭像」：預覽、上傳圖片、6 個內建圖案、6 種底色。
import { computed, ref } from 'vue'
import {
  AVATAR_COLORS,
  AVATAR_ICONS,
  ChatError,
  type Avatar,
  type AvatarColor,
  type AvatarIcon,
} from '@/services/chatService'
import {
  AVATAR_COLOR_LABEL,
  AVATAR_COLOR_VALUES,
  AVATAR_ICON_LABEL,
  AVATAR_ICON_PATHS,
  DEFAULT_AVATAR,
} from '@/utils/avatar'
import { useChatStore } from '@/stores/chat'
import AvatarBadge from './AvatarBadge.vue'
import Icon from './Icon.vue'

const avatar = defineModel<Avatar>({ required: true })

const store = useChatStore()
const fileInput = ref<HTMLInputElement | null>(null)
const processing = ref(false)
const error = ref('')
const lastPreset = ref<Avatar & { kind: 'preset' }>(
  avatar.value.kind === 'preset' ? avatar.value : (DEFAULT_AVATAR as Avatar & { kind: 'preset' }),
)

const uploaded = computed(() => avatar.value.kind === 'upload')
const current = computed(() => (avatar.value.kind === 'preset' ? avatar.value : lastPreset.value))
const previewLabel = computed(() =>
  uploaded.value
    ? '目前選的頭像：你上傳的圖片'
    : `目前選的頭像：${AVATAR_COLOR_LABEL[current.value.color]}${AVATAR_ICON_LABEL[current.value.icon]}`,
)

function setPreset(patch: { icon?: AvatarIcon; color?: AvatarColor }): void {
  if (uploaded.value) return
  const next = { ...current.value, ...patch }
  lastPreset.value = next
  avatar.value = next
}

function pickFile(): void {
  fileInput.value?.click()
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  error.value = ''
  processing.value = true
  try {
    avatar.value = await store.uploadAvatar(file)
  } catch (err) {
    error.value = err instanceof ChatError ? err.message : '圖片處理失敗，請換一張再試'
  } finally {
    processing.value = false
  }
}

function removeUpload(): void {
  error.value = ''
  avatar.value = lastPreset.value
}

function arrowMove(e: KeyboardEvent, list: readonly string[], value: string, apply: (v: string) => void): void {
  const i = list.indexOf(value)
  let next = i
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % list.length
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + list.length) % list.length
  else return
  e.preventDefault()
  apply(list[next])
  const group = (e.currentTarget as HTMLElement).parentElement
  ;(group?.children[next] as HTMLElement | undefined)?.focus()
}
</script>

<template>
  <fieldset class="picker">
    <legend>你的頭像</legend>

    <div class="top">
      <div role="img" :aria-label="previewLabel" class="preview">
        <AvatarBadge :avatar="avatar" :size="72" />
      </div>
      <div class="actions">
        <template v-if="!uploaded">
          <button type="button" class="btn" :disabled="processing" @click="pickFile">
            <Icon name="upload" :size="18" />上傳圖片
          </button>
          <span class="hint">png、jpg、webp，自動裁成圓形</span>
        </template>
        <template v-else>
          <button type="button" class="btn" :disabled="processing" @click="pickFile">更換圖片</button>
          <button type="button" class="btn remove" @click="removeUpload">移除，改用內建圖案</button>
        </template>
      </div>
      <input
        ref="fileInput"
        class="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        tabindex="-1"
        aria-hidden="true"
        @change="onFile"
      />
    </div>

    <div v-if="processing" role="status" class="note note-info">
      <Icon name="sync" :size="18" />圖片處理中…
    </div>
    <div v-else-if="error" role="alert" class="note note-error">
      <Icon name="alert" :size="18" />{{ error }}
    </div>

    <div class="group" role="radiogroup" aria-label="內建圖案" :class="{ off: uploaded }">
      <button
        v-for="icon in AVATAR_ICONS"
        :key="icon"
        type="button"
        role="radio"
        class="icon-opt"
        :aria-checked="!uploaded && current.icon === icon"
        :aria-label="AVATAR_ICON_LABEL[icon]"
        :disabled="uploaded"
        :tabindex="!uploaded && current.icon === icon ? 0 : -1"
        :class="{ on: !uploaded && current.icon === icon }"
        @click="setPreset({ icon })"
        @keydown="arrowMove($event, AVATAR_ICONS, current.icon, (v) => setPreset({ icon: v as AvatarIcon }))"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path v-for="d in AVATAR_ICON_PATHS[icon]" :key="d" :d="d" />
        </svg>
      </button>
    </div>

    <div class="group" role="radiogroup" aria-label="頭像底色" :class="{ off: uploaded }">
      <button
        v-for="color in AVATAR_COLORS"
        :key="color"
        type="button"
        role="radio"
        class="swatch"
        :aria-checked="!uploaded && current.color === color"
        :aria-label="AVATAR_COLOR_LABEL[color]"
        :disabled="uploaded"
        :tabindex="!uploaded && current.color === color ? 0 : -1"
        @click="setPreset({ color })"
        @keydown="arrowMove($event, AVATAR_COLORS, current.color, (v) => setPreset({ color: v as AvatarColor }))"
      >
        <span
          class="dot"
          :class="{ on: !uploaded && current.color === color }"
          :style="{ background: AVATAR_COLOR_VALUES[color].fg }"
        />
      </button>
    </div>
  </fieldset>
</template>

<style scoped>
.picker {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

legend {
  padding: 0;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-2);
}

.top {
  display: flex;
  align-items: center;
  gap: 16px;
}

.preview {
  flex: none;
}

.actions {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hint {
  font-size: 12px;
  color: var(--muted);
}

.remove {
  color: var(--danger);
}

.group {
  display: flex;
  gap: 6px;
}

.group.off {
  opacity: 0.45;
}

.icon-opt {
  flex: none;
  width: var(--tap);
  height: var(--tap);
  padding: 0;
  border-radius: 50%;
  border: 2px solid transparent;
  background: var(--bg-raised);
  color: var(--ink-2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-opt.on {
  border-color: var(--accent);
}

.icon-opt:disabled,
.swatch:disabled {
  cursor: not-allowed;
}

.swatch {
  flex: none;
  width: var(--tap);
  height: var(--tap);
  padding: 0;
  border: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: block;
}

.dot.on {
  box-shadow:
    0 0 0 2px var(--ring-gap, var(--bg-page)),
    0 0 0 4px var(--accent);
}
</style>
