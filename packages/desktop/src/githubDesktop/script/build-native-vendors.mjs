import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const isWindows = process.platform === 'win32'

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: path.resolve(scriptDir, '../../..'),
    stdio: 'inherit',
    shell: isWindows,
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`)
  }
}

function prepareTrampoline() {
  run('pnpm', ['--filter', 'desktop-trampoline', 'exec', 'node-gyp', 'rebuild'])
  run('pnpm', ['--filter', 'desktop-trampoline', 'exec', 'tsc'])
  run('node', ['src/githubDesktop/script/prepare-trampoline.mjs'])
}

function prepareWindowsArgvParser() {
  if (!isWindows) {
    return
  }

  run('pnpm', ['--filter', 'windows-argv-parser', 'exec', 'node-gyp', 'rebuild'])
  run('pnpm', ['--filter', 'windows-argv-parser', 'exec', 'tsc'])

  const parserDir = path.resolve(
    scriptDir,
    '../upstream/vendor/windows-argv-parser'
  )
  const source = path.join(
    parserDir,
    'build',
    'Release',
    'windows-argv-parser.node'
  )
  const targetDir = path.join(parserDir, 'Release')
  const target = path.join(targetDir, 'windows-argv-parser.node')

  if (!fs.existsSync(source)) {
    throw new Error(`Missing windows argv parser native module: ${source}`)
  }

  fs.mkdirSync(targetDir, { recursive: true })
  fs.copyFileSync(source, target)
  console.log(`Prepared ${path.relative(parserDir, target)}`)
}

prepareTrampoline()
prepareWindowsArgvParser()
