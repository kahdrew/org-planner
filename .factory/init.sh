#!/bin/bash
set -e

cd /Users/andy/Documents/GitHub/org-planner

# Install dependencies (idempotent)
npm install

# Ensure .env exists for server
if [ ! -f packages/server/.env ]; then
  cp packages/server/.env.example packages/server/.env
  echo "WARNING: .env created from .env.example — update MONGODB_URI and JWT_SECRET"
fi
