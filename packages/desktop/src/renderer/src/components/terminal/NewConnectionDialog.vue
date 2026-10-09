<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? t('terminal.dialog.editTitle') : t('terminal.dialog.newTitle')"
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
      <el-tab-pane :label="t('terminal.dialog.serial')" name="serial">
        <template #label>
          <span class="tab-label"><el-icon><Cpu /></el-icon> {{ t('terminal.dialog.serialTab') }}</span>
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
        <el-form-item :label="t('terminal.dialog.sessionName')" class="flex-1">
          <el-input v-model="form.name" :placeholder="t('terminal.dialog.sessionNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('terminal.dialog.group')" class="flex-1">
          <el-input v-model="form.group" :placeholder="t('terminal.dialog.groupPlaceholder')" />
        </el-form-item>
      </div>

      <!-- SSH Specific Fields -->
      <template v-if="form.type === 'ssh'">
        <div class="form-row">
          <el-form-item :label="t('terminal.dialog.host')" class="flex-2" required>
            <el-input v-model="form.host" :placeholder="t('terminal.dialog.hostPlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('terminal.dialog.port')" class="flex-1">
            <el-input-number v-model="form.port" :min="1" :max="65535" class="w-100" />
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item :label="t('terminal.dialog.username')" class="flex-1" required>
            <el-input v-model="form.username" placeholder="root" />
          </el-form-item>
          <el-form-item :label="t('terminal.dialog.authType')" class="flex-1">
            <el-select v-model="form.authType" class="w-100">
              <el-option :label="t('terminal.dialog.authPassword')" value="password" />
              <el-option :label="t('terminal.dialog.authPrivateKey')" value="privateKey" />
              <el-option :label="t('terminal.dialog.authInteractive')" value="interactive" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item v-if="form.authType === 'password'" :label="t('terminal.dialog.password')">
          <el-input v-model="form.password" type="password" show-password :placeholder="t('terminal.dialog.passwordPlaceholder')" />
        </el-form-item>

        <template v-if="form.authType === 'privateKey'">
          <el-form-item :label="t('terminal.dialog.privateKey')">
            <el-input
              v-model="form.privateKey"
              type="textarea"
              :rows="3"
              :placeholder="t('terminal.dialog.privateKeyPlaceholder')"
            />
          </el-form-item>
          <el-form-item :label="t('terminal.dialog.passphrase')">
            <el-input v-model="form.passphrase" type="password" show-password :placeholder="t('terminal.dialog.passphrasePlaceholder')" />
          </el-form-item>
        </template>

        <!-- Advanced SSH Options Toggle -->
        <el-collapse class="advanced-collapse">
          <el-collapse-item :title="t('terminal.dialog.advanced')">
            <el-form-item :label="t('terminal.dialog.totpSecret')">
              <el-input v-model="form.totpSecret" :placeholder="t('terminal.dialog.totpSecretPlaceholder')" />
            </el-form-item>
            <div class="form-row">
              <el-form-item :label="t('terminal.dialog.jumpHost')" class="flex-2">
                <el-input v-model="form.jumpHost" :placeholder="t('terminal.dialog.jumpHostPlaceholder')" />
              </el-form-item>
              <el-form-item :label="t('terminal.dialog.jumpPort')" class="flex-1">
                <el-input-number v-model="form.jumpPort" :min="1" :max="65535" class="w-100" />
              </el-form-item>
            </div>
            <div class="form-row">
              <el-form-item :label="t('terminal.dialog.jumpUsername')" class="flex-1">
                <el-input v-model="form.jumpUsername" :placeholder="t('terminal.dialog.jumpUsername')" />
              </el-form-item>
              <el-form-item :label="t('terminal.dialog.jumpPassword')" class="flex-1">
                <el-input v-model="form.jumpPassword" type="password" show-password :placeholder="t('terminal.dialog.jumpPassword')" />
              </el-form-item>
            </div>
            <el-form-item :label="t('terminal.dialog.keepalive')">
              <el-input-number v-model="form.keepaliveInterval" :min="0" :max="300" />
            </el-form-item>
          </el-collapse-item>
        </el-collapse>
      </template>

      <!-- Telnet Specific Fields -->
      <template v-if="form.type === 'telnet'">
        <div class="form-row">
          <el-form-item :label="t('terminal.dialog.host')" class="flex-2" required>
            <el-input v-model="form.host" placeholder="192.168.1.1" />
          </el-form-item>
          <el-form-item :label="t('terminal.dialog.port')" class="flex-1">
            <el-input-number v-model="form.port" :min="1" :max="65535" class="w-100" />
          </el-form-item>
        </div>
        <div class="form-row">
          <el-form-item :label="t('terminal.dialog.username')" class="flex-1">
            <el-input v-model="form.username" placeholder="admin" />
          </el-form-item>
          <el-form-item :label="t('terminal.dialog.password')" class="flex-1">
            <el-input v-model="form.password" type="password" show-password />
          </el-form-item>
        </div>
      </template>

      <!-- Serial Specific Fields -->
      <template v-if="form.type === 'serial'">
        <div class="form-row">
          <el-form-item :label="t('terminal.dialog.serialPort')" class="flex-2" required>
            <el-select
              v-model="form.serialPort"
              filterable
              allow-create
              :placeholder="t('terminal.dialog.serialPortPlaceholder')"
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
            <el-button :icon="Refresh" circle :title="t('terminal.dialog.scanSerialPorts')" @click="scanSerialPorts" />
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item :label="t('terminal.dialog.baudRate')" class="flex-1">
            <el-select v-model="form.baudRate" class="w-100">
              <el-option v-for="b in baudRates" :key="b" :label="String(b)" :value="b" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('terminal.dialog.dataBits')" class="flex-1">
            <el-select v-model="form.dataBits" class="w-100">
              <el-option :label="'8'" :value="8" />
              <el-option :label="'7'" :value="7" />
              <el-option :label="'6'" :value="6" />
              <el-option :label="'5'" :value="5" />
            </el-select>
          </el-form-item>
        </div>

        <div class="form-row">
          <el-form-item :label="t('terminal.dialog.stopBits')" class="flex-1">
            <el-select v-model="form.stopBits" class="w-100">
              <el-option :label="'1'" :value="1" />
              <el-option :label="'2'" :value="2" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('terminal.dialog.parity')" class="flex-1">
            <el-select v-model="form.parity" class="w-100">
              <el-option :label="t('terminal.dialog.parityNone')" value="none" />
              <el-option :label="t('terminal.dialog.parityEven')" value="even" />
              <el-option :label="t('terminal.dialog.parityOdd')" value="odd" />
            </el-select>
          </el-form-item>
        </div>
      </template>

      <!-- Raw Socket Specific Fields -->
      <template v-if="form.type === 'rawSocket'">
        <div class="form-row">
          <el-form-item :label="t('terminal.dialog.socketProtocol')" class="flex-1">
            <el-select v-model="form.socketProtocol" class="w-100">
              <el-option :label="t('terminal.dialog.tcpSocket')" value="tcp" />
              <el-option :label="t('terminal.dialog.udpSocket')" value="udp" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('terminal.dialog.port')" class="flex-1" required>
            <el-input-number v-model="form.port" :min="1" :max="65535" class="w-100" />
          </el-form-item>
        </div>
        <el-form-item :label="t('terminal.dialog.targetHost')" required>
          <el-input v-model="form.host" :placeholder="t('terminal.dialog.targetHostPlaceholder')" />
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
            {{ latencyResult !== null ? t('terminal.dialog.latency', { ms: latencyResult }) : t('terminal.dialog.testLatency') }}
          </el-button>
        </div>
        <div class="footer-right">
          <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
          <el-button @click="handleSaveOnly">{{ t('terminal.dialog.saveOnly') }}</el-button>
          <el-button type="primary" :loading="connecting" @click="handleSaveAndConnect">
            {{ t('terminal.dialog.saveAndConnect') }}
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
import { t } from '@/i18n'
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
    ElMessage.warning(t('terminal.dialog.enterHostFirst'))
    return
  }
  testingLatency.value = true
  latencyResult.value = null
  try {
    const ms = await terminalStore.testLatency(form.host, form.port || 22)
    latencyResult.value = ms
    ElMessage.success(t('terminal.dialog.testSuccess', { ms }))
  } catch (err: any) {
    ElMessage.error(t('terminal.dialog.testFailed', { error: err.message || 'timeout' }))
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
  ElMessage.success(t('terminal.dialog.saveSuccess'))
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
