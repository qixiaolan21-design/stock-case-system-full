@echo off
echo ============================================
echo   部署到 Render - 一键脚本
echo ============================================
echo.
echo 正在打开 Render 部署页面...
echo.
start https://dashboard.render.com/web/new
.
echo 请按以下步骤操作：
echo.
echo 1. 点击 "Build and deploy from a Git repository"
echo 2. 搜索并选择：stock-case-system-full
echo 3. 填写配置：
echo    - Name: stock-case-system-full
echo    - Runtime: Node
echo    - Build Command: npm install
echo    - Start Command: npm start
echo 4. 点击 Create Web Service
echo.
echo 等待 2-3 分钟后，会获得网址！
echo.
pause
