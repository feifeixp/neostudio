#!/bin/bash
cd "$(dirname "$0")"
exec /Users/ff/.nvm/versions/node/v18.20.8/bin/node node_modules/.bin/vite --port 3001 --host 0.0.0.0
