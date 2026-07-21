export type DesktopNotificationPermission = 'default' | 'granted' | 'denied'

export type NotificationCallback<
  T extends Record<string, any> = Record<string, any>
> = (event: string, id: string, userInfo: T) => void

export const initializeNotifications = () => undefined
export const terminateNotifications = () => undefined
export const closeNotification = () => undefined
export const supportsNotifications = () => false
export const supportsNotificationsPermissionRequest = () => false
export const getNotificationSettingsUrl = () => undefined
export const getNotificationsPermission = async(): Promise<DesktopNotificationPermission> => 'default'
export const requestNotificationsPermission = async(): Promise<boolean> => false
export const showNotification = async(): Promise<string | null> => null
export const onNotificationEvent = () => undefined
