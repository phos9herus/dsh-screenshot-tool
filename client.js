window.__ModuleLoader__.load({
  id: 'dsh-screenshot-tool',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** locale namespace and the host capture route (document-relative). */
    const NS = 'screenshot-tool'
    const CAPTURE_ROUTE = 'api/screenshot.capture'

    const EN = {
      'command.label': 'Screenshot',
      'command.description': 'Hide the window, capture the screen, and attach it to this session',
      'hint.select': 'Drag to select the area to capture',
      'hint.edit': 'Draw inside the selected area to annotate it',
      'tool.pen': 'Pen',
      'tool.rect': 'Rectangle',
      'tool.arrow': 'Arrow',
      'tool.mosaic': 'Mosaic',
      'tool.undo': 'Undo',
      'tool.clear': 'Clear',
      'tool.reselect': 'Reselect',
      'action.cancel': 'Cancel',
      'action.use': 'Use image',
      'action.applying': 'Adding…',
      'action.close': 'Close',
      'loading': 'Loading screenshot…',
      'error.decode': 'The screenshot could not be decoded.',
      'error.capture': 'Screenshot failed',
      'error.unavailable': 'The screenshot host route is unavailable.',
      'error.session': 'This session is no longer available.',
      'error.conversation': 'The composer is unavailable for this session.',
      'error.busy': 'The composer is busy; the screenshot was not added.',
      'error.attach': 'The screenshot could not be added to the composer.',
      'warn.notMinimized': 'The DSH window could not be hidden; the capture may include it',
    }

    const ZH = {
      'command.label': '截屏',
      'command.description': '收起窗口，截取屏幕并附加到当前会话',
      'hint.select': '按住鼠标拖动，框选要截取的区域',
      'hint.edit': '在选区内拖动即可标注',
      'tool.pen': '画笔',
      'tool.rect': '矩形',
      'tool.arrow': '箭头',
      'tool.mosaic': '马赛克',
      'tool.undo': '撤销',
      'tool.clear': '清空',
      'tool.reselect': '重新框选',
      'action.cancel': '取消',
      'action.use': '使用图片',
      'action.applying': '正在添加…',
      'action.close': '关闭',
      'loading': '正在加载截图…',
      'error.decode': '截图解码失败。',
      'error.capture': '截屏失败',
      'error.unavailable': '截屏服务不可用。',
      'error.session': '当前会话已不可用。',
      'error.conversation': '当前会话的输入框不可用。',
      'error.busy': '输入框正忙，截图未加入。',
      'error.attach': '截图未能加入输入框。',
      'warn.notMinimized': '未能收起 DSH 窗口，截图中可能包含 DSH 本身',
    }

    const DICTS = { en: EN, zh: ZH }
    const FALLBACK = ZH

    /** One capture at a time: the overlay state shared by the command action and the slot. */
    let snapshot = { phase: 'idle' }
    const subscribers = new Set()
    let captureCounter = 0

    function getSnapshot() {
      return snapshot
    }

    function setSnapshot(next) {
      snapshot = next
      for (const subscriber of [...subscribers]) {
        try {
          subscriber()
        } catch (error) {
          console.error('[screenshot-tool] subscriber failed', error)
        }
      }
    }

    function subscribe(listener) {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    }

    const runtime = { ctx: null, t: (key) => FALLBACK[key] ?? key }

    // ---------------------------------------------------------------- icons

    function Glyph({ size = 16, children }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          'aria-hidden': true,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        children,
      )
    }

    function PenIcon() {
      return h(Glyph, null, h('path', { d: 'M11.2 2.5l2.3 2.3-7.4 7.4-3.1.8.8-3.1z' }))
    }

    function RectIcon() {
      return h(Glyph, null, h('rect', { x: 2.4, y: 3.2, width: 11.2, height: 9.6, rx: 1.4 }))
    }

    function ArrowIcon() {
      return h(Glyph, null, h('path', { d: 'M2.8 13.2L13 3M13 3H7.4M13 3v5.6' }))
    }

    function MosaicIcon() {
      return h(
        Glyph,
        null,
        h('rect', { x: 2.6, y: 2.6, width: 4.6, height: 4.6, rx: 0.8 }),
        h('rect', { x: 8.8, y: 2.6, width: 4.6, height: 4.6, rx: 0.8 }),
        h('rect', { x: 2.6, y: 8.8, width: 4.6, height: 4.6, rx: 0.8 }),
        h('rect', { x: 8.8, y: 8.8, width: 4.6, height: 4.6, rx: 0.8 }),
      )
    }

    function UndoIcon() {
      return h(Glyph, null, h('path', { d: 'M8.4 4.4H5.9a2.9 2.9 0 100 5.8h5.6M7.1 2.5L5 4.4l2.1 1.9' }))
    }

    function ClearIcon() {
      return h(Glyph, null, h('path', { d: 'M2.8 4.4h10.4M6.2 4.4V2.9h3.6v1.5M4.3 4.4l.6 8.5h6.2l.6-8.5' }))
    }

    function CropIcon() {
      return h(Glyph, null, h('path', { d: 'M4.4 2.3v9.3h9.3M2.3 4.4h9.3v9.3' }))
    }

    function CloseIcon() {
      return h(Glyph, null, h('path', { d: 'M3.8 3.8l8.4 8.4M12.2 3.8l-8.4 8.4' }))
    }

    function CommandIcon({ size = 14 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          'aria-hidden': true,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        },
        h('path', { d: 'M1.7 5.1h2.6l1-1.6h5.4l1 1.6h2.6v8.2H1.7z' }),
        h('circle', { cx: 8, cy: 8.9, r: 2.5 }),
      )
    }

    // -------------------------------------------------------------- helpers

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    /** Normalize two points into a positive rectangle. */
    function selectionOf(from, to) {
      return {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        w: Math.abs(from.x - to.x),
        h: Math.abs(from.y - to.y),
      }
    }

    function clampToSelection(point, selection) {
      return {
        x: clamp(point.x, selection.x, selection.x + selection.w),
        y: clamp(point.y, selection.y, selection.y + selection.h),
      }
    }

    function messageOf(error) {
      return error instanceof Error ? error.message : String(error)
    }

    function timestampName() {
      const now = new Date()
      const pad = (value) => String(value).padStart(2, '0')
      return `screenshot-${String(now.getFullYear())}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`
    }

    function useSnapshot() {
      if (typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribe, getSnapshot)
      }
      const [, bump] = React.useState(0)
      React.useEffect(() => subscribe(() => bump((value) => value + 1)), [])
      return getSnapshot()
    }

    // ------------------------------------------------------ annotation paint

    function paintAnnotation(context, annotation, image, scratch) {
      const kind = annotation.kind
      if (kind === 'pen') {
        const points = annotation.points
        if (points.length === 0) return
        context.save()
        context.strokeStyle = annotation.color
        context.lineWidth = annotation.width
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.beginPath()
        context.moveTo(points[0].x, points[0].y)
        for (let index = 1; index < points.length; index += 1) context.lineTo(points[index].x, points[index].y)
        if (points.length === 1) context.lineTo(points[0].x + 0.01, points[0].y)
        context.stroke()
        context.restore()
        return
      }
      if (kind === 'rect') {
        const rect = selectionOf(annotation.from, annotation.to)
        context.save()
        context.strokeStyle = annotation.color
        context.lineWidth = annotation.width
        context.lineJoin = 'round'
        context.strokeRect(rect.x, rect.y, rect.w, rect.h)
        context.restore()
        return
      }
      if (kind === 'arrow') {
        const from = annotation.from
        const to = annotation.to
        context.save()
        context.strokeStyle = annotation.color
        context.lineWidth = annotation.width
        context.lineCap = 'round'
        context.beginPath()
        context.moveTo(from.x, from.y)
        context.lineTo(to.x, to.y)
        context.stroke()
        const angle = Math.atan2(to.y - from.y, to.x - from.x)
        const head = Math.max(10, annotation.width * 4.5)
        context.beginPath()
        context.moveTo(to.x, to.y)
        context.lineTo(to.x - head * Math.cos(angle - 0.42), to.y - head * Math.sin(angle - 0.42))
        context.moveTo(to.x, to.y)
        context.lineTo(to.x - head * Math.cos(angle + 0.42), to.y - head * Math.sin(angle + 0.42))
        context.stroke()
        context.restore()
        return
      }
      if (kind === 'mosaic') {
        const rect = selectionOf(annotation.from, annotation.to)
        if (rect.w < 2 || rect.h < 2) return
        const block = Math.max(6, Math.round(Math.min(rect.w, rect.h) / 16))
        const width = Math.max(1, Math.round(rect.w / block))
        const height = Math.max(1, Math.round(rect.h / block))
        if (scratch.width !== width) scratch.width = width
        if (scratch.height !== height) scratch.height = height
        const scratchContext = scratch.getContext('2d')
        scratchContext.imageSmoothingEnabled = true
        scratchContext.clearRect(0, 0, width, height)
        scratchContext.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, width, height)
        const previousSmoothing = context.imageSmoothingEnabled
        context.imageSmoothingEnabled = false
        context.drawImage(scratch, 0, 0, width, height, rect.x, rect.y, rect.w, rect.h)
        context.imageSmoothingEnabled = previousSmoothing
      }
    }

    // --------------------------------------------------------- the stage UI

    const TOOL_COLORS = ['#ff453a', '#ffd60a', '#32d74b', '#0a84ff']

    const STAGE_STYLE = `
.dsh-shot-root{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:rgba(5,8,14,.78);color:#f5f7fa;font:inherit;outline:none;pointer-events:auto}
.dsh-shot-stage{position:relative;flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;padding:64px 24px 104px;box-sizing:border-box}
.dsh-shot-canvas{display:block;max-width:100%;max-height:100%;border-radius:4px;box-shadow:0 24px 70px rgba(0,0,0,.55);background:#000;cursor:crosshair;touch-action:none;user-select:none}
.dsh-shot-close{position:absolute;top:14px;right:16px;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid rgba(128,128,128,.34);background:var(--dsw-alias-bg-overlay,rgba(24,27,34,.92));color:var(--dsw-alias-label-primary,#f5f7fa);cursor:pointer}
.dsh-shot-close:hover{background:rgba(128,128,128,.16)}
.dsh-shot-chip{position:absolute;top:16px;left:50%;transform:translateX(-50%);max-width:min(640px,calc(100% - 120px));padding:8px 14px;border-radius:999px;background:var(--dsw-alias-bg-overlay,rgba(24,27,34,.92));border:1px solid rgba(128,128,128,.34);color:var(--dsw-alias-label-primary,#f5f7fa);font-size:13px;line-height:1.4;text-align:center;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.dsh-shot-bar{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:14px;background:var(--dsw-alias-bg-overlay,rgba(22,25,32,.96));border:1px solid rgba(128,128,128,.34);box-shadow:0 18px 48px rgba(0,0,0,.45);backdrop-filter:blur(12px);color:var(--dsw-alias-label-primary,#f5f7fa);max-width:calc(100% - 32px);flex-wrap:wrap;justify-content:center}
.dsh-shot-button{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:0;background:transparent;color:inherit;cursor:pointer;padding:0}
.dsh-shot-button:hover:not(:disabled){background:rgba(128,128,128,.16)}
.dsh-shot-button:disabled{opacity:.38;cursor:default}
.dsh-shot-button.is-active{background:rgba(128,128,128,.2);box-shadow:inset 0 0 0 1.5px var(--dsw-alias-label-primary,#f5f7fa)}
.dsh-shot-color{width:18px;height:18px;margin:0 2px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
.dsh-shot-color.is-active{border-color:var(--dsw-alias-label-primary,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.35)}
.dsh-shot-sep{width:1px;height:20px;background:rgba(128,128,128,.34);margin:0 4px}
.dsh-shot-spacer{flex:1 1 auto;min-width:8px}
.dsh-shot-size{font-size:12px;color:var(--dsw-alias-label-secondary,#aeb4c0);font-variant-numeric:tabular-nums;white-space:nowrap;padding:0 4px}
.dsh-shot-text{height:32px;padding:0 12px;border-radius:8px;border:1px solid rgba(128,128,128,.42);background:transparent;color:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.dsh-shot-text:hover:not(:disabled){background:rgba(128,128,128,.16)}
.dsh-shot-text:disabled{opacity:.5;cursor:default}
.dsh-shot-primary{height:32px;padding:0 16px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:#4d6bfe;color:#ffffff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.dsh-shot-primary:hover:not(:disabled){background:#3f5cf0}
.dsh-shot-primary:disabled{background:#4d6bfe;color:#ffffff;opacity:.55;cursor:default}
.dsh-shot-text:focus-visible,.dsh-shot-primary:focus-visible,.dsh-shot-button:focus-visible{outline:2px solid var(--dsw-alias-label-primary,#f5f7fa);outline-offset:2px}
.dsh-shot-error{position:absolute;left:50%;bottom:82px;transform:translateX(-50%);max-width:min(560px,calc(100% - 64px));padding:8px 12px;border-radius:10px;background:var(--dsw-alias-bg-overlay,rgba(28,20,22,.96));border:1px solid var(--dsw-alias-state-error-primary,#ff453a);color:var(--dsw-alias-label-primary,#f5f7fa);font-size:12px;line-height:1.45;text-align:center}
.dsh-shot-status{display:flex;align-items:center;justify-content:center;height:100%;color:#c9cedb;font-size:13px}
`

    function ToolButton({ label, active, disabled, onClick, children }) {
      return h(
        'button',
        {
          type: 'button',
          className: `dsh-shot-button${active ? ' is-active' : ''}`,
          title: label,
          'aria-label': label,
          'aria-pressed': active ? 'true' : undefined,
          disabled,
          onClick,
          onMouseDown: (event) => event.preventDefault(),
        },
        children,
      )
    }

    function CaptureStage({ capture }) {
      const t = runtime.t
      const [image, setImage] = React.useState(null)
      const [loadError, setLoadError] = React.useState(null)
      const [phase, setPhase] = React.useState('select')
      const [selection, setSelection] = React.useState(null)
      const [annotations, setAnnotations] = React.useState([])
      const [tool, setTool] = React.useState('pen')
      const [color, setColor] = React.useState(TOOL_COLORS[0])
      const [draft, setDraft] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [error, setError] = React.useState(null)
      const rootRef = React.useRef(null)
      const canvasRef = React.useRef(null)
      const scratchRef = React.useRef(null)

      React.useEffect(() => {
        let cancelled = false
        const nextImage = new Image()
        nextImage.onload = () => {
          if (!cancelled) setImage(nextImage)
        }
        nextImage.onerror = () => {
          if (!cancelled) setLoadError(t('error.decode'))
        }
        nextImage.src = capture.url
        return () => {
          cancelled = true
        }
      }, [capture.url])

      React.useEffect(() => {
        const root = rootRef.current
        if (root !== null) root.focus({ preventScroll: true })
      }, [])

      // Repaint the full natural-size canvas from the image, the current
      // selection, and the annotation list.
      React.useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || !image) return
        const width = image.naturalWidth
        const height = image.naturalHeight
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) return
        context.clearRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        const activeSelection =
          phase === 'select'
            ? draft !== null && draft.kind === 'select'
              ? selectionOf(draft.from, draft.to)
              : null
            : selection
        if (activeSelection === null) return
        if (activeSelection.w < 1 || activeSelection.h < 1) return
        if (phase === 'edit' || (draft !== null && draft.kind === 'select')) {
          context.save()
          context.fillStyle = 'rgba(0,0,0,.5)'
          context.fillRect(0, 0, width, height)
          context.restore()
          context.drawImage(
            image,
            activeSelection.x,
            activeSelection.y,
            activeSelection.w,
            activeSelection.h,
            activeSelection.x,
            activeSelection.y,
            activeSelection.w,
            activeSelection.h,
          )
        }
        context.save()
        context.strokeStyle = 'rgba(255,255,255,.94)'
        context.lineWidth = Math.max(2, width / 900)
        context.strokeRect(activeSelection.x, activeSelection.y, activeSelection.w, activeSelection.h)
        context.restore()
        if (phase === 'edit') {
          context.save()
          context.beginPath()
          context.rect(activeSelection.x, activeSelection.y, activeSelection.w, activeSelection.h)
          context.clip()
          for (const annotation of annotations) paintAnnotation(context, annotation, image, ensureScratch())
          if (draft !== null && draft.kind !== 'select') paintAnnotation(context, draft, image, ensureScratch())
          context.restore()
        }
      }, [image, phase, selection, annotations, draft])

      function ensureScratch() {
        let scratch = scratchRef.current
        if (scratch === null) {
          scratch = document.createElement('canvas')
          scratchRef.current = scratch
        }
        return scratch
      }

      function pointOf(event) {
        const canvas = canvasRef.current
        if (!canvas || !image) return null
        const rect = canvas.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return null
        return {
          x: clamp(((event.clientX - rect.left) / rect.width) * image.naturalWidth, 0, image.naturalWidth),
          y: clamp(((event.clientY - rect.top) / rect.height) * image.naturalHeight, 0, image.naturalHeight),
        }
      }

      function onPointerDown(event) {
        if (saving || event.button !== 0) return
        const point = pointOf(event)
        if (point === null) return
        if (phase === 'select') {
          event.currentTarget.setPointerCapture?.(event.pointerId)
          setError(null)
          setDraft({ kind: 'select', from: point, to: point })
          return
        }
        if (selection === null) return
        const start = clampToSelection(point, selection)
        event.currentTarget.setPointerCapture?.(event.pointerId)
        const width = Math.max(2, Math.round(Math.min(image.naturalWidth, image.naturalHeight) * 0.003))
        if (tool === 'pen') {
          setDraft({ kind: 'pen', color, width, points: [start] })
        } else {
          setDraft({ kind: tool, color, width, from: start, to: start })
        }
      }

      function onPointerMove(event) {
        if (draft === null || image === null) return
        const point = pointOf(event)
        if (point === null) return
        if (draft.kind === 'select') {
          setDraft({ ...draft, to: point })
          return
        }
        if (draft.kind === 'pen') {
          const last = draft.points[draft.points.length - 1]
          if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1.4) return
          setDraft({ ...draft, points: [...draft.points, point] })
          return
        }
        setDraft({ ...draft, to: selection === null ? point : clampToSelection(point, selection) })
      }

      function finishStroke(event) {
        if (draft === null) return
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        } catch {
          // Capture may already be gone.
        }
        if (draft.kind === 'select') {
          const next = selectionOf(draft.from, draft.to)
          setDraft(null)
          if (next.w >= 8 && next.h >= 8) {
            setSelection(next)
            setPhase('edit')
          }
          return
        }
        setAnnotations((list) => [...list, draft])
        setDraft(null)
      }

      function onPointerCancel() {
        setDraft(null)
      }

      function reselect() {
        setPhase('select')
        setSelection(null)
        setAnnotations([])
        setDraft(null)
        setError(null)
      }

      function close() {
        const current = getSnapshot()
        if (current.phase === 'capture') {
          URL.revokeObjectURL(current.url)
          setSnapshot({ phase: 'idle' })
        }
      }

      async function confirm() {
        if (saving || selection === null || image === null) return
        setSaving(true)
        setError(null)
        try {
          const blob = await encodeSelection()
          attach(blob, capture)
          close()
        } catch (failure) {
          setError(messageOf(failure))
          setSaving(false)
        }
      }

      function encodeSelection() {
        return new Promise((resolve, reject) => {
          const width = Math.max(1, Math.round(selection.w))
          const height = Math.max(1, Math.round(selection.h))
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext('2d')
          if (!context) {
            reject(new Error(t('error.attach')))
            return
          }
          context.drawImage(
            image,
            selection.x,
            selection.y,
            selection.w,
            selection.h,
            0,
            0,
            width,
            height,
          )
          context.save()
          context.scale(width / selection.w, height / selection.h)
          context.translate(-selection.x, -selection.y)
          context.beginPath()
          context.rect(selection.x, selection.y, selection.w, selection.h)
          context.clip()
          for (const annotation of annotations) paintAnnotation(context, annotation, image, ensureScratch())
          context.restore()
          canvas.toBlob((blob) => {
            if (blob === null) reject(new Error(t('error.attach')))
            else resolve(blob)
          }, 'image/png')
        })
      }

      React.useEffect(() => {
        function onKeyDown(event) {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            close()
            return
          }
          if (event.key === 'Enter' && phase === 'edit') {
            event.preventDefault()
            event.stopPropagation()
            void confirm()
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => {
          window.removeEventListener('keydown', onKeyDown, true)
        }
      }, [phase, selection, annotations, saving, image])

      const cursor = phase === 'select' ? 'crosshair' : tool === 'pen' ? 'crosshair' : 'crosshair'
      const showEditor = phase === 'edit' && selection !== null

      return h(
        'div',
        {
          ref: rootRef,
          className: 'dsh-shot-root',
          tabIndex: -1,
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('command.label'),
        },
        h('style', null, STAGE_STYLE),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-shot-close',
            title: t('action.close'),
            'aria-label': t('action.close'),
            onClick: close,
          },
          h(CloseIcon),
        ),
        image === null
          ? h(
              'div',
              { className: 'dsh-shot-stage' },
              h('div', { className: 'dsh-shot-status' }, loadError ?? t('loading')),
            )
          : h(
              'div',
              { className: 'dsh-shot-stage' },
              h('canvas', {
                ref: canvasRef,
                className: 'dsh-shot-canvas',
                style: { cursor },
                onPointerDown,
                onPointerMove,
                onPointerUp: finishStroke,
                onPointerCancel,
              }),
              phase === 'select'
                ? h(
                    'div',
                    { className: 'dsh-shot-chip' },
                    capture.minimized === false ? `${t('warn.notMinimized')} · ${t('hint.select')}` : t('hint.select'),
                  )
                : null,
              error === null ? null : h('div', { className: 'dsh-shot-error' }, error),
              showEditor
                ? h(
                    'div',
                    { className: 'dsh-shot-bar' },
                    h('span', { className: 'dsh-shot-size' }, `${Math.round(selection.w)} × ${Math.round(selection.h)}`),
                    h('span', { className: 'dsh-shot-sep' }),
                    h(
                      ToolButton,
                      { label: t('tool.pen'), active: tool === 'pen', onClick: () => setTool('pen') },
                      h(PenIcon),
                    ),
                    h(
                      ToolButton,
                      { label: t('tool.rect'), active: tool === 'rect', onClick: () => setTool('rect') },
                      h(RectIcon),
                    ),
                    h(
                      ToolButton,
                      { label: t('tool.arrow'), active: tool === 'arrow', onClick: () => setTool('arrow') },
                      h(ArrowIcon),
                    ),
                    h(
                      ToolButton,
                      { label: t('tool.mosaic'), active: tool === 'mosaic', onClick: () => setTool('mosaic') },
                      h(MosaicIcon),
                    ),
                    h('span', { className: 'dsh-shot-sep' }),
                    ...TOOL_COLORS.map((value) =>
                      h('button', {
                        key: value,
                        type: 'button',
                        className: `dsh-shot-color${value === color ? ' is-active' : ''}`,
                        style: { background: value },
                        title: value,
                        'aria-label': value,
                        onClick: () => setColor(value),
                      }),
                    ),
                    h('span', { className: 'dsh-shot-sep' }),
                    h(
                      ToolButton,
                      {
                        label: t('tool.undo'),
                        disabled: annotations.length === 0,
                        onClick: () => setAnnotations((list) => list.slice(0, -1)),
                      },
                      h(UndoIcon),
                    ),
                    h(
                      ToolButton,
                      {
                        label: t('tool.clear'),
                        disabled: annotations.length === 0,
                        onClick: () => setAnnotations([]),
                      },
                      h(ClearIcon),
                    ),
                    h(
                      ToolButton,
                      { label: t('tool.reselect'), onClick: reselect },
                      h(CropIcon),
                    ),
                    h('span', { className: 'dsh-shot-spacer' }),
                    h(
                      'button',
                      { type: 'button', className: 'dsh-shot-text', onClick: close },
                      t('action.cancel'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-shot-primary',
                        disabled: saving,
                        onClick: () => void confirm(),
                      },
                      saving ? t('action.applying') : t('action.use'),
                    ),
                  )
                : h(
                    'div',
                    { className: 'dsh-shot-bar' },
                    h('span', { className: 'dsh-shot-size' }, t('hint.select')),
                    h('span', { className: 'dsh-shot-spacer' }),
                    h(
                      'button',
                      { type: 'button', className: 'dsh-shot-text', onClick: close },
                      t('action.cancel'),
                    ),
                  ),
            ),
      )
    }

    /** Root overlay entry: renders nothing unless a capture is in flight or awaiting edits. */
    function ScreenshotOverlay() {
      const current = useSnapshot()
      if (current.phase !== 'capture') return null
      return h(CaptureStage, { key: current.id, capture: current })
    }

    // --------------------------------------------------------- capture flow

    /**
     * Ask the Host for a fresh desktop capture, then open the editor overlay.
     * @param sessionId - Session that will receive the image.
     */
    async function beginCapture(sessionId) {
      if (getSnapshot().phase !== 'idle') return
      const id = ++captureCounter
      setSnapshot({ phase: 'capturing' })
      try {
        const response = await fetch(CAPTURE_ROUTE, { method: 'POST', headers: { accept: 'image/png' } })
        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          throw new Error(detail.trim() === '' ? `HTTP ${String(response.status)}` : detail.trim())
        }
        const blob = await response.blob()
        if (blob.size === 0) throw new Error('empty screenshot')
        const url = URL.createObjectURL(blob)
        const image = new Image()
        try {
          await new Promise((resolve, reject) => {
            image.onload = () => resolve()
            image.onerror = () => reject(new Error(runtime.t('error.decode')))
            image.src = url
          })
        } catch (failure) {
          URL.revokeObjectURL(url)
          throw failure
        }
        setSnapshot({
          phase: 'capture',
          id,
          url,
          width: image.naturalWidth,
          height: image.naturalHeight,
          sessionId,
          minimized: response.headers.get('x-dsh-window-minimized') !== '0',
        })
      } catch (failure) {
        setSnapshot({ phase: 'idle' })
        reportFailure(sessionId, `${runtime.t('error.capture')}: ${messageOf(failure)}`)
      }
    }

    /**
     * Put one PNG blob into the current Session's draft attachments.
     * @param blob - encoded cropped screenshot.
     * @param capture - capture state carrying the target Session id.
     * @returns the draft attachment ids now shown in the composer rail.
     */
    function attach(blob, capture) {
      const ctx = runtime.ctx
      const t = runtime.t
      if (ctx === null) throw new Error(t('error.unavailable'))
      const sessions = ctx.get('sessions')
      const actx = sessions === undefined ? undefined : sessions.scope(capture.sessionId)
      if (actx === undefined || actx === null) throw new Error(t('error.session'))
      const conversation = actx.get('conversation')
      if (conversation === undefined || conversation === null || typeof conversation.createDrafts !== 'function') {
        throw new Error(t('error.conversation'))
      }
      if (typeof conversation.input?.for !== 'function') throw new Error(t('error.conversation'))
      const file = new File([blob], timestampName(), { type: 'image/png' })
      const drafts = conversation.createDrafts(capture.sessionId, [file])
      const shell = conversation.input.for(actx)
      const actions = shell?.actions
      const accepted =
        actions !== undefined && typeof actions.addAttachments === 'function'
          ? actions.addAttachments(drafts.map((draft) => draft.id))
          : false
      if (!accepted) {
        try {
          conversation.releaseDraftAttachments(drafts)
        } catch {
          // Releasing is a courtesy; the draft registry will prune eventually.
        }
        throw new Error(t('error.busy'))
      }
      try {
        shell.focus()
      } catch {
        // Focus is a courtesy.
      }
      return drafts.map((draft) => draft.id)
    }

    /**
     * Surface a capture failure through the Session's composer notice channel.
     * @param sessionId - Session whose composer shows the notice.
     * @param text - localized failure text.
     */
    function reportFailure(sessionId, text) {
      try {
        const ctx = runtime.ctx
        const sessions = ctx?.get('sessions')
        const actx = sessions === undefined ? undefined : sessions.scope(sessionId)
        const conversation = actx?.get('conversation')
        if (conversation !== undefined && conversation !== null && typeof conversation.input?.for === 'function') {
          conversation.input.for(actx).notify('error', text)
          return
        }
      } catch {
        // Fall through to the console.
      }
      console.warn(`[screenshot-tool] ${text}`)
    }

    // ---------------------------------------------------------------- plugin

    /**
     * Mount the + menu contribution and the frame-wide capture overlay.
     * @param ctx - restricted Client context of this bundle.
     */
    function apply(ctx) {
      runtime.ctx = ctx
      try {
        ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'screenshot-tool: dictionaries')
      } catch (error) {
        console.warn('[screenshot-tool] locale registration failed', error)
      }
      try {
        runtime.t = ctx.locale.bind(NS)
      } catch {
        runtime.t = (key) => FALLBACK[key] ?? key
      }

      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register(
          { name: 'shell.overlay', id: 'screenshot-tool', order: 900 },
          ScreenshotOverlay,
        ),
      )

      ctx.inject(['commandUi'], (scope) => {
        const commands = scope.get('commandUi')
        if (commands === undefined || commands === null) return
        scope.effect(
          () =>
            commands.register({
              name: 'screenshot',
              label: () => runtime.t('command.label'),
              description: () => runtime.t('command.description'),
              icon: CommandIcon,
              available: () => getSnapshot().phase === 'idle',
              ui: {
                kind: 'action',
                run: (session) => {
                  const sessionId = session?.sessionId
                  if (sessionId === undefined) return
                  void beginCapture(sessionId)
                },
              },
            }),
          'screenshot-tool: screenshot action',
        )
      })
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
