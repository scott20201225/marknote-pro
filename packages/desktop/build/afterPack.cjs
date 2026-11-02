const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }
  let appName = `${context.packager.appInfo.productFilename}.app`
  let appPath = path.join(context.appOutDir, appName)
  if (!fs.existsSync(appPath)) {
    const entries = fs.readdirSync(context.appOutDir)
    const found = entries.find((e) => e.endsWith('.app'))
    if (found) {
      appPath = path.join(context.appOutDir, found)
    }
  }

  const entitlementsPath = path.join(__dirname, 'mac', 'entitlements.mac.plist')
  console.log(`[afterPack] Clean inside-out ad-hoc signing with stable Designated Requirement: ${appPath}`)

  const run = (cmd) => {
    execSync(cmd, { stdio: 'inherit' })
  }

  try {
    // 1. Sign helper binaries inside Electron Framework
    const crashpad = path.join(
      appPath,
      'Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler'
    )
    if (fs.existsSync(crashpad)) {
      run(`codesign --force --sign - "${crashpad}"`)
    }

    // 2. Sign bundled CLI tools (e.g. mac-scroll)
    const staticBin = path.join(appPath, 'Contents/Resources/static/bin/mac-scroll')
    if (fs.existsSync(staticBin)) {
      run(`codesign --force --sign - "${staticBin}"`)
    }

    // 3. Sign nested frameworks
    const fwDir = path.join(appPath, 'Contents/Frameworks')
    if (fs.existsSync(fwDir)) {
      const fwEntries = fs.readdirSync(fwDir)
      for (const entry of fwEntries) {
        if (entry.endsWith('.framework')) {
          const full = path.join(fwDir, entry)
          run(`codesign --force --sign - "${full}"`)
        }
      }

      // 4. Sign helper apps
      for (const entry of fwEntries) {
        if (entry.endsWith('.app')) {
          const full = path.join(fwDir, entry)
          run(`codesign --force --sign - --entitlements "${entitlementsPath}" "${full}"`)
        }
      }
    }

    // 5. Sign main app bundle with permanent stable Designated Requirement
    run(
      `codesign --force --sign - -r="designated => identifier \\"com.scott20201225.marknotepro\\"" --entitlements "${entitlementsPath}" "${appPath}"`
    )

    console.log(`[afterPack] Successfully signed ${appPath} with stable Designated Requirement!`)
  } catch (err) {
    console.error(`[afterPack] Codesign failed:`, err)
    throw err
  }
}
