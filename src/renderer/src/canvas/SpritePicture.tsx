// A sprite from the SpriteBuilder library on the board, shown live from the library (or from the
// board's copy if the library's isn't there), drawn pixel-sharp. An animated one shows its first
// frame; play and pause buttons appear when the pointer is over it.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ImageItem } from '@shared/types'
import { Icon } from '@/app/Icon'
import { useSprites } from '@/app/spriteLibrary'
import { projectFrames } from '@/board/sprites'
import { useBoard } from '@/board/store'
import { imageUrl } from './images'
import { spriteUrl } from './sprites'

interface Frame {
  image: ImageBitmap
  duration: number
}

/** A sprite's frames: a Pixel Studio project's (its layers combined), or an animated picture's own. */
async function loadFrames(item: ImageItem, url: string): Promise<Frame[]> {
  const board = useBoard.getState().board?.path ?? ''
  const project = await window.api.spriteProject(item.sprite!.path, board, item.src)
  if (project) {
    const { width, height, frames } = projectFrames(project)
    return Promise.all(frames.map(async (f) => ({ image: await createImageBitmap(new ImageData(f.pixels, width, height)), duration: f.duration })))
  }
  // An animated GIF, PNG or WebP: each frame as the picture decodes it.
  const bytes = await (await fetch(url)).arrayBuffer()
  const type = url.toLowerCase().includes('.gif') ? 'image/gif' : url.toLowerCase().includes('.webp') ? 'image/webp' : 'image/png'
  const decoder = new ImageDecoder({ data: bytes, type })
  await decoder.tracks.ready
  const count = decoder.tracks.selectedTrack?.frameCount ?? 1
  const frames: Frame[] = []
  for (let frameIndex = 0; frameIndex < count; frameIndex++) {
    const { image } = await decoder.decode({ frameIndex })
    frames.push({ image: await createImageBitmap(image), duration: (image.duration ?? 100_000) / 1000 })
    image.close()
  }
  decoder.close()
  return frames
}

export function SpritePicture({ item }: { item: ImageItem }) {
  const link = item.sprite!
  const live = useSprites((s) => s.byPath.get(link.path))
  // From the library while it's there (its change time makes a redraw show), or else the board's copy.
  const url = live ? spriteUrl(link.path, live.modified) : imageUrl(item.src)
  const frames = live?.frames ?? link.frames ?? 1
  const [missing, setMissing] = useState(false)
  useEffect(() => setMissing(false), [url])
  if (missing) return <div className="image-missing">Sprite missing: {item.name}</div>
  if (frames > 1) return <AnimatedSprite item={item} url={url} onFail={() => setMissing(true)} />
  return <img className="item-picture pixelated" src={url} alt={item.name} draggable={false} onError={() => setMissing(true)} />
}

/** An animated sprite: its first frame, until it's played. Pausing stops on the frame showing. */
function AnimatedSprite({ item, url, onFail }: { item: ImageItem; url: string; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [frames, setFrames] = useState<Frame[] | null>(null)
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)

  // (Again whenever the sprite changes in the library.)
  useEffect(() => {
    let stale = false
    loadFrames(item, url).then(
      (loaded) => !stale && (setFrames(loaded), setAt((k) => (k < loaded.length ? k : 0))),
      () => !stale && setFrames(null)
    )
    return () => {
      stale = true
    }
  }, [url])

  useLayoutEffect(() => {
    const el = canvas.current
    const frame = frames?.[at]
    if (!el || !frame) return
    el.width = frame.image.width
    el.height = frame.image.height
    const g = el.getContext('2d')!
    g.clearRect(0, 0, el.width, el.height)
    g.drawImage(frame.image, 0, 0)
  }, [frames, at])

  useEffect(() => {
    if (!playing || !frames || frames.length < 2) return
    const timer = setTimeout(() => setAt((k) => (k + 1) % frames.length), frames[at].duration)
    return () => clearTimeout(timer)
  }, [playing, frames, at])

  // Frames that can't be read: the picture still shows (its first frame), without play.
  if (!frames) return <img className="item-picture pixelated" src={url} alt={item.name} draggable={false} onError={onFail} />
  return (
    <>
      <canvas ref={canvas} className="item-picture pixelated" aria-label={item.name} />
      <button
        className="sprite-play"
        data-sprite-play
        title={playing ? 'Pause' : 'Play'}
        // The button's own: not a press on the board (no selecting or dragging).
        onPointerDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setPlaying(!playing)
        }}
      >
        <Icon name={playing ? 'pause' : 'play'} size={14} />
      </button>
    </>
  )
}
