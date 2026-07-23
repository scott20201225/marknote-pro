export class ProcessProxyConnection {}

export const createProxyProcessServer = () => ({
  listen: (_port: number, _host: string, callback: () => void) => callback(),
  address: () => ({ port: 0 }),
  close: () => undefined,
})
