import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, rename, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

// Same full dictionary as the previous analyzer; verify the actual extracted
// dictionary bytes, not just the version in a remote filename.
const dictionaryUrl = 'https://d2ej7fkh96fzlu.cloudfront.net/sudachidict/sudachi-dictionary-20260428-full.zip'
const dictionarySha256 = '2c993988aae44cbad92b395790c951aa2dad957c983a7d4c32944f6263e02593'
const target = fileURLToPath(new URL('../modules/language/native/resources/system.dic', import.meta.url))
async function digest(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
let exists = false
try { await access(target); exists = true } catch (error) {
  if (error.code !== 'ENOENT') throw error
}
if (exists) {
  if (await digest(target) !== dictionarySha256) {
    throw new Error('Sudachi dictionary checksum mismatch; existing file was left unchanged.')
  }
  console.log('Sudachi full 20260428 dictionary verified.')
} else {
  console.log('Downloading Sudachi full 20260428 dictionary…')
  const temporary = `${target}.${process.pid}.tmp`
  try {
    const response = await fetch(dictionaryUrl, { signal: AbortSignal.timeout(180_000) })
    if (!response.ok) throw new Error(`Dictionary download failed: HTTP ${response.status}`)
    const archive = await JSZip.loadAsync(await response.arrayBuffer())
    const files = archive.file(/(?:^|\/)system_full\.dic$/)
    if (files.length !== 1) throw new Error('Dictionary archive has an unexpected layout')
    await pipeline(files[0].nodeStream(), createWriteStream(temporary, { flags: 'wx' }))
    if (await digest(temporary) !== dictionarySha256) throw new Error('Downloaded dictionary checksum mismatch')
    await rename(temporary, target)
    console.log('Sudachi dictionary installed and verified.')
  } finally {
    await rm(temporary, { force: true })
  }
}
