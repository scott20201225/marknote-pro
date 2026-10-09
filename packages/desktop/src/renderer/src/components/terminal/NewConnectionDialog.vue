<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑连接配置' : '新建终端连接'"
    width="580px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <!-- Protocol Tabs -->
    <el-tabs v-model="form.type" class="connection-protocol-tabs">
      <el-tab-pane label="SSH" name="ssh">
        <template #label>
          <span class="tab-label"><el-icon><Monitor /></el-icon> SSH</span>
        </template>
      </el-tab-pane>
      <el-tab-pane label="Telnet" name="telnet">
        <template #label>
          <span class="tab-label"><el-icon><Connection /></el-icon> Telnet</span>
        </template>
      </el-tab-pane>
      <el-tab-pane label="Serial (物理串口)" name="serial">
        <template #label>
          <span class="tab-label"><el-icon><Cpu /></el-icon> Serial 串口</span>
        </template>
      </el-tab-pane>
      <el-tab-pane label="Raw Socket" name="rawSocket">
        <template #label>
          <span class="tab-label"><el-icon><Share /></el-icon> Raw Socket</span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <el-form label-position="top" class="connection-form">
      <!-- Name & Group -->
      <div class="form-row">
        <el-form-item label="会话名称" class="flex-1">
          <el-input v-model="form.name" placeholder="例如: 生产服务器-01" />
        </el-form-item>
        <el-form-item label="分组 / 标签" class="flex-1">
          <el-input v-model="form.group" placeholder="例如: 生产环境 / 阿里云" />
        </el-form-item>
      </div>

      <!-- SSH Specific Fields -->
      <template v-if="form.type === 'ssh'">
        <div class="form-row">
          <el-form-item label="主机地址 (Host / IP)" class="flex-2" required>
            <el-input v-model="form.host" placeholder="192.168.1.100 或 example.com" />
          </el-form-item>
          <el-form-item label="端口" class="flex-1">
            <el-input-number v-model="form.port" :min="1" :max="65535" class="w-100" />
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item label="用户名 (User)" class="flex-1" required>
            <el-input v-model="form.username" placeholder="root" />
          </el-form-item>
          <el-form-item label="认证方式" class="flex-1">
            <el-select v-model="form.authType" class="w-100">
              <el-option label="密码认证 (Password)" value="password" />
              <el-option label="私钥认证 (Private Key)" value="privateKey" />
              <el-option label="交互式认证 (Interactive)" value="interactive" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item v-if="form.authType === 'password'" label="密码">
          <el-input v-model="form.password" type="password" show-password placeholder="输入主机密码" />
        </el-form-item>

        <template v-if="form.authType === 'privateKey'">
          <el-form-item label="私钥路径或私钥内容">
            <el-input
              v-model="form.privateKey"
              type="textarea"
              :rows="3"
              placeholder="~/.ssh/id_rsa 或直接粘贴私钥内容 (-----BEGIN OPENSSH PRIVATE KEY-----)"
            />
          </el-form-item>
          <el-form-item label="私钥口令 (Passphrase)">
            <el-input v-model="form.passphrase" type="password" show-password placeholder="私钥密码 (无口令可留空)" />
          </el-form-item>
        </template>

        <!-- Advanced SSH Options Toggle -->
        <el-collapse class="advanced-collapse">
          <el-collapse-item title="高级选项 (2FA TOTP / 跳板机 JumpHost / Keepalive)">
            <el-form-item label="2FA TOTP 密钥 (自动计算6位动态码)">
              <el-input v-model="form.totpSecret" placeholder="Base32 密钥或 otpauth:// 链接" />
            </el-form-item>
            <div class="form-row">
              <el-form-item label="跳板机地址" class="flex-2">
                <el-input v-model="form.jumpHost" placeholder="jump.example.com (可选)" />
              </el-form-item>
              <el-form-item label="跳板机端口" class="flex-1">
                <el-input-number v-model="form.jumpPort" :min="1" :max="65535" class="w-100" />
              </el-form-item>
            </div>
            <div class="form-row">
              <el-form-item label="跳板机用户名" class="flex-1">
                <el-input v-model="form.jumpUsername" placeholder="跳板机用户名" />
              </el-form-item>
              <el-form-item label="跳板机密码" class="flex-1">
                <el-input v-model="form.jumpPassword" type="password" show-password placeholder="跳板机密码" />
              </el-form-item>
            </div>
            <el-form-item label="心跳包间隔 (Keepalive 秒)">
              <el-input-number v-model="form.keepaliveInterval" :min="0" :max="300" />
            </el-form-item>
          </el-collapse-item>
        </el-collapse>
      </template>

      <!-- Telnet Specific Fields -->
      <template v-if="form.type === 'telnet'">
        <div class="form-row">
          <el-form-item label="主机地址 (Host / IP)" class="flex-2" required>
            <el-input v-model="form.host" placeholder="192.168.1.1" />
          </el-form-item>
          <el-form-item label="端口" class="flex-1">
            <el-input-number v-model="form.port" :min="1" :max="65535" class="w-100" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item label="用户名 (可选)" class="flex-1">
            <el-input v-model="form.username" placeholder="admin" />
          </el-form-item>
          <el-form-item label="密码 (可选)" class="flex-1">
            <el-input v-model="form.password" type="password" show-password />
          </el-form-item>
        </div>
      </template>

      <!-- Serial Specific Fields -->
      <template v-if="form.type === 'serial'">
        <div class="form-row">
          <el-form-item label="串口设备 (Serial Port)" class="flex-2" required>
            <el-select
              v-model="form.serialPort"
              filterable
              allow-create
              placeholder="选择或输入串口路径 (例如 /dev/tty.usbserial-10)"
              class="w-100"
            >
              <el-option
                v-for="p in serialPortOptions"
                :key="p.path"
                :label="`${p.path} ${p.manufacturer ? `(${p.manufacturer})` : ''}`"
                :value="p.path"
              />
            </el-select>
          </el-form-item>
          <el-form-item label=" " class="flex-0-auto">
            <el-button :icon="Refresh" circle title="扫描串口设备" @click="scanSerialPorts" />
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item label="波特率 (Baud Rate)" class="flex-1">
            <el-select v-model="form.baudRate" class="w-100">
              <el-option v-for="b in baudRates" :key="b" :label="String(b)" :value="b" />
            </el-select>
          </el-form-item>
          <el-form-item label="数据位 (Data Bits)" class="flex-1">
            <el-select v-model="form.dataBits" class="w-100">
              <el-option :label="'8'" :value="8" />
              <el-option :label="'7'" :value="7" />
              <el-option :label="'6'" :value="6" />
              <el-option :label="'5'" :value="5" />
            </el-select>
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item label="停止位 (Stop Bits)" class="flex-1">
            <el-select v-model="form.stopBits" class="w-100">
              <el-option :label="'1'" :value="1" />
              <el-option :label="'2'" :value="2" />
            </el-select>
          </el-form-item>
          <el-form-item label="校验位 (Parity)" class="flex-1">
            <el-select v-model="form.parity" class="w-100">
              <el-option label="None (无校验)" value="none" />
              <el-option label="Even (偶校验)" value="even" />
              <el-option label="Odd (奇校验)" value="odd" />
            </el-select>
          </el-form-item>
        </div>
      </template>

      <!-- Raw Socket Specific Fields -->
      <template v-if="form.type === 'rawSocket'">
        <div class="form-row">
          <el-form-item label="协议类型" class="flex-1">
            <el-select v-model="form.socketProtocol" class="w-100">
              <el-option label="TCP 原始套接字" value="tcp" />
              <el-option label="UDP 数据报套接字" value="udp" />
            </el-select>
          </el-form-item>
          <el-form-item label="端口" class="flex-1" required>
            <el-input-number v-model="form.port" :min="1" :max="65535" class="w-100" />
          </el-form-item>
        </div>
        <el-form-item label="目标主机 / IP" required>
          <el-input v-model="form.host" placeholder="127.0.0.1 或目标服务地址" />
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <div class="footer-left">
          <el-button
            v-if="form.type === 'ssh' || form.type === 'telnet' || form.type === 'rawSocket'"
            :loading="testingLatency"
            @click="testPing"
          >
            {{ latencyResult !== null ? `延迟: ${latencyResult}ms` : '测试延迟' }}
          </el-button>
        </div>
        <div class="footer-right">
          <el-button @click="visible = false">取消</el-button>
          <el-button @click="handleSaveOnly">仅保存</el-button>
          <el-button type="primary" :loading="connecting" @click="handleSaveAndConnect">
            保存并连接
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { Monitor, Connection, Cpu, Share, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useTerminalStore } from '@/store/terminal'
import type { ITerminalConnectionConfig, TerminalProtocolType } from '@shared/types/terminal'

