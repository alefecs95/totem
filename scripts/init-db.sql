-- Execute no pgAdmin (conectado como postgres) ou via psql.
-- Credenciais do app: totem_user / totem_dev

CREATE USER totem_user WITH PASSWORD 'totem_dev';

CREATE DATABASE totem_festival OWNER totem_user;

GRANT ALL PRIVILEGES ON DATABASE totem_festival TO totem_user;
