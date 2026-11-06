import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Host half of the screenshot bundle.
 *
 * Exposes one authenticated Fetch route (`POST /api/screenshot.capture`) that the
 * browser half calls from the composer + menu. On Windows it briefly minimizes the
 * DSH window, captures the whole virtual desktop (all monitors) with System.Drawing
 * through a short PowerShell helper, restores the window, and streams the PNG back.
 * The browser half owns cropping, annotation, and attaching the result.
 */

export const name = 'screenshot-tool'
export const inject = ['connection']

/** Registration path of the capture route (document-relative from the Web page). */
const ROUTE = '/api/screenshot.capture'
/** How long the desktop stays visible before the framebuffer is copied out. */
const MINIMIZE_SETTLE_MS = 420
/** Hard limit for the PowerShell helper round trip. */
const CAPTURE_TIMEOUT_MS = 20000

/** One capture at a time: concurrent callers cannot fight over the window state. */
let capturing = null

/**
 * Register the capture route on this Host's Connection service.
 * @param ctx - Host context carrying the Connection Fetch registry.
 */
export function apply(ctx) {
  if (process.platform !== 'win32') {
    warn(ctx, 'screenshot capture is only implemented for Windows; the route stays disabled')
    return
  }
  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: ROUTE,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: () => handleCapture(ctx),
    })
    return () => {
      Promise.resolve(dispose()).catch(() => {})
    }
  }, 'screenshot-tool: capture route')
}

/**
 * Answer one capture request.
 * @param ctx - owning Host context, used only for diagnostics.
 * @returns the PNG response, or an explicit failure status.
 */
async function handleCapture(ctx) {
  if (capturing !== null) {
    return new Response('a screenshot capture is already running', { status: 429 })
  }
  const task = captureDesktop(ctx)
  capturing = task
  try {
    const { bytes, minimized } = await task
    return new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(bytes.length),
        'cache-control': 'no-store',
        'x-dsh-window-minimized': minimized ? '1' : '0',
      },
    })
  } catch (error) {
    return new Response(describe(error), { status: 500, headers: { 'cache-control': 'no-store' } })
  } finally {
    capturing = null
  }
}

/**
 * Capture the whole virtual desktop into PNG bytes.
 * @param ctx - owning Host context, used only for diagnostics.
 * @returns the encoded image and whether the DSH window was minimized for it.
 */
async function captureDesktop(ctx) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-screenshot-tool-'))
  const outputPath = join(directory, 'capture.png')
  try {
    const { stdout, stderr } = await runPowerShell(buildCaptureScript(outputPath), CAPTURE_TIMEOUT_MS)
    const bytes = await readFile(outputPath)
    if (bytes.length === 0) {
      throw new Error(`the capture helper produced an empty image${stderr.trim() === '' ? '' : `: ${stderr.trim().slice(0, 400)}`}`)
    }
    return {
      bytes,
      minimized: stdout.includes('minimized=1'),
    }
  } catch (error) {
    warn(ctx, `capture failed: ${describe(error)}`)
    throw error
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Run one PowerShell script and collect its output.
 * @param script - complete script text, passed as an encoded command.
 * @param timeoutMs - upper bound for the child process.
 * @returns captured stdout and stderr on a zero exit code.
 */
function runPowerShell(script, timeoutMs) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encoded,
      ],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill()
      } catch {
        // The process already exited.
      }
      reject(new Error(`screenshot helper timed out after ${String(timeoutMs)} ms`))
    }, timeoutMs)
    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      callback()
    }
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      finish(() => {
        reject(error)
      })
    })
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) {
          resolve({ stdout, stderr })
          return
        }
        const detail = (stderr.trim() === '' ? stdout : stderr).trim()
        reject(new Error(`screenshot helper exited with ${String(code)}${detail === '' ? '' : `: ${detail.slice(0, 600)}`}`))
      })
    })
  })
}

/**
 * Build the PowerShell helper that hides the app window, copies the desktop, and
 * restores the window even when the capture fails.
 * @param outputPath - PNG destination owned by the caller.
 * @returns complete UTF-16-friendly script text.
 */
