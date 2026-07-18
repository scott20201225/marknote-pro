# File Icons

File icons used in **MarkText** and inspired by [file-icons/atom](https://github.com/file-icons/atom/tree/master).

![](https://github.com/marktext/file-icons/blob/main/preview.png)

#### Installation

```shell
yarn add @marknotepro/file-icons
```

#### Usage

```javascript
import fileIcons from '@marknotepro/file-icons'
import '@marknotepro/file-icons/build/index.css'

const icon = fileIcons.matchLanguage('javascript')
// iconEle.classList.add(icon.icon)
// icon with color
// iconEle.classList.add(icon.colour[0])
// iconEle.classList.add(icon.colour[1])
```

You can refer more APIs at [atom/icon-tables.js at master · file-icons/atom · GitHub](https://github.com/file-icons/atom/blob/master/lib/icons/icon-tables.js)

#### Development

```shell
yarn dev
```

And open browser at `http://127.0.0.1:3000/` to see the example. the example is at folder `src`.

#### Build and Publish

```shell
# Change the version in package.json
# Build to the build folder
yarn build
# Publish to npm
yarn pub
```

#### License

MIT.