const emit = defineEmits<{
  (e: 'connect', config: ITerminalConnectionConfig): void
}>()

const terminalStore = useTerminalStore()

const visible = ref(false)
const isEdit = ref(false)
const connecting = ref(false)
const testingLatency = ref(false)
const latencyResult = ref<number | null>(null)
const serialPortOptions = ref<Array<{ path: string; manufacturer?: string }>>([])

const baudRates = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

const form = reactive<ITerminalConnectionConfig>({
  id: '',
  name: '',
  type: 'ssh',
  host: '',
  port: 22,
  username: 'root',
  authType: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
  totpSecret: '',
  jumpHost: '',
  jumpPort: 22,
  jumpUsername: '',
  jumpPassword: '',
  keepaliveInterval: 15,
  serialPort: '',
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  socketProtocol: 'tcp',
  group: ''
})

watch(
  () => form.type,
  (newType) => {
    if (newType === 'ssh' && (!form.port || form.port === 23)) form.port = 22
    if (newType === 'telnet' && (!form.port || form.port === 22)) form.port = 23
    if (newType === 'serial') scanSerialPorts()
  }
)

async function scanSerialPorts(): Promise<void> {
  try {
    const list = await window.electron.ipcRenderer.invoke('mt::terminal:list-serial-ports')
    serialPortOptions.value = list || []
    if (list && list.length > 0 && !form.serialPort) {
      form.serialPort = list[0].path
    }
  } catch (err) {
    console.warn('Failed to scan serial ports:', err)
  }
}

