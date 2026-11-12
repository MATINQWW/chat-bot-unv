#!/usr/bin/env bash
# نصب روی Ubuntu 22/24 تازه:  sudo bash deploy/setup.sh  (از داخل پوشهٔ پروژه)
set -e
apt-get update && apt-get install -y nginx mariadb-server curl
command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs; }
npm i -g pm2
PASS=$(openssl rand -hex 16)
mysql -e "CREATE DATABASE IF NOT EXISTS chatbot CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'chatbot'@'localhost' IDENTIFIED BY '$PASS'; GRANT ALL ON chatbot.* TO 'chatbot'@'localhost';"
[ -f .env ] || cat > .env <<EOF
OLLAMA_API_KEY=
CHAT_SIGNING_SECRET=$(openssl rand -hex 24)
ADMIN_TOKEN=$(openssl rand -hex 16)
MYSQL_URL=mysql://chatbot:$PASS@localhost:3306/chatbot
EOF
chmod 600 .env
npm ci --omit=dev
cp deploy/nginx.conf /etc/nginx/sites-available/chatbot && ln -sf /etc/nginx/sites-available/chatbot /etc/nginx/sites-enabled/chatbot && nginx -t && systemctl reload nginx
pm2 start deploy/ecosystem.config.js && pm2 save && pm2 startup systemd -u root --hp /root
echo "✓ تمام. کلید مدل را در .env بگذارید، server_name را در nginx عوض کنید، سپس: pm2 restart chatbot"
