#!/bin/sh
# Substitui apenas ${API_URL} no template, preservando variáveis nginx ($host, etc).
envsubst '${API_URL}' < /tmp/nginx.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
