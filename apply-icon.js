const rcedit = require('rcedit').rcedit;
const path = require('path');

const exePath = path.join(__dirname, 'dist', 'win-unpacked', 'Flappy Animal.exe');
const iconPath = path.join(__dirname, 'build', 'icon.ico');

rcedit(exePath, {
  icon: iconPath
}).then(() => {
  console.log('rcedit successfully applied icon to the executable!');
}).catch(err => {
  console.error('rcedit failed:', err);
});
