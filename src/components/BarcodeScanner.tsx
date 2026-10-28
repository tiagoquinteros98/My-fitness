import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'

interface Props {
  onDetected: (code: string) => void
  onClose: () => void
}

// Native detector (Chrome on Android, backed by the system's ML Kit): much faster and better in
// low light than decoding in JS. Not in TypeScript's DOM types yet.
interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
}
interface BarcodeDetectorClass {
  new (options: { formats: string[] }): BarcodeDetectorInstance
  getSupportedFormats(): Promise<string[]>
}

// Camera extras some phones expose (torch, zoom, focus); also missing from the DOM types.
type ExtraCapabilities = MediaTrackCapabilities & {
  torch?: boolean
  zoom?: { min: number; max: number }
  focusMode?: string[]
}
type ExtraConstraint = MediaTrackConstraintSet & { torch?: boolean; zoom?: number; focusMode?: string }

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']
/** Accept a code only after reading the same value this many times in a row. */
const CONFIRMATIONS = 2
const HINT_AFTER_MS = 8000

async function nativeDetector(): Promise<BarcodeDetectorInstance | undefined> {
  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorClass }).BarcodeDetector
  if (!Detector) return undefined
  try {
    const formats = (await Detector.getSupportedFormats()).filter((f) => NATIVE_FORMATS.includes(f))
    return formats.includes('ean_13') ? new Detector({ formats }) : undefined
  } catch {
    return undefined
  }
}

function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 1500
    gain.gain.value = 0.08
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.09)
    osc.onended = () => void ctx.close()
  } catch {
    // No audio available: the vibration and the green frame are enough.
  }
}

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [found, setFound] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [torch, setTorch] = useState<boolean | undefined>(undefined) // undefined = not supported
  const [zoom, setZoom] = useState<{ on: boolean; value: number } | undefined>(undefined)
  const detectedRef = useRef(onDetected)
  useEffect(() => {
    detectedRef.current = onDetected
  })

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | undefined
    let zxing: IScannerControls | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = ''
    let streak = 0
    let done = false

    // Counts consecutive identical reads; fires once the code is confirmed.
    const onRead = (code: string) => {
      if (done) return
      streak = code === last ? streak + 1 : 1
      last = code
      if (streak < CONFIRMATIONS) return
      done = true
      zxing?.stop()
      navigator.vibrate?.(80)
      beep()
      setFound(code)
      setTimeout(() => detectedRef.current(code), 250)
    }

    async function start() {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      if (cancelled) return
      const video = videoRef.current!
      video.srcObject = stream
      await video.play().catch(() => {})

      const track = stream.getVideoTracks()[0]
      trackRef.current = track
      const caps = (track.getCapabilities?.() ?? {}) as ExtraCapabilities
      if (caps.focusMode?.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as ExtraConstraint] }).catch(() => {})
      }
      if (caps.torch) setTorch(false)
      if (caps.zoom && caps.zoom.max >= 1.5) setZoom({ on: false, value: Math.min(2, caps.zoom.max) })

      const detector = await nativeDetector()
      if (detector) {
        const loop = async () => {
          if (cancelled || done) return
          if (video.readyState >= 2) {
            try {
              const codes = await detector.detect(video)
              if (codes[0]?.rawValue) onRead(codes[0].rawValue)
              else streak = 0
            } catch {
              // Frame not ready; try the next one.
            }
          }
          timer = setTimeout(loop, 80)
        }
        void loop()
      } else {
        // JS fallback (~480 KB), only downloaded on browsers without the native detector.
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ])
        if (cancelled) return
        const hints = new Map<number, unknown>([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128],
          ],
          [DecodeHintType.TRY_HARDER, true],
        ])
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 })
        zxing = await reader.decodeFromStream(stream, video, (result) => {
          if (result) onRead(result.getText())
        })
        if (cancelled) zxing.stop()
      }
    }

    start().catch((e: unknown) => {
      if (cancelled) return
      const name = e instanceof Error ? e.name : ''
      setError(
        name === 'NotAllowedError'
          ? 'Permiso de cámara denegado. Habilitalo en el navegador o ingresá el código a mano.'
          : 'No se pudo acceder a la cámara. Ingresá el código a mano.',
      )
    })
    const hintTimer = setTimeout(() => setShowHint(true), HINT_AFTER_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      clearTimeout(hintTimer)
      zxing?.stop()
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function toggleTorch() {
    if (torch === undefined) return
    const on = !torch
    trackRef.current
      ?.applyConstraints({ advanced: [{ torch: on } as ExtraConstraint] })
      .then(() => setTorch(on))
      .catch(() => setTorch(undefined))
  }

  function toggleZoom() {
    if (!zoom) return
    const on = !zoom.on
    trackRef.current
      ?.applyConstraints({ advanced: [{ zoom: on ? zoom.value : 1 } as ExtraConstraint] })
      .then(() => setZoom({ ...zoom, on }))
      .catch(() => setZoom(undefined))
  }

  return (
    <div className="scanner">
      <div className="scanner-header">
        <button className="link" onClick={onClose}>
          Cancelar
        </button>
        <span>Escanear código de barras</span>
        <span style={{ width: 64 }} />
      </div>

      <div className="scanner-view">
        <video ref={videoRef} muted playsInline autoPlay />
        {!error && <div className={`scanner-frame${found ? ' found' : ''}`} />}
        {!error && (
          <p className="scanner-hint">
            {found
              ? found
              : showHint
                ? 'Probá con más luz, alejando un poco el celular o con el zoom'
                : 'Centrá el código de barras en el recuadro'}
          </p>
        )}
        {error && <p className="scanner-error">{error}</p>}
        {!error && (torch !== undefined || zoom) && (
          <div className="scanner-tools">
            {torch !== undefined && (
              <button className={`scanner-tool${torch ? ' on' : ''}`} onClick={toggleTorch} aria-pressed={torch}>
                <FlashIcon /> Flash
              </button>
            )}
            {zoom && (
              <button className={`scanner-tool${zoom.on ? ' on' : ''}`} onClick={toggleZoom} aria-pressed={zoom.on}>
                Zoom {zoom.value}x
              </button>
            )}
          </div>
        )}
      </div>

      <form
        className="scanner-manual"
        onSubmit={(e) => {
          e.preventDefault()
          const code = manual.replace(/\D/g, '')
          if (code) onDetected(code)
        }}
      >
        <input
          inputMode="numeric"
          placeholder="O escribí el código"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <button className="btn" type="submit" disabled={!manual.trim()}>
          Buscar
        </button>
      </form>
    </div>
  )
}

function FlashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </svg>
  )
}
