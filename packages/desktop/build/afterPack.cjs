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
  console.log(`[afterPack] Ad-hoc signing macOS app bundle with entitlements: ${appPath}`)
  try {
    execSync(`codesign --force --deep --sign - --entitlements "${entitlementsPath}" "${appPath}"`, {
      stdio: 'inherit'
    })
    console.log(`[afterPack] Ad-hoc codesign completed successfully for ${appPath}`)
  } catch (err) {
    console.error(`[afterPack] Codesign failed:`, err)
    throw err
  }
}
