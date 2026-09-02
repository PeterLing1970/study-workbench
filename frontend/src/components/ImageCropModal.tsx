import { Check, Crop, RotateCcw, X } from 'lucide-react'
import { type PointerEvent, useEffect, useRef, useState } from 'react'

interface ImageCropModalProps {
  file: File
  onCancel: () => void
  onConfirm: (file: File) => void
}

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

const MIN_CROP_SIZE = 18

export function ImageCropModal({ file, onCancel, onConfirm }: ImageCropModalProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [cropRects, setCropRects] = useState<CropRect[]>([])
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pointInStage = (clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage) return null
    const bounds = stage.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(bounds.width, clientX - bounds.left)),
      y: Math.max(0, Math.min(bounds.height, clientY - bounds.top)),
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const point = pointInStage(event.clientX, event.clientY)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = point
    setCropRects((current) => [...current, { x: point.x, y: point.y, width: 0, height: 0 }])
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    const point = pointInStage(event.clientX, event.clientY)
    if (!start || !point) return
    setCropRects((current) => {
      if (!current.length) return current
      const next = [...current]
      next[next.length - 1] = {
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      }
      return next
    })
  }

  const handlePointerUp = () => {
    dragStartRef.current = null
  }

  const resetCrop = () => setCropRects([])

  const confirmCrop = () => {
    const image = imageRef.current
    const stage = stageRef.current
    const validRects = cropRects.filter((rect) => rect.width >= MIN_CROP_SIZE && rect.height >= MIN_CROP_SIZE)
    if (!image || !stage || !validRects.length) return

    const stageBounds = stage.getBoundingClientRect()
    const scaleX = image.naturalWidth / stageBounds.width
    const scaleY = image.naturalHeight / stageBounds.height
    const outputRects = validRects.map((rect) => ({
      x: Math.round(rect.x * scaleX),
      y: Math.round(rect.y * scaleY),
      width: Math.max(1, Math.round(rect.width * scaleX)),
      height: Math.max(1, Math.round(rect.height * scaleY)),
    }))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(...outputRects.map((rect) => rect.width))
    canvas.height = outputRects.reduce((total, rect) => total + rect.height, 0)
    const context = canvas.getContext('2d')
    if (!context) return
    let offsetY = 0
    for (const rect of outputRects) {
      context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, offsetY, rect.width, rect.height)
      offsetY += rect.height
    }
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    canvas.toBlob((blob) => {
      if (!blob) return
      const extension = outputType === 'image/png' ? 'png' : 'jpg'
      const name = file.name.replace(/\.[^.]+$/, '') || 'wrong-question'
      onConfirm(new File([blob], `${name}-选区.${extension}`, { type: outputType }))
    }, outputType, 0.95)
  }

  const canConfirm = cropRects.some((rect) => rect.width >= MIN_CROP_SIZE && rect.height >= MIN_CROP_SIZE)

  return (
    <div className="modal-overlay crop-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="crop-modal-title">
      <section className="modal-sheet crop-modal-sheet">
        <button className="icon-button modal-close" type="button" onClick={onCancel} aria-label="取消裁剪">
          <X aria-hidden="true" />
        </button>
        <div className="crop-modal-heading">
          <span className="crop-modal-icon"><Crop size={20} aria-hidden="true" /></span>
          <div>
            <h2 id="crop-modal-title">框选要整理的题目</h2>
            <p className="modal-subtitle">可连续框选多个区域（例如第 5 题分在左右两栏），系统会按框选顺序拼接后交给 AI 识别。</p>
          </div>
        </div>

        <div
          ref={stageRef}
          className="crop-stage"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="application"
          aria-label="图片裁剪区域，拖动鼠标或手指框选题目"
        >
          {previewUrl ? <img ref={imageRef} src={previewUrl} alt="待框选的错题原图" draggable={false} /> : null}
          {cropRects.map((rect, index) => rect.width >= MIN_CROP_SIZE && rect.height >= MIN_CROP_SIZE ? (
            <div key={`${rect.x}-${rect.y}-${index}`} className="crop-selection" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
              <span>区域 {index + 1}</span>
            </div>
          ) : null)}
          {!cropRects.length ? <div className="crop-stage-hint">拖动框选第一个区域；跨栏题目可继续框选第二个区域</div> : null}
        </div>

        <div className="crop-modal-actions">
          <button type="button" className="btn-cancel" onClick={resetCrop} disabled={!cropRects.length}>
            <RotateCcw size={15} /> 重选区域
          </button>
          <button type="button" className="modal-submit" onClick={confirmCrop} disabled={!canConfirm}>
            <Check size={16} /> 识别选中题目
          </button>
        </div>
        <button type="button" className="crop-use-original" onClick={() => onConfirm(file)}>
          不裁剪，直接识别整张图片
        </button>
      </section>
    </div>
  )
}
