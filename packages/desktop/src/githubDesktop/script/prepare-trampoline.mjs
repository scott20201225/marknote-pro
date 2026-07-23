import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const trampolineDir = path.resolve(
  scriptDir,
  '../upstream/vendor/desktop-trampoline/build/Release'
)

const exeSuffix = process.platform === 'win32' ? '.exe' : ''
const credentialHelper = path.join(
  trampolineDir,
  `desktop-credential-helper-trampoline${exeSuffix}`
)
const gitCredentialHelper = path.join(
  trampolineDir,
  `git-credential-desktop${exeSuffix}`
)

if (!fs.existsSync(credentialHelper)) {
  throw new Error(`Missing desktop credential helper: ${credentialHelper}`)
}

fs.rmSync(gitCredentialHelper, { force: true })
fs.copyFileSync(credentialHelper, gitCredentialHelper)

if (process.platform !== 'win32') {
  fs.chmodSync(gitCredentialHelper, 0o755)
}

console.log(`Prepared ${path.basename(gitCredentialHelper)}`)
