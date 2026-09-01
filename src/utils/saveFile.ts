interface SaveFilePickerOptions {
  suggestedName?: string
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
}

interface FileSystemWritableFileStreamLike {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
}

interface FileSystemFileHandleLike {
  createWritable: () => Promise<FileSystemWritableFileStreamLike>
}

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>
}

export type SaveResult = 'saved' | 'cancelled'

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot) : ''
}

function anchorDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function saveBlob(blob: Blob, fileName: string): Promise<SaveResult> {
  const picker = (window as WindowWithSavePicker).showSaveFilePicker
  if (picker) {
    try {
      const extension = extensionOf(fileName)
      const handle = await picker({
        suggestedName: fileName,
        types: extension ? [{
          description: 'メディアファイル',
          accept: { [blob.type || 'application/octet-stream']: [extension] },
        }] : undefined,
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return 'saved'
    } catch (error) {
      if (isAbortError(error)) return 'cancelled'
    }
  }

  anchorDownload(blob, fileName)
  return 'saved'
}
