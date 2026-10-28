import fs from 'node:fs'

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
const expected = {
  windows: [`Wangzi-${version}-win-x64.exe`, `Wangzi-${version}-win-x64.msi`],
  macos: [`Wangzi-${version}-mac-x64.dmg`, `Wangzi-${version}-mac-arm64.dmg`],
  linux: [`Wangzi-${version}-linux-x86_64.AppImage`, `Wangzi-${version}-linux-amd64.deb`],
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
