import { constants, copyFileSync, cpSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('.', import.meta.url))
const installed = fileURLToPath(new URL('../../../node_modules/@mimiflow/sudachi/', import.meta.url))
const library = process.platform === 'darwin' ? 'libmimiflow_sudachi.dylib'
  : process.platform === 'win32' ? 'mimiflow_sudachi.dll' : 'libmimiflow_sudachi.so'
copyFileSync(new URL(`./target/release/${library}`, import.meta.url), new URL('./sudachi.node', import.meta.url))
// npm installs a real package, not a workspace symlink, so Next can externalize
// the native loader. Build output and dictionary never enter the npm tarball.
if (realpathSync(installed) !== realpathSync(source)) {
  for (const file of ['index.cjs', 'index.d.ts', 'sudachi.node']) {
    copyFileSync(new URL(file, import.meta.url), `${installed}/${file}`, constants.COPYFILE_FICLONE)
  }
  cpSync(new URL('./resources/', import.meta.url), `${installed}/resources`, { recursive: true, mode: constants.COPYFILE_FICLONE })
}
