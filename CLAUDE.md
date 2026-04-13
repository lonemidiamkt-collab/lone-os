# Lone OS — Project Context

## VPS Production Server
- **Provider**: Hostinger KVM 1
- **IP**: 72.60.142.252
- **User**: root
- **SSH Command**: `ssh -i ~/.ssh/loneos_vps root@72.60.142.252`
- **SSH Key**: ~/.ssh/loneos_vps (ed25519, email: lonemidiamkt@gmail.com)
- **Specs**: 1 vCPU, 4GB RAM, 50GB NVMe

## Domain
- **URL**: https://painel.lonemidia.com
- **DNS**: Cloudflare (proxied)
- **SSL**: Cloudflare (proxy mode — handles HTTPS automatically)

## Deploy Stack
- Docker + Docker Compose
- Next.js standalone + PostgreSQL 16
- Nginx reverse proxy (port 80 → 3000)
- SSL via Cloudflare proxy

## Brand
- **Company**: Lone Midia
- **Primary Color (LM Blue)**: #0d4af5
- **No financial data in system** (no MRR/ARR/LTV by CEO request)
