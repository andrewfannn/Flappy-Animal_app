const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow () {
  // 建立瀏覽器視窗 (設定適合 Flappy Bird 的視窗長寬比例)
  const win = new BrowserWindow({
    width: 500,
    height: 800,
    resizable: true, // 允許調整視窗大小
    fullscreenable: true, // 允許全螢幕
    icon: path.join(__dirname, 'icon.ico'), // 設定視窗與工具列圖示
    webPreferences: {
      nodeIntegration: true
    },
    autoHideMenuBar: true // 隱藏上方的選單列
  })

  // 載入 index.html
  win.loadFile('index.html')
}

// 當 Electron 完成初始化並準備好建立瀏覽器視窗時呼叫
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 當所有視窗都關閉時退出應用程式
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
