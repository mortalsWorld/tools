const fs = require('fs');

const filePath = 'E:\\trae\\tools\\electron\\main.ts';

// 读取文件
const content = fs.readFileSync(filePath, 'utf8');

// 修复缺少闭合引号的问题
let fixedContent = content;

// 修复 logger.info 和 logger.debug 中缺少闭合引号的问题
fixedContent = fixedContent.replace(/logger\.(info|debug)\('([^']+[^\\])\s*\)/g, 'logger.$1(\'$2\')');

// 修复 logger.error 中缺少闭合引号的问题
fixedContent = fixedContent.replace(/logger\.error\('([^']+[^\\])\s*\)/g, 'logger.error(\'$1\')');

// 修复 logger.warn 中缺少闭合引号的问题
fixedContent = fixedContent.replace(/logger\.warn\('([^']+[^\\])\s*\)/g, 'logger.warn(\'$1\')');

// 写入修复后的文件
fs.writeFileSync(filePath, fixedContent, 'utf8');
console.log('Fixed unclosed quotes!');
