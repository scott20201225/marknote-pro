import type { Client } from 'ssh2'
import type { IHardwareStats } from '../../shared/types/terminal'

export class LinuxHardwareProbe {
  private timer: NodeJS.Timeout | null = null
  private client: Client
  private onStatsCallback: (stats: IHardwareStats) => void

  private lastCpuIdle = 0
  private lastCpuTotal = 0
  private lastRxBytes = 0
  private lastTxBytes = 0
  private lastNetTime = 0

  constructor(client: Client, onStats: (stats: IHardwareStats) => void) {
    this.client = client
    this.onStatsCallback = onStats
  }

  private consecutiveErrors = 0

  public start(intervalMs = 5000): void {
    this.stop()
    this.consecutiveErrors = 0
    this.timer = setInterval(() => {
      this.poll()
    }, intervalMs)
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private poll(): void {
    const cmd = "cat /proc/stat /proc/meminfo /proc/loadavg /proc/net/dev 2>/dev/null; echo '---PROBE_END---'"
    try {
      this.client.exec(cmd, (err, stream) => {
        if (err || !stream) {
          this.consecutiveErrors++
          if (this.consecutiveErrors >= 3) {
            this.stop()
          }
          return
        }

        let output = ''
        stream.on('data', (data: Buffer) => {
          output += data.toString()
        })
        stream.on('error', () => {
          this.consecutiveErrors++
          if (this.consecutiveErrors >= 3) {
            this.stop()
          }
        })

        stream.on('close', () => {
          this.consecutiveErrors = 0
          if (output.includes('---PROBE_END---')) {
            const stats = this.parseOutput(output)
            if (stats) {
              this.onStatsCallback(stats)
            }
          }
        })
      })
    } catch {
      this.stop()
    }
  }

  private parseOutput(raw: string): IHardwareStats | null {
    try {
      let cpuPercent = 0
      let memPercent = 0
      let memUsedBytes = 0
      let memTotalBytes = 0
      let loadAvg: [number, number, number] = [0, 0, 0]
      let rxSpeedBytes = 0
      let txSpeedBytes = 0

      // 1. Parse CPU from /proc/stat
      const cpuMatch = raw.match(/^cpu\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m)
      if (cpuMatch) {
        const user = parseInt(cpuMatch[1], 10)
        const nice = parseInt(cpuMatch[2], 10)
        const sys = parseInt(cpuMatch[3], 10)
        const idle = parseInt(cpuMatch[4], 10)
        const iowait = parseInt(cpuMatch[5], 10)
        const irq = parseInt(cpuMatch[6], 10)
        const softirq = parseInt(cpuMatch[7], 10)

        const total = user + nice + sys + idle + iowait + irq + softirq
        const idleAll = idle + iowait

        if (this.lastCpuTotal > 0 && total > this.lastCpuTotal) {
          const totalDiff = total - this.lastCpuTotal
          const idleDiff = idleAll - this.lastCpuIdle
          cpuPercent = Math.max(0, Math.min(100, Math.round(((totalDiff - idleDiff) / totalDiff) * 100)))
        }

        this.lastCpuTotal = total
        this.lastCpuIdle = idleAll
      }

      // 2. Parse Memory from /proc/meminfo
      const memTotalMatch = raw.match(/MemTotal:\s+(\d+)\s+kB/)
      const memAvailMatch = raw.match(/MemAvailable:\s+(\d+)\s+kB/)
      const memFreeMatch = raw.match(/MemFree:\s+(\d+)\s+kB/)
      const buffersMatch = raw.match(/Buffers:\s+(\d+)\s+kB/)
      const cachedMatch = raw.match(/^Cached:\s+(\d+)\s+kB/m)

      if (memTotalMatch) {
        const totalKb = parseInt(memTotalMatch[1], 10)
        memTotalBytes = totalKb * 1024
        let availKb = 0

        if (memAvailMatch) {
          availKb = parseInt(memAvailMatch[1], 10)
        } else if (memFreeMatch) {
          const freeKb = parseInt(memFreeMatch[1], 10)
          const bufKb = buffersMatch ? parseInt(buffersMatch[1], 10) : 0
          const cacheKb = cachedMatch ? parseInt(cachedMatch[1], 10) : 0
          availKb = freeKb + bufKb + cacheKb
        }

        const usedKb = Math.max(0, totalKb - availKb)
        memUsedBytes = usedKb * 1024
        memPercent = totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : 0
      }

      // 3. Parse LoadAvg from /proc/loadavg
      const loadMatch = raw.match(/^(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)/m)
      if (loadMatch) {
        loadAvg = [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])]
      }

      // 4. Parse Network IO from /proc/net/dev
      const now = Date.now()
      let totalRx = 0
      let totalTx = 0

      const netLines = raw.split('\n')
      for (const line of netLines) {
        const match = line.match(/^\s*([a-zA-Z0-9]+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/)
        if (match) {
          const iface = match[1]
          if (iface === 'lo') continue
          totalRx += parseInt(match[2], 10)
          totalTx += parseInt(match[3], 10)
        }
      }

      if (this.lastNetTime > 0 && now > this.lastNetTime) {
        const seconds = (now - this.lastNetTime) / 1000
        rxSpeedBytes = Math.max(0, Math.round((totalRx - this.lastRxBytes) / seconds))
        txSpeedBytes = Math.max(0, Math.round((totalTx - this.lastTxBytes) / seconds))
      }

      this.lastRxBytes = totalRx
      this.lastTxBytes = totalTx
      this.lastNetTime = now

      return {
        cpuUsage: cpuPercent,
        cpuPercent,
        memoryPercent: memPercent,
        memPercent,
        memoryUsed: memUsedBytes,
        memUsedBytes,
        memoryTotal: memTotalBytes,
        memTotalBytes,
        memUsedFormatted: this.formatBytes(memUsedBytes),
        memTotalFormatted: this.formatBytes(memTotalBytes),
        loadAvg,
        networkRx: rxSpeedBytes,
        networkTx: txSpeedBytes,
        rxSpeedBytes,
        txSpeedBytes,
        rxSpeedFormatted: `${this.formatBytes(rxSpeedBytes)}/s`,
        txSpeedFormatted: `${this.formatBytes(txSpeedBytes)}/s`
      }
    } catch {
      return null
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }
}
