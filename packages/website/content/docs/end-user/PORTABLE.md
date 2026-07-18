# Portable Mode

MarkNotePro stores all user configuration inside the [application data directory](APPLICATION_DATA_DIRECTORY.md) that can be changed with `--user-data-dir` command-line flag.

## Linux and Windows

On Linux and Windows you can also create a directory called `marknotepro-user-data` to save all user data inside the directory. Like:

```
marknotepro-portable/
 ├── marknotepro (Linux) or MarkNotePro.exe (Windows)
 ├── marknotepro-user-data/
 ├── resources/
 ├── THIRD-PARTY-LICENSES.txt
 └── ...
```