function buildCaptureScript(outputPath) {
  const quotedPath = `'${outputPath.replace(/'/g, "''")}'`
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$out = ${quotedPath}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$native = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DshShotNative
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int command);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int command);
    [DllImport("user32.dll")]
    public static extern bool PostMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private static bool IsAppWindow(IntPtr hWnd)
    {
        if (hWnd == IntPtr.Zero) return false;
        if (!IsWindowVisible(hWnd)) return false;
        StringBuilder className = new StringBuilder(256);
        GetClassName(hWnd, className, className.Capacity);
        if (className.ToString() != "Chrome_WidgetWin_1") return false;
        StringBuilder title = new StringBuilder(512);
        GetWindowText(hWnd, title, title.Capacity);
        return title.ToString().IndexOf("DeepSeek Harness", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    public static IntPtr FindAppWindow()
    {
        IntPtr foreground = GetAncestor(GetForegroundWindow(), 2u);
        if (IsAppWindow(foreground)) return foreground;
        IntPtr best = IntPtr.Zero;
        long bestArea = -1;
        EnumWindows((hWnd, lParam) =>
        {
            if (!IsAppWindow(hWnd)) return true;
            RECT rect;
            if (GetWindowRect(hWnd, out rect))
            {
                long area = (long)(rect.Right - rect.Left) * (long)(rect.Bottom - rect.Top);
                if (area > bestArea)
                {
                    bestArea = area;
                    best = hWnd;
                }
            }
            return true;
        }, IntPtr.Zero);
        return best;
    }

    public static bool WaitForIconic(IntPtr hWnd, int attempts)
    {
        for (int index = 0; index < attempts; index += 1)
        {
            if (IsIconic(hWnd)) return true;
            System.Threading.Thread.Sleep(70);
        }
        return IsIconic(hWnd);
    }

    public static bool MinimizeAppWindow(IntPtr hWnd)
    {
        if (hWnd == IntPtr.Zero) return false;
        if (IsIconic(hWnd)) return true;
        ShowWindow(hWnd, 6);
        if (WaitForIconic(hWnd, 12)) return true;
        ShowWindowAsync(hWnd, 6);
        if (WaitForIconic(hWnd, 12)) return true;
        PostMessage(hWnd, 0x0112u, (IntPtr)0xF020, IntPtr.Zero);
        return WaitForIconic(hWnd, 12);
    }

    public static void RestoreAppWindow(IntPtr hWnd)
    {
        if (hWnd == IntPtr.Zero) return;
        if (IsIconic(hWnd)) ShowWindow(hWnd, 9);
        SetForegroundWindow(hWnd);
    }
}
'@
Add-Type -TypeDefinition $native -Language CSharp
try { [void][DshShotNative]::SetProcessDPIAware() } catch { }
$hwnd = [DshShotNative]::FindAppWindow()
$minimized = 0
if ([DshShotNative]::MinimizeAppWindow($hwnd)) {
  $minimized = 1
  Start-Sleep -Milliseconds ${String(MINIMIZE_SETTLE_MS)}
}
try {
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    } finally {
      $graphics.Dispose()
    }
    $bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bitmap.Dispose()
  }
} finally {
  if ($minimized -eq 1) {
    [DshShotNative]::RestoreAppWindow($hwnd)
  }
}
Write-Output ('ok minimized=' + $minimized)
`
}

/**
 * Log one host-half diagnostic without letting a missing logger break a request.
 * @param ctx - owning Host context.
 * @param message - diagnostic text.
 */
function warn(ctx, message) {
  try {
    ctx.logger?.('screenshot-tool')?.warn?.(message)
  } catch {
    // Diagnostics are best effort.
  }
}

/**
 * Render one failure as text.
 * @param error - thrown value.
 * @returns message text.
 */
function describe(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Diagnostics hook: lets maintainers exercise the capture helper without the Web UI. */
export { buildCaptureScript, captureDesktop }

