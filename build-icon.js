const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

const iconPngPath = path.join(__dirname, 'icon.png');
const iconIcoPath = path.join(__dirname, 'icon.ico');

pngToIco(iconPngPath)
  .then(buf => {
    fs.writeFileSync(iconIcoPath, buf);
    console.log('Successfully converted icon.png to icon.ico');
  })
  .catch(err => {
    console.error('Failed to convert icon:', err);
  });
