# Linux Installation Instructions

## AppImage

[Download the AppImage](https://github.com/scott20201225/marknote-pro/releases/latest) and type the following:

1. `chmod +x marknotepro-%version%-x86_64.AppImage`
2. `./marknotepro-%version%-x86_64.AppImage`
3. Now you can execute MarkNotePro.

### Installation

You cannot really install an AppImage. It's a file which can run directly after getting executable permission. To integrate it into desktop environment, you can either create desktop entry manually **or** use [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher).

#### Desktop file creation

See [example desktop file](https://github.com/scott20201225/marknote-pro/blob/main/packages/desktop/build/linux/marknotepro.desktop).

```bash
$ curl -L https://raw.githubusercontent.com/scott20201225/marknote-pro/main/packages/desktop/build/linux/marknotepro.desktop -o $HOME/.local/share/applications/marknotepro.desktop

# Update the Exec in desktop file to your real marknotepro command. Specify Path if necessary.
$ vim $HOME/.local/share/applications/marknotepro.desktop

$ update-desktop-database $HOME/.local/share/applications/
```

#### AppImageLauncher integration

You can integrate the AppImage into the system via [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher). It will handle the desktop entry automatically.

### Uninstallation

1. Delete AppImage file.
2. Delete your desktop file if exists.
3. Delete your user settings: `~/.config/marknotepro`

### Custom launch script

1. Save AppImage somewhere. Let's say `~/bin/marknotepro.AppImage`
2. `chmod +x ~/bin/marknotepro.AppImage`
3. Create a launch script:

   ```sh
   #!/bin/bash
   DESKTOPINTEGRATION=0 ~/bin/marknotepro.AppImage
   ```

### Known issues

- MarkNotePro is always integrated into desktop environment after updating

## Binary

You can download the latest `marknotepro-%version%.tar.gz` package from the [release page](https://github.com/scott20201225/marknote-pro/releases/latest). You may need to install electron dependencies.

## Arch User Repository

MarkNotePro is available on the AUR as `marknotepro-bin` and will automatically install the dependencies: `glibc`, `gtk3`, `nss`, `alsa-lib`, `libxss`, `cups`, `libxkbcommon`, `libxkbfile`, `mesa`, and `hicolor-icon-theme`.

Install it via an AUR helper like `yay -S marknotepro-bin` or with

```bash
git clone https://aur.archlinux.org/marknotepro.git
cd marknotepro-bin
makepkg -si
```

Note: The AUR package is not maintained by the maintainer of this repository and may be out of date. Take note of the version numbers and modify the PKGBUILD on the AUR as necessary before installation or update.
