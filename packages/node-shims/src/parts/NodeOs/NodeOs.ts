export const createNodeOs = () => ({
  arch: (): string => 'x64',
  EOL: '\n',
  homedir: (): string => '/',
  platform: (): string => 'browser',
  tmpdir: (): string => '/tmp',
})
