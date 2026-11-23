export const KDBX_SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?~'

export const KDBX_PASSWORD_PATTERN =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{}|;:,.<>?~])[A-Za-z\d!@#$%^&*()_+\-=[\]{}|;:,.<>?~]{8,16}$/

export const isKdbxPasswordValid = (value: string): boolean => KDBX_PASSWORD_PATTERN.test(value)