async function testPing(): Promise<void> {
  if (!form.host) {
    ElMessage.warning('请先输入主机地址')
    return
  }
  testingLatency.value = true
  latencyResult.value = null
  try {
    const ms = await terminalStore.testLatency(form.host, form.port || 22)
    latencyResult.value = ms
    ElMessage.success(`连接成功，网络延迟: ${ms} ms`)
  } catch (err: any) {
    ElMessage.error(`连接测试失败: ${err.message || '超时'}`)
  } finally {
    testingLatency.value = false
  }
}

function buildConfig(): ITerminalConnectionConfig {
  const config = { ...form }
  if (!config.id) {
    config.id = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  }
  if (!config.name) {
    if (config.type === 'serial') {
      config.name = `Serial: ${config.serialPort || 'COM'}`
    } else {
      config.name = `${config.type.toUpperCase()}: ${config.host || 'localhost'}`
    }
  }
  return config
}

async function handleSaveOnly(): Promise<void> {
  const config = buildConfig()
  await terminalStore.saveServer(config)
  ElMessage.success('已保存连接配置')
  visible.value = false
}

async function handleSaveAndConnect(): Promise<void> {
  const config = buildConfig()
  await terminalStore.saveServer(config)
  visible.value = false
  emit('connect', config)
}

function open(config?: Partial<ITerminalConnectionConfig>): void {
  isEdit.value = !!config?.id
  latencyResult.value = null
  Object.assign(form, {
    id: config?.id || '',
    name: config?.name || '',
    type: config?.type || 'ssh',
    host: config?.host || '',
    port: config?.port || 22,
    username: config?.username || 'root',
    authType: config?.authType || 'password',
    password: config?.password || '',
    privateKey: config?.privateKey || '',
    passphrase: config?.passphrase || '',
    totpSecret: config?.totpSecret || '',
    jumpHost: config?.jumpHost || '',
    jumpPort: config?.jumpPort || 22,
    jumpUsername: config?.jumpUsername || '',
    jumpPassword: config?.jumpPassword || '',
    keepaliveInterval: config?.keepaliveInterval ?? 15,
    serialPort: config?.serialPort || '',
    baudRate: config?.baudRate || 115200,
    dataBits: config?.dataBits || 8,
    stopBits: config?.stopBits || 1,
    parity: config?.parity || 'none',
    socketProtocol: config?.socketProtocol || 'tcp',
    group: config?.group || ''
  })
  visible.value = true
  if (form.type === 'serial') {
    scanSerialPorts()
  }
}

function handleClosed(): void {
  latencyResult.value = null
}

defineExpose({
  open
})
</script>

<style scoped>
.connection-protocol-tabs {
  margin-bottom: 12px;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.connection-form {
  max-height: 480px;
  overflow-y: auto;
  padding-right: 4px;
}

.form-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.flex-1 {
  flex: 1;
}

.flex-2 {
  flex: 2;
}

.flex-0-auto {
  flex: 0 0 auto;
  margin-top: 30px;
}

.w-100 {
  width: 100%;
}

.advanced-collapse {
  margin-top: 12px;
  border-radius: 6px;
  border: 1px solid var(--itemBgColor, #333);
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.footer-right {
  display: flex;
  gap: 8px;
}
</style>
