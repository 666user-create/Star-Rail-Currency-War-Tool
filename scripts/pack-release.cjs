/**
 * 发布包后处理脚本。
 *
 * electron-builder 的 winCodeSign 下载在国内网络下经常失败（且解压需要符号链接权限），
 * 所以关闭了它的 signAndEditExecutable，改由这里完成：
 *   1. 用本地缓存的 rcedit 写入产品元数据（公司/产品/版本）
 *   2. 清理多余文件（Electron 默认的 default_app.asar）
 *   3. 用 7z 打成 zip
 *
 * 用法：npm run dist（会自动调用）
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const UNPACKED = path.join(ROOT, 'release', 'win-unpacked')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8').replace(/^\uFEFF/, ''))
const PRODUCT = pkg.build.productName || 'app'
const EXE = path.join(UNPACKED, `${PRODUCT}.exe`)

if (!fs.existsSync(EXE)) {
  console.error(`❌ 找不到 ${EXE}，electron-builder 可能失败了`)
  process.exit(1)
}

// ── 1. 找 rcedit ──
function findRcedit() {
  const cacheBase = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'winCodeSign')
  if (!fs.existsSync(cacheBase)) return null
  for (const dir of fs.readdirSync(cacheBase)) {
    const candidate = path.join(cacheBase, dir, 'rcedit-x64.exe')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

// ── 2. 写元数据 ──
const rcedit = findRcedit()
if (rcedit) {
  try {
    execFileSync(rcedit, [
      EXE,
      '--set-version-string', 'CompanyName', 'currency-war-pet',
      '--set-version-string', 'ProductName', PRODUCT,
      '--set-version-string', 'FileDescription', pkg.description?.slice(0, 60) || PRODUCT,
      '--set-version-string', 'LegalCopyright', '非官方同人作品，与 miHoYo/HoYoverse 无关联',
      '--set-version-string', 'OriginalFilename', `${PRODUCT}.exe`,
      '--set-file-version', pkg.version,
      '--set-product-version', pkg.version,
    ], { stdio: 'pipe' })
    console.log('✅ 已写入 exe 元数据')
  } catch (e) {
    console.warn('⚠️ 写元数据失败（不影响运行）:', e.message)
  }
} else {
  console.warn('⚠️ 找不到 rcedit，跳过元数据写入')
}

// ── 3. 清理多余文件 ──
const defaultApp = path.join(UNPACKED, 'resources', 'default_app.asar')
if (fs.existsSync(defaultApp)) {
  fs.rmSync(defaultApp)
  console.log('已删除多余的 default_app.asar')
}

// 把使用说明一起放进发布目录
const readmeSrc = path.join(ROOT, 'docs', '发布版', '使用说明.txt')
if (fs.existsSync(readmeSrc)) {
  fs.copyFileSync(readmeSrc, path.join(UNPACKED, '使用说明.txt'))
  console.log('已放入 使用说明.txt')
}

// ── 4. 打包 zip（用系统 7z，比 electron-builder 自带的快且稳） ──
const zipName = `${PRODUCT}-${pkg.version}-win-x64.zip`
const zipPath = path.join(ROOT, 'release', zipName)
if (fs.existsSync(zipPath)) fs.rmSync(zipPath)

const sevenZ = ['D:\\Star Rail\\7z.exe', 'C:\\Program Files\\7-Zip\\7z.exe', '7z'].find((p) => {
  try {
    if (p === '7z') return true
    return fs.existsSync(p)
  } catch { return false }
})

try {
  execFileSync(sevenZ, ['a', '-tzip', '-mx=5', zipPath, '.'], { cwd: UNPACKED, stdio: 'pipe' })
  const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)
  console.log(`✅ 发布包: release/${zipName}  (${mb} MB)`)
} catch (e) {
  console.error('❌ zip 打包失败:', e.message)
  process.exit(1)
}
