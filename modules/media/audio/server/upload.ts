import { open, unlink } from 'node:fs/promises'
import path from 'node:path'

export const MAX_AUDIO_UPLOAD_BYTES = 80 * 1024 * 1024

export async function saveAudioUpload(file: File, directory: string, base: string, extension: string) {
  if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
    throw new Error('音频文件不能超过 80MB。')
  }

  for (let suffix = 1; ; suffix += 1) {
    const filename = `${base}${suffix === 1 ? '' : `-${suffix}`}${extension}`
    const destination = path.join(directory, filename)
    let handle
    try {
      handle = await open(destination, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
      throw error
    }

    try {
      for await (const chunk of file.stream()) {
        let offset = 0
        while (offset < chunk.length) {
          const { bytesWritten } = await handle.write(chunk, offset)
          if (!bytesWritten) throw new Error('音频写入失败。')
          offset += bytesWritten
        }
      }
      await handle.close()
      return filename
    } catch (error) {
      await handle.close().catch(() => {})
      await unlink(destination).catch(() => {})
      throw error
    }
  }
}
