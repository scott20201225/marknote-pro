let bootstrapped = false

export const bootstrapGitHubDesktop = async(): Promise<void> => {
  if (bootstrapped) return
  bootstrapped = true
  await import('./upstream/src/ui/index')
}
