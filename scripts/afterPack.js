const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  const { appOutDir } = context;
  
  const localesDir = path.join(appOutDir, 'locales');
  if (!fs.existsSync(localesDir)) {
    return;
  }
  
  const keepLocales = [
    'en-US.pak',
    'zh-CN.pak',
    'zh-HK.pak',
    'zh-TW.pak',
    'en-GB.pak',
    'en.pak'
  ];
  
  const files = fs.readdirSync(localesDir);
  let deletedCount = 0;
  let deletedSize = 0;
  
  for (const file of files) {
    if (!keepLocales.includes(file)) {
      const filePath = path.join(localesDir, file);
      const stats = fs.statSync(filePath);
      deletedSize += stats.size;
      fs.unlinkSync(filePath);
      deletedCount++;
    }
  }
  
  console.log(`[afterPack] Deleted ${deletedCount} unused locale files, saving ${(deletedSize / 1024 / 1024).toFixed(2)} MB`);
};
