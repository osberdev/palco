<script setup lang="ts">
import { CAMERA_UNAVAILABLE_MESSAGE, shouldSendScan, zxingLocateFile, type SeenScan } from '../../utils/gate-scan'

interface Props {
  /** While a scan is being validated, the camera does not send another one. */
  busy: boolean
}

const { busy } = defineProps<Props>()

const emit = defineEmits<{
  /** The text of a scanned QR, already filtered by the 3 s window. */
  scan: [text: string]
  /** The camera is denied, missing or without the reader; the page moves focus to the code field. */
  unavailable: []
}>()

/** How often a frame is inspected: zxing-wasm takes less than 10 ms. */
const FRAME_INTERVAL_MS = 200

const state = ref<'starting' | 'live' | 'blocked'>('starting')
const video = useTemplateRef<HTMLVideoElement>('video')

let stream: MediaStream | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let stopped = false
let previous: SeenScan | null = null

function block(): void {
  if (stopped) return
  state.value = 'blocked'
  stop()
  emit('unavailable')
}

function stop(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
  for (const track of stream?.getTracks() ?? []) track.stop()
  stream = null
}

onMounted(async () => {
  // Outside a secure context (the network IP, not `localhost`) there is no camera.
  if (!navigator.mediaDevices?.getUserMedia) return block()

  let read: (image: ImageData) => Promise<readonly { readonly text: string, readonly isValid: boolean }[]>
  try {
    // Only this page loads the reader, and its WASM ships with PALCO: without
    // `locateFile`, zxing-wasm would fetch it from jsDelivr.
    const [reader, { default: wasmUrl }] = await Promise.all([
      import('zxing-wasm/reader'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ])
    reader.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => zxingLocateFile(path, prefix, wasmUrl) } })
    read = (image) => reader.readBarcodes(image, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 })

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  }
  catch {
    // Denied (`NotAllowedError`), no camera (`NotFoundError`) or busy.
    return block()
  }
  // The gate was closed while the browser was asking.
  if (stopped || !video.value) return stop()

  video.value.srcObject = stream
  await video.value.play().catch(() => undefined)
  state.value = 'live'

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return block()

  const tick = async (): Promise<void> => {
    const element = video.value
    if (stopped || !element) return
    if (!busy && element.videoWidth > 0) {
      canvas.width = element.videoWidth
      canvas.height = element.videoHeight
      context.drawImage(element, 0, 0)
      try {
        const [found] = await read(context.getImageData(0, 0, canvas.width, canvas.height))
        if (found?.isValid) {
          const at = performance.now()
          if (shouldSendScan(found.text, at, previous)) emit('scan', found.text)
          previous = { text: found.text, at }
        }
      }
      catch {
        // A frame that could not be read does not stop the camera.
      }
    }
    if (!stopped) timer = setTimeout(() => void tick(), FRAME_INTERVAL_MS)
  }
  void tick()
})

onBeforeUnmount(() => {
  stopped = true
  stop()
})
</script>

<template>
  <!-- Without a camera, the notice replaces the viewfinder. -->
  <div v-if="state === 'blocked'" class="camera blocked">
    <BaseAlert variant="error">{{ CAMERA_UNAVAILABLE_MESSAGE }}</BaseAlert>
  </div>
  <div v-else class="camera live" role="group" aria-label="Cámara de la taquilla">
    <video ref="video" muted playsinline aria-hidden="true" />
    <div class="frame" aria-hidden="true">
      <span class="corner top-left" />
      <span class="corner top-right" />
      <span class="corner bottom-left" />
      <span class="corner bottom-right" />
    </div>
    <span class="caption">{{ state === 'live' ? 'Acerca el QR del boleto' : 'Encendiendo la cámara…' }}</span>
  </div>
</template>

<style scoped>
.camera {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--r-md);
  overflow: hidden;
}

.live {
  background: var(--ink-900);
}

.blocked {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-5);
  background: var(--white);
  border: var(--border);
}

.blocked > * {
  width: 100%;
}

video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* The frame's four corners, at 52 % of the width and slightly above center. */
.frame {
  position: absolute;
  left: 50%;
  top: 44%;
  width: 52%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
}

.corner {
  position: absolute;
  width: 28px;
  height: 28px;
  border: 0 solid var(--ink-50);
}

.top-left {
  top: 0;
  left: 0;
  border-top-width: 3px;
  border-left-width: 3px;
}

.top-right {
  top: 0;
  right: 0;
  border-top-width: 3px;
  border-right-width: 3px;
}

.bottom-left {
  bottom: 0;
  left: 0;
  border-bottom-width: 3px;
  border-left-width: 3px;
}

.bottom-right {
  right: 0;
  bottom: 0;
  border-right-width: 3px;
  border-bottom-width: 3px;
}

.caption {
  position: absolute;
  right: 0;
  bottom: calc(var(--sp-4) + var(--sp-1));
  left: 0;
  text-align: center;
  font: 500 var(--fs-15) var(--font-sans);
  color: var(--ink-50);
}
</style>
