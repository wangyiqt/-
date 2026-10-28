import fs from 'node:fs'
import path from 'node:path'

const source = path.resolve('build/icon.png')
if (!fs.existsSync(source)) {
  console.error('missing build/icon.png')
  process.exit(1)
}
fs.mkdirSync('dist', { recursive: true })
fs.copyFileSync(source, path.join('dist', 'icon.png'))
fs.mkdirSync('public', { recursive: true })
fs.copyFileSync(source, path.join('public', 'icon.png'))
