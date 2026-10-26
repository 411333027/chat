// 頭像：內建圖案的資料，以及上傳圖片的「洗圖」。
// 上傳的圖片先在瀏覽器裡從中間裁成正方形、縮成 256×256、重新編碼成 webp，
// 這樣原檔裡夾帶的東西與拍攝位置資料都不會留下（第 9 節）。

import { ChatError, type Avatar, type AvatarColor, type AvatarIcon } from '@/services/chatService'
import { AVATAR_PROCESSED_MAX_BYTES, checkAvatarFile } from './validate'

export const DEFAULT_AVATAR: Avatar = { kind: 'preset', icon: 'star', color: 'blue' }

export const AVATAR_ICON_LABEL: Record<AvatarIcon, string> = {
  star: '星星',
  moon: '月亮',
  leaf: '葉子',
  flame: '火焰',
  heart: '愛心',
  cloud: '雲',
}

export const AVATAR_COLOR_LABEL: Record<AvatarColor, string> = {
  blue: '藍色',
  green: '綠色',
  orange: '橘色',
  pink: '粉紅色',
  purple: '紫色',
  teal: '青色',
}

/** 24×24 座標、描邊圖示的 path（docs/design.md 3.2） */
export const AVATAR_ICON_PATHS: Record<AvatarIcon, string[]> = {
  star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  leaf: ['M5 19c0-9 5-14 15-14 0 10-5 15-14 15', 'M5 19l8-8'],
  flame: ['M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z'],
  heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  cloud: ['M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5A3.4 3.4 0 0 1 17 18z'],
}

/** 每個顏色：頭像底色（bg）與圖案／選色圓點的顏色（fg） */
export const AVATAR_COLOR_VALUES: Record<AvatarColor, { bg: string; fg: string }> = {
  blue: { bg: '#D3DCE3', fg: '#7F97AB' },
  green: { bg: '#D5E0D6', fg: '#849E8B' },
  orange: { bg: '#EBDCCB', fg: '#C09A78' },
  pink: { bg: '#EBD6D6', fg: '#C48F95' },
  purple: { bg: '#DDD6E3', fg: '#9B8BAA' },
  teal: { bg: '#D3E0DF', fg: '#82A5A3' },
}

const SIZE = 256

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** 檢查、裁切、縮小、重新編碼。回傳處理完的圖片（webp，不支援時用 jpeg）。 */
export async function processAvatarImage(file: File): Promise<Blob> {
  checkAvatarFile(file)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ChatError('AVATAR_TYPE_INVALID')
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ChatError('AVATAR_INVALID')
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE)
  bitmap.close()

  for (const quality of [0.86, 0.7, 0.5]) {
    const blob =
      (await canvasToBlob(canvas, 'image/webp', quality)) ?? (await canvasToBlob(canvas, 'image/jpeg', quality))
    if (blob && blob.size <= AVATAR_PROCESSED_MAX_BYTES) return blob
  }
  throw new ChatError('AVATAR_TOO_LARGE')
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
