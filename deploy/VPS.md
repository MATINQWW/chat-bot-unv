# نصب روی VPS (Ubuntu)
1. پروژه را در `/opt/chatbot` بگذارید (`git clone` یا آپلود zip).
2. `cd /opt/chatbot && sudo bash deploy/setup.sh` — Node 20، MariaDB، nginx و pm2 نصب و `.env` با رمزهای تصادفی ساخته می‌شود.
3. در `.env` مقدار `OLLAMA_API_KEY` را بگذارید؛ در `/etc/nginx/sites-available/chatbot` دامنه را عوض کنید.
4. `pm2 restart chatbot && systemctl reload nginx` و برای HTTPS: `apt install certbot python3-certbot-nginx && certbot --nginx` (برای ضبط صدا HTTPS لازم است).
5. بررسی: `curl -I http://localhost:3000` و `pm2 logs chatbot`.

- حالت cluster: یک پروسه برای هر هسته؛ rate-limit و حافظهٔ یادگیری از طریق MySQL بین همه مشترک است.
- به‌روزرسانی: `git pull && npm ci --omit=dev && pm2 reload chatbot` (بدون قطعی).
- به‌جای pm2 می‌شود از `deploy/chatbot.service` (systemd) استفاده کرد.
