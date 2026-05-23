#!/usr/bin/env bash
# AI Relay — 本地 CI 自检脚本
# 用法: bash scripts/ci-local.sh
# 会依次跑: install → lint → type-check → build

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
step() { echo -e "\n${YELLOW}▶ $1${NC}"; }

# ── Step 1: Install ──
step "Installing dependencies..."
npm ci 2>/dev/null || npm install
pass "Dependencies installed"

# ── Step 2: Lint ──
step "Running lint..."
npm run lint
pass "Lint passed"

# ── Step 3: Type Check ──
step "Running type-check..."
npm run type-check
pass "Type check passed"

# ── Step 4: Build ──
step "Running build..."
DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/dummy}" npm run build
pass "Build passed"

echo ""
echo -e "${GREEN}══════════════════════════════════════${NC}"
echo -e "${GREEN}  All CI stages passed! ✓${NC}"
echo -e "${GREEN}══════════════════════════════════════${NC}"
