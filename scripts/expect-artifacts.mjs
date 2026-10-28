import fs from 'node:fs'

const expected = {
  windows: ['Wangzi-0.3.0-win-x64.exe', 'Wangzi-0.3.0-win-x64.msi'],
  macos: ['Wangzi-0.3.0-mac-x64.dmg', 'Wangzi-0.3.0-mac-arm64.dmg'],
  linux: ['Wangzi-0.3.0-linux-x86_64.AppImage', 'Wangzi-0.3.0-linux-amd64.deb'],
}

const target = process.argv[2]
const names = expected[target]
if (!names) {
  console.error(`unknown target: ${target}`)
  process.exit(1)
}

const found = fs.readdirSync('release')
console.log(found.join('\n'))
const missing = names.filter((name) => !found.includes(name))
if (missing.length > 0) {
  console.error(`missing: ${missing.join(', ')}`)
  process.exit(1)
}
