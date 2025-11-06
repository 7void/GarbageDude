// Web Serial utility to connect to an Arduino and stream text lines like "FILL:72.5"

export interface SerialController {
  disconnect: () => Promise<void>
  isConnected: () => boolean
}

export async function connectSerial(
  onFill: (valuePercent: number) => void,
  options?: {
    baudRate?: number
    dataBits?: 7 | 8
    stopBits?: 1 | 2
    parity?: 'none' | 'even' | 'odd'
    flowControl?: 'none' | 'hardware'
    toggleDTR?: boolean
  }
): Promise<SerialController> {
  if (typeof navigator === 'undefined' || !('serial' in navigator)) {
    throw new Error('Web Serial API not supported in this browser. Use a Chromium-based browser (e.g., Chrome/Edge) over HTTPS.')
  }

  // serial is experimental but present in Chromium browsers
  const port: any = await (navigator as any).serial.requestPort()
  try {
    await port.open({
      baudRate: options?.baudRate ?? 9600,
      dataBits: options?.dataBits ?? 8,
      stopBits: options?.stopBits ?? 1,
      parity: options?.parity ?? 'none',
      flowControl: options?.flowControl ?? 'none',
    })
  } catch (err: any) {
    // Surface a clearer error to caller
    const msg = err?.message || String(err)
    throw new Error(`Failed to open serial port: ${msg}`)
  }

  // Some boards need DTR/RTS toggling to start streaming
  if (options?.toggleDTR && typeof port.setSignals === 'function') {
    try {
      await port.setSignals({ dataTerminalReady: false, requestToSend: false })
      await new Promise(r => setTimeout(r, 200))
      await port.setSignals({ dataTerminalReady: true, requestToSend: true })
    } catch {}
  }

  // Setup text decoding pipeline
  const textDecoder = new (window as any).TextDecoderStream()
  const readableStreamClosed = (port.readable as ReadableStream).pipeTo(textDecoder.writable)
  const reader: any = textDecoder.readable.getReader()

  let closed = false

  // Background read loop
  ;(async () => {
    let buffer = ''
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          buffer += value
          let idx
          while ((idx = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, idx).trim()
            buffer = buffer.slice(idx + 1)
            // Parse line like FILL:72.5 (allow CR)
            const m = /FILL:\s*([0-9]+(?:\.[0-9]+)?)/i.exec(line.replace(/\r/g, ''))
            if (m) {
              const pct = parseFloat(m[1])
              if (!Number.isNaN(pct)) {
                onFill(Math.max(0, Math.min(100, pct)))
              }
            }
          }
        }
      }
    } catch (err) {
      // Reader was likely canceled on disconnect; ignore
    } finally {
      try { reader.releaseLock() } catch {}
      try { await readableStreamClosed } catch {}
    }
  })()

  return {
    disconnect: async () => {
      if (closed) return
      closed = true
      try { await reader.cancel() } catch {}
      try { await (port as any).close() } catch {}
    },
    isConnected: () => !closed,
  }
}
