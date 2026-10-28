import fs from 'node:fs'
import zlib from 'node:zlib'

const size = 1024
const pixels = Buffer.alloc(size * size * 4)
for (let i = 0; i < pixels.length; i += 4) {
  pixels[i] = 0x07
  pixels[i + 1] = 0x07
  pixels[i + 2] = 0x07
  pixels[i + 3] = 0xff
}

const gold = [0xd4, 0xaf, 0x37, 0xff]
const center = size / 2

function setPixel(x, y) {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const offset = (y * size + x) * 4
  pixels[offset] = gold[0]
  pixels[offset + 1] = gold[1]
  pixels[offset + 2] = gold[2]
  pixels[offset + 3] = gold[3]
}

function fillRect(x, y, width, height) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) setPixel(col, row)
  }
}

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const dx = x - center + 0.5
    const dy = y - center + 0.5
    const distance = Math.hypot(dx, dy)
    if (Math.abs(distance - 390) < 7 || Math.abs(distance - 332) < 2) setPixel(x, y)
  }
}

fillRect(96, 96, 832, 3)
fillRect(96, 925, 832, 3)
fillRect(96, 96, 3, 832)
fillRect(925, 96, 3, 832)

const bar = 34
const left = 372
const width = 280
fillRect(left, 392, width, bar)
fillRect(left, 496, width, bar)
fillRect(left, 620, width, bar)
fillRect(494, 392, bar, 262)

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(size, 0)
ihdr.writeUInt32BE(size, 4)
ihdr[8] = 8
ihdr[9] = 6
const raw = Buffer.alloc((size * 4 + 1) * size)
for (let y = 0; y < size; y += 1) {
  const start = y * (size * 4 + 1)
  raw[start] = 0
  pixels.copy(raw, start + 1, y * size * 4, (y + 1) * size * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

fs.mkdirSync('build', { recursive: true })
fs.mkdirSync('public', { recursive: true })
fs.writeFileSync('build/icon.png', png)
fs.writeFileSync('public/icon.png', png)
console.log(`wrote ${png.length} bytes`)
