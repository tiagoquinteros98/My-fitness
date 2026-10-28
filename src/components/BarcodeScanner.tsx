import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'

interface Props {
  onDetected: (code: string) => void
  onClose: () => void
}

const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
]

export default function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const detectedRef = useRef(onDetected)
  useEffect(() => {
    detectedRef.current = onDetected
  })

  useEffect(() => {
    const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, FORMATS]])
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 })
    let controls: IScannerControls | undefined
    let cancelled = false
    let done = false

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current!,
        (result, _err, ctrl) => {
          if (result && !done) {
            done = true
            ctrl.stop()
            navigator.vibrate?.(80)
            detectedRef.current(result.getText())
          }
        },
      )
      .then((c) => {
        controls = c
        if (cancelled) c.stop()
      })
      .catch((e: unknown) => {
        const name = e instanceof Error ? e.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Habilitalo en el navegador o ingresá el código a mano.'
            : 'No se pudo acceder a la cámara. Ingresá el código a mano.',
        )
      })

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [])

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
        <video ref={videoRef} muted playsInline />
        {!error && <div className="scanner-frame" />}
        {error && <p className="scanner-error">{error}</p>}
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
