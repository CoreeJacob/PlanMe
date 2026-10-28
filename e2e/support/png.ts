// Small PNG pictures made in code, so tests don't need picture files kept around.

import { deflateSync } from 'node:zlib'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

/** A plain RGB PNG of one colour (big ones compress to almost nothing). */
export function solidPng(width: number, height: number, [r, g, b]: [number, number, number] = [80, 140, 220]): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8 bits per channel, RGB, no interlace
  const row = Buffer.alloc(width * 3 + 1)
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3)
  const rows = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', new Uint8Array())])
}

/** A PNG file's width and height, read from its header. */
export const pngSize = (bytes: Buffer): { width: number; height: number } => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) })
