export const KDBX_PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{8,16}$/

export const isKdbxPasswordValid = (value: string): boolean => KDBX_PASSWORD_PATTERN.test(value)
