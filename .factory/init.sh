#!/bin/bash
set -e

RELAY_DIR="/Users/andy/Documents/GitHub/relay"

# Create project directory if it doesn't exist
if [ ! -d "$RELAY_DIR" ]; then
  mkdir -p "$RELAY_DIR"
fi

# Install dependencies if package.json exists
if [ -f "$RELAY_DIR/package.json" ]; then
  cd "$RELAY_DIR" && npm install
fi

# Ensure Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "ERROR: Docker is not running. Please start Docker Desktop."
  exit 1
fi

# Start MongoDB if docker-compose exists and container isn't running
if [ -f "$RELAY_DIR/docker-compose.yml" ]; then
  if ! docker ps --format '{{.Names}}' | grep -q 'relay-mongodb'; then
    cd "$RELAY_DIR" && docker compose up -d mongodb
    echo "Waiting for MongoDB to be ready..."
    sleep 3
    for i in $(seq 1 15); do
      if docker exec relay-mongodb mongosh --eval "db.runCommand('ping')" --quiet 2>/dev/null; then
        echo "MongoDB is ready."
        break
      fi
      sleep 1
    done
  fi
fi

echo "Init complete. Project dir: $RELAY_DIR"
