PM2是一個進程管理工具，它可以讓您的應用在後台運行，自動重啟，並在電腦重啟後自動啟動。

### 詳細步驟：

1. **安裝全局PM2**
   - 打開命令提示符（按Win鍵，輸入"cmd"，按Enter）
   - 輸入以下命令並按Enter：
     ```
     npm install -g pm2
     ```
   - 等待安裝完成

2. **使用PM2啟動您的應用**
   - 導航到您的專案資料夾（使用cd命令，例如：`cd C:\path\to\your\audio-merger`）
   - 輸入以下命令啟動應用：
     ```
     pm2 start server.js --name "audio-merger"
     ```

3. **設置開機自動啟動**
   - 在同一命令視窗中輸入：
     ```
     pm2 startup
     ```
   - 系統會提示您複製並執行一段命令，請複製並執行它
   - 然後執行：
     ```
     pm2 save
     ```

4. **確認應用正在運行**
   - 輸入：`pm2 list`
   - 您應該看到您的應用列表，狀態為"online"

### 讓內網用戶訪問：

1. **查找您電腦的IP地址**
   - 打開命令提示符，輸入：`ipconfig`
   - 尋找「IPv4 地址」（可能看起來像 192.168.1.xxx）

2. **修改server.js文件**
   - 使用記事本或其他文本編輯器打開server.js
   - 找到以下代碼（大約在文件底部）：
     ```javascript
     server.listen(PORT, () => {
         console.log(`服務器運行在端口 ${PORT}`);
         console.log(`請訪問 http://localhost:${PORT}`);
     });
     ```
   - 將其修改為：
     ```javascript
     server.listen(PORT, '0.0.0.0', () => {
         console.log(`服務器運行在端口 ${PORT}`);
         console.log(`請訪問 http://localhost:${PORT}`);
         console.log(`內網用戶請訪問 http://[您的IP地址]:${PORT}`);
     });
     ```

3. **重啟應用**
   - 輸入：`pm2 restart audio-merger`

4. **配置Windows防火牆**
   - 按Win鍵，輸入"防火牆"，選擇"Windows Defender防火牆"
   - 點擊左側的"允許應用或功能通過Windows Defender防火牆"
   - 點擊"更改設定"
   - 點擊"允許其他應用"
   - 點擊"瀏覽"，找到您的Node.js執行檔（通常在C:\Program Files\nodejs\node.exe）
   - 確保"專用"網絡選項被勾選
   - 點擊"添加"，然後"確定"

5. **通知內網用戶**
   - 內網用戶可以通過瀏覽器訪問：`http://您的IP地址:3000`
   - 例如：`http://192.168.1.100:3000`

## 為用戶創建便捷的訪問方式

### 創建桌面快捷方式：

1. 右鍵點擊桌面，選擇"新建" -> "快捷方式"
2. 在位置欄位輸入：`http://您的電腦IP:3000`（例如：`http://192.168.1.100:3000`）
3. 點擊"下一步"，將名稱設為"音頻合併器"
4. 點擊"完成"

將此快捷方式發送給內網用戶，他們就可以輕鬆訪問您的應用了。

## 故障排除

如果用戶無法連接到您的應用，請檢查：

1. **確認您的應用正在運行**
   - 使用PM2時，輸入`pm2 list`查看狀態
   - 使用服務時，檢查服務是否啟動

2. **確認IP地址正確**
   - 您的IP地址可能會變化，尤其是重啟電腦後
   - 使用`ipconfig`重新確認IP地址

3. **檢查防火牆設置**
   - 嘗試暫時關閉防火牆，看看問題是否解決
   - 如果是，則重新配置防火牆規則

4. **檢查端口衝突**
   - 如果3000端口被占用，可以在server.js中修改PORT變量（例如：`const PORT = process.env.PORT || 3001;`）




如果您只是想暫時停止應用，但將來可能還會繼續使用：
pm2 stop audio-merger

啟動應用:
pm2 start audio-merger

如果您想完全移除應用：
pm2 delete audio-merger

重新啟動應用:
pm2 start server.js --name "audio-merger"
