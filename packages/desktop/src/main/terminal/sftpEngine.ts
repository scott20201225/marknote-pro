import * as path from 'path'
import * as fs from 'fs'
import type { ISftpItem, ISftpTransferProgress } from '../../shared/types/terminal'

export class SftpManager {
  public static async listDir(sftp: any, dirPath: string): Promise<ISftpItem[]> {
    const rawPath = (!dirPath || dirPath === '.') ? '.' : dirPath
    const resolvedPath = await new Promise<string>((resolve) => {
      sftp.realpath(rawPath, (err: any, target: string) => {
        if (err || !target) resolve(rawPath === '.' ? '/' : rawPath)
        else resolve(target)
      })
    })

    return new Promise((resolve, reject) => {
      sftp.readdir(resolvedPath, (err: any, list: any[]) => {
        if (err) return reject(err)

        const items: ISftpItem[] = (list || []).map((file) => {
          const isDir = file.longname ? file.longname.startsWith('d') : false
          const isSymlink = file.longname ? file.longname.startsWith('l') : false
          const size = file.attrs?.size || 0
          const modifyTime = (file.attrs?.mtime || 0) * 1000

          return {
            name: file.filename,
            path: path.posix.join(resolvedPath, file.filename),
            isDirectory: isDir,
            isSymlink,
            size,
            sizeFormatted: SftpManager.formatBytes(size),
            modifyTime,
            permissions: file.longname ? file.longname.split(' ')[0] : ''
          }
        })

        // Sort folders first, then alphabetically
        items.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })

        ;(items as any).currentPath = resolvedPath
        resolve(items)
      })
    })
  }

  public static async uploadFile(
    sftp: any,
    localPath: string,
    remotePath: string,
    onProgress: (progress: ISftpTransferProgress) => void
  ): Promise<void> {
    const stats = fs.statSync(localPath)
    const totalBytes = stats.size
    const fileName = path.basename(localPath)
    const transferId = `up_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`

    return new Promise((resolve, reject) => {
      let lastTime = Date.now()
      let lastBytes = 0

      sftp.fastPut(
        localPath,
        remotePath,
        {
          step: (transferred: number, _chunk: number, total: number) => {
            const now = Date.now()
            const timeDiff = (now - lastTime) / 1000
            let speedStr = '0 B/s'

            if (timeDiff > 0.5) {
              const byteDiff = transferred - lastBytes
              speedStr = `${SftpManager.formatBytes(byteDiff / timeDiff)}/s`
              lastTime = now
              lastBytes = transferred
            }

            const percent = total > 0 ? Math.round((transferred / total) * 100) : 0

            onProgress({
              id: transferId,
              type: 'upload',
              localPath,
              remotePath,
              fileName,
              name: fileName,
              totalBytes: total,
              transferredBytes: transferred,
              percent,
              speedFormatted: speedStr,
              status: percent >= 100 ? 'completed' : 'transferring'
            })
          }
        },
        (err: any) => {
          if (err) {
            onProgress({
              id: transferId,
              type: 'upload',
              localPath,
              remotePath,
              fileName,
              name: fileName,
              totalBytes,
              transferredBytes: 0,
              percent: 0,
              speedFormatted: '0 B/s',
              status: 'error',
              error: err.message
            })
            return reject(err)
          }

          onProgress({
            id: transferId,
            type: 'upload',
            localPath,
            remotePath,
            fileName,
            name: fileName,
            totalBytes,
            transferredBytes: totalBytes,
            percent: 100,
            speedFormatted: '完成',
            status: 'completed'
          })
          resolve()
        }
      )
    })
  }

  public static async downloadFile(
    sftp: any,
    remotePath: string,
    localPath: string,
    onProgress: (progress: ISftpTransferProgress) => void
  ): Promise<void> {
    const fileName = path.posix.basename(remotePath)
    const transferId = `down_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`

    return new Promise((resolve, reject) => {
      let lastTime = Date.now()
      let lastBytes = 0

      sftp.fastGet(
        remotePath,
        localPath,
        {
          step: (transferred: number, _chunk: number, total: number) => {
            const now = Date.now()
            const timeDiff = (now - lastTime) / 1000
            let speedStr = '0 B/s'

            if (timeDiff > 0.5) {
              const byteDiff = transferred - lastBytes
              speedStr = `${SftpManager.formatBytes(byteDiff / timeDiff)}/s`
              lastTime = now
              lastBytes = transferred
            }

            const percent = total > 0 ? Math.round((transferred / total) * 100) : 0

            onProgress({
              id: transferId,
              type: 'download',
              localPath,
              remotePath,
              fileName,
              name: fileName,
              totalBytes: total,
              transferredBytes: transferred,
              percent,
              speedFormatted: speedStr,
              status: percent >= 100 ? 'completed' : 'transferring'
            })
          }
        },
        (err: any) => {
          if (err) {
            onProgress({
              id: transferId,
              type: 'download',
              localPath,
              remotePath,
              fileName,
              name: fileName,
              totalBytes: 0,
              transferredBytes: 0,
              percent: 0,
              speedFormatted: '0 B/s',
              status: 'error',
              error: err.message
            })
            return reject(err)
          }

          onProgress({
            id: transferId,
            type: 'download',
            localPath,
            remotePath,
            fileName,
            name: fileName,
            totalBytes: 0,
            transferredBytes: 0,
            percent: 100,
            speedFormatted: '完成',
            status: 'completed'
          })

          resolve()
        }
      )
    })
  }

  public static async mkdir(sftp: any, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err: any) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  public static async deleteItem(sftp: any, remotePath: string, isDirectory: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      if (isDirectory) {
        sftp.rmdir(remotePath, (err: any) => {
          if (err) return reject(err)
          resolve()
        })
      } else {
        sftp.unlink(remotePath, (err: any) => {
          if (err) return reject(err)
          resolve()
        })
      }
    })
  }

  public static async rename(sftp: any, oldPath: string, newPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err: any) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  public static async readFile(sftp: any, remotePath: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
    return new Promise((resolve, reject) => {
      const stream = sftp.createReadStream(remotePath)
      const chunks: Buffer[] = []
      let total = 0
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        total += chunk.length
        if (total > maxBytes) {
          stream.destroy()
          reject(new Error('File exceeds editable size limit (2MB)'))
        }
      })
      stream.on('error', (err: any) => reject(err))
      stream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'))
      })
    })
  }

  public static async writeFile(sftp: any, remotePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      sftp.writeFile(remotePath, content || '', 'utf8', (err: any) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }
}
