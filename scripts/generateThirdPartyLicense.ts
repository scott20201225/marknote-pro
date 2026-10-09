/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-require-imports */
// @ts-nocheck
'use strict'

const path = require('path')
const fs = require('fs')
const thirdPartyChecker = require('./thirdPartyChecker.js')
const desktopRoot = path.resolve(__dirname, '..', 'packages/desktop')

thirdPartyChecker.getLicenses(desktopRoot, (err, packages) => {
  if (err) {
    console.log(`[ERROR] ${err}`)
    return
  }

  let summary = ''
  let licenseList = ''
  let index = 1
  const addedKeys = {}

  Object.keys(packages).forEach((key) => {
    let packageName = key
    const nameRegex = /(^.+)(?:@)/.exec(key)
    if (nameRegex && nameRegex[1]) {
      packageName = nameRegex[1]
    }

    if (Object.hasOwn(addedKeys, packageName)) {
      return
    }
    addedKeys[packageName] = 1

    const { licenses, licenseText } = packages[key]
    summary += `${index++}. ${packageName} (${licenses})\n`
    licenseList += `# ${packageName} (${licenses})
-------------------------------------------------\

${licenseText}
\n\n
`
  })

  const bundledApps = [
    {
      name: 'draw.io / diagrams.net',
      licenses: 'Apache-2.0',
      licenseText:
        'Copyright (c) 2005-present JGraph Ltd.\nLicensed under the Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0).'
    },
    {
      name: 'GeoGebra',
      licenses: 'GeoGebra Non-Commercial License / GPL-3.0 / CC-BY-NC-SA-3.0',
      licenseText:
        'Copyright (c) International GeoGebra Institute / GeoGebra GmbH (https://www.geogebra.org).\nSource code is licensed under the GNU General Public License v3.0 (GPLv3). Software, documentation, language files, and resources are subject to the GeoGebra Non-Commercial License Agreement / CC BY-NC-SA 3.0 (https://www.geogebra.org/license). Commercial use requires a commercial license agreement.'
    },
    {
      name: 'GitHub Desktop',
      licenses: 'MIT',
      licenseText:
        'Copyright (c) GitHub, Inc.\nLicensed under the MIT License (https://github.com/desktop/desktop).'
    },
    {
      name: 'Tabby (Terminal Schemes)',
      licenses: 'MIT',
      licenseText:
        'Copyright (c) 2017-present Eugenia Kim (Eugeny) (https://github.com/Eugeny/tabby).\nLicensed under the MIT License (https://github.com/Eugeny/tabby/blob/master/LICENSE).'
    }
  ]

  bundledApps.forEach(({ name, licenses, licenseText }) => {
    summary += `${index++}. ${name} (${licenses})\n`
    licenseList += `# ${name} (${licenses})
-------------------------------------------------

${licenseText}
\n\n
`
  })

  const output = `# Third Party Notices
-------------------------------------------------

This file contains all third-party packages and embedded applications that are bundled and shipped with MarkNotePro.

-------------------------------------------------
# Summary
-------------------------------------------------

${summary}

-------------------------------------------------
# Licenses
-------------------------------------------------

${licenseList}
`

  fs.writeFileSync(path.resolve(desktopRoot, 'build', 'THIRD-PARTY-LICENSES.txt'), output)
  console.log('THIRD-PARTY-LICENSES.txt generated successfully.')
})
