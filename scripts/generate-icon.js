const fs = require('fs');
const path = require('path');

// 项目根目录（scripts 目录的上级）
const ROOT = path.join(__dirname, '..');

// SVG 内容 - 深色科技感图标
const svgContent = fs.readFileSync(
  path.join(ROOT, 'public', 'icon.svg'),
  'utf8'
);

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngDir = path.join(ROOT, 'public', 'icon_pngs');
if (!fs.existsSync(pngDir)) {
  fs.mkdirSync(pngDir, { recursive: true });
}

// 方法 1：如果有 resvg/rsvg-convert，优先使用
// 方法 2：使用 Node.js canvas 库（如果安装了）
// 方法 3：降级到基于 sharp 的方案
// 方法 4：使用 puppeteer (headless chromium)

// 检查是否有可用的 sharp
let sharp;
try {
  sharp = require('sharp');
  console.log('使用 sharp 库生成 PNG');
} catch (e) {
  console.log('sharp 未安装，尝试其他方式...');
}

async function generatePngsWithSharp() {
  // 使用 sharp 需要先把 SVG 保存为文件
  const svgFilePath = path.join(ROOT, 'public', 'icon_source.svg');
  fs.writeFileSync(svgFilePath, svgContent);

  for (const size of sizes) {
    const buffer = await sharp(svgFilePath)
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(pngDir, `${size}.png`), buffer);
    console.log(`  ${size}x${size} PNG 生成成功`);
  }
  return true;
}

async function generatePngsWithCanvas() {
  let canvas, Canvas, loadImage;
  try {
    const canvasLib = require('canvas');
    canvas = canvasLib.createCanvas;
    loadImage = canvasLib.loadImage;
    Canvas = canvasLib.Canvas;
  } catch (e) {
    return false;
  }

  // 创建临时 HTML/SVG 并渲染
  for (const size of sizes) {
    const c = canvas(size, size);
    const ctx = c.getContext('2d');
    // 先尝试用 loadImage 加载 SVG
    try {
      const img = await loadImage(
        'data:image/svg+xml;base64,' + Buffer.from(svgContent).toString('base64')
      );
      ctx.drawImage(img, 0, 0, size, size);
      const buffer = c.toBuffer('image/png');
      fs.writeFileSync(path.join(pngDir, `${size}.png`), buffer);
      console.log(`  ${size}x${size} PNG 生成成功`);
    } catch (err) {
      console.log(`  ${size}x${size} 生成失败:`, err.message);
    }
  }
  return true;
}

// PNG 到 ICO 的手动转换
function createICO(pngFiles, outputPath) {
  const chunks = [];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type = 1 (ICO)
  header.writeUInt16LE(pngFiles.length, 4);  // number of images
  chunks.push(header);

  let offset = 6 + (16 * pngFiles.length); // header + dir entries
  const entries = [];
  const imageData = [];

  for (const { data, size } of pngFiles) {
    // 读取 PNG 的宽高
    const width = size >= 256 ? 0 : size;  // ICO 用 0 表示 256
    const height = size >= 256 ? 0 : size;
    
    // 目录项
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width, 0);
    entry.writeUInt8(height, 1);
    entry.writeUInt8(0, 2);     // color count (0 = truecolor)
    entry.writeUInt8(0, 3);     // reserved
    entry.writeUInt16LE(1, 4);  // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);  // image data size
    entry.writeUInt32LE(offset, 12);      // offset
    entries.push(entry);
    imageData.push(data);
    offset += data.length;
  }

  chunks.push(...entries);
  chunks.push(...imageData);

  const finalBuffer = Buffer.concat(chunks);
  fs.writeFileSync(outputPath, finalBuffer);
  console.log(`\nICO 生成成功: ${outputPath}`);
  console.log(`包含 ${pngFiles.length} 个尺寸: ${pngFiles.map(p => p.size + 'x' + p.size).join(', ')}`);
}

async function main() {
  console.log('正在生成图标 PNG...');

  let success = false;

  if (sharp) {
    try {
      success = await generatePngsWithSharp();
    } catch (err) {
      console.log('sharp 失败:', err.message);
    }
  }

  if (!success) {
    try {
      success = await generatePngsWithCanvas();
    } catch (err) {
      console.log('canvas 失败:', err.message);
    }
  }

  if (!success) {
    console.log('\n⚠️  无可用的 SVG -> PNG 转换库');
    console.log('\n请执行以下任一命令安装依赖：');
    console.log('  npm install --save-dev sharp');
    console.log('  npm install --save-dev canvas');
    console.log('\n或者使用在线工具转换：');
    console.log('  1. 打开 https://realfavicongenerator.net/');
    console.log('  2. 上传 public/icon.svg');
    console.log('  3. 下载 ICO 文件并保存为 public/icon.ico');
    console.log('\n或者使用 ImageMagick (如果已安装)：');
    console.log('  magick convert public/icon.svg -define icon:auto-resize=256,128,64,48,32,24,16 public/icon.ico');
    return;
  }

  // 收集 PNG 数据并创建 ICO
  console.log('\n正在打包 ICO 文件...');
  const pngData = [];
  for (const size of sizes) {
    const filePath = path.join(pngDir, `${size}.png`);
    if (fs.existsSync(filePath)) {
      pngData.push({
        size,
        data: fs.readFileSync(filePath),
      });
    }
  }

  if (pngData.length === 0) {
    console.log('❌ 没有找到生成的 PNG 文件');
    return;
  }

  const icoPath = path.join(ROOT, 'public', 'icon.ico');
  createICO(pngData, icoPath);

  // 清理临时 PNG
  fs.rmSync(pngDir, { recursive: true, force: true });
  console.log('\n✅ 完成！图标已保存至: public/icon.ico');
}

main().catch(console.error);