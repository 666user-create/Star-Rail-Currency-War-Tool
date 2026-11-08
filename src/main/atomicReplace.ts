import fs from 'node:fs'

/** Windows 文件扫描器可能短暂占用刚写出的目标；只重试可恢复的替换错误。 */
export function atomicReplace(temporary: string, destination: string): void {
  const wait = new Int32Array(new SharedArrayBuffer(4))
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(temporary, destination); return }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (process.platform !== 'win32' || attempt >= 3 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw error
      Atomics.wait(wait, 0, 0, (attempt + 1) * 40)
    }
  }
}
