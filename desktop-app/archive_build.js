const fs = require('fs');
const path = require('path');

// Check dist, releases, and release (the output directory configured in package.json)
const targetDirs = [
  path.join(__dirname, 'dist'),
  path.join(__dirname, 'releases'),
  path.join(__dirname, 'release')
];

let archivedCount = 0;

targetDirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;

  const historyDir = path.join(dir, 'build_history');
  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  const files = fs.readdirSync(dir);
  files.forEach(file => {
    if (file.endsWith('.exe')) {
      const oldPath = path.join(dir, file);
      const timestamp = new Date().toISOString().replace(/[-:T]/g, '_').split('.')[0];
      const ext = path.extname(file);
      const baseName = path.basename(file, ext);
      
      let newFileName = `${baseName}_archived_${timestamp}${ext}`;
      let newPath = path.join(historyDir, newFileName);
      let counter = 1;
      while (fs.existsSync(newPath)) {
        newFileName = `${baseName}_archived_${timestamp}_${counter}${ext}`;
        newPath = path.join(historyDir, newFileName);
        counter++;
      }

      try {
        fs.renameSync(oldPath, newPath);
        archivedCount++;
        console.log(`📦 Archived previous build: ${path.basename(newPath)}`);

        // Also archive associated .blockmap if it exists
        const oldBlockmap = path.join(dir, `${file}.blockmap`);
        if (fs.existsSync(oldBlockmap)) {
          const newBlockmap = path.join(historyDir, `${newFileName}.blockmap`);
          try {
            fs.renameSync(oldBlockmap, newBlockmap);
          } catch (bmErr) {
            console.warn(`Could not archive blockmap for ${file}: ${bmErr.message}`);
          }
        }
      } catch (err) {
        console.warn(`Could not archive ${file}: ${err.message}`);
      }
    }
  });
});

if (archivedCount === 0) {
  console.log('ℹ️ No existing .exe builds found to archive. Proceeding with fresh build.');
} else {
  console.log(`✅ Successfully archived ${archivedCount} previous build(s).`);
}
