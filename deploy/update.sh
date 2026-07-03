#!/bin/bash
set -e
echo "🔄 Atualizando Totem Festival..."
cd /var/www/totem-festival
git pull
cd backend  && npm install && npm run build && cd ..
cd frontend && npm install && npm run build && cd ..
cd admin    && npm install && npm run build && cd ..
pm2 restart totem-api
echo "✅ Deploy concluído!"
