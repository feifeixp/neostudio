# Neodomain CLI - AI Agent Tool Manual

This document is instructions to AI Agents (like OpenClaw, Claude Code, Cursor, etc.) on how to use `neodomain-cli` autonomously to interact with Neodomain services.

## Overview
The `neodomain-cli` outputs STRICT JSON format for all its commands to ensure predictability for LLMs. Any error will provide an `error` key or `errCode` key in the JSON output on stdout/stderr.

## Command Structure

```bash
npx --yes neodomain-cli <module> <action> [--param value]
```
*(Or if installed globally: `neodomain <module> <action> [--param value]`)*

> **Tokens**: If an endpoint requires an authorization token, pass it via `--token "your-jwt-token"` or set the `NEODOMAIN_ACCESS_TOKEN` environment variable. By default it hits the DEV endpoint. To hit prod, pass `--env prod`.

---

## 1. Auth Module (`auth`)

### 1.1 Send Unified Code
```bash
neodomain auth send-code --contact "user@example.com"
```
**Expected Output**: `{ "success": true, "errCode": "200", ... }`

### 1.2 Unified Login
```bash
neodomain auth unified-login --contact "user@example.com" --code "123456"
```
**Expected Output**: Lists available identities (`identities` array) for step 1.3.

### 1.3 Select Identity & Get Token
```bash
neodomain auth select-identity --contact "user@example.com" --userId "12345"
```
**Expected Output**: Returns `{ "data": { "authorization": "JWT_HERE", ... } }`. **EXTRACT** this authorization token for subsequent API calls.

---

## 2. Video Module (`video`)

### 2.1 Get Universal Video Models
```bash
neodomain video get-models --token "<your-token>"
```
**Expected Output**: Array of supported modes (`kling-v3-omni`, etc), generation types (T2V, U2V), durations, and costs.

### 2.2 Generate Video
```bash
neodomain video generate \
  --token "<your-token>" \
  --modelName "kling-v3-omni" \
  --generationType "T2V" \
  --prompt "A dog flying in space"
```
**Expected Output**: `{ "data": { "generationRecordId": "gen_xxx", "status": "PENDING" } }`

---

## 3. Image Module (`image`)

### 3.1 Get Models
```bash
neodomain image get-models --token "<your-token>"
```
**Expected Output**: Supported models like `doubao-seedream-4-0` and parameter ranges.

### 3.2 Generate Image
```bash
neodomain image generate \
  --token "<your-token>" \
  --modelName "doubao-seedream-4-0" \
  --prompt "A beautiful digital artwork" \
  --numImages 1
```
**Expected Output**: `{ "data": { "task_code": "IMG_GEN_XXX" } }`

### 3.3 Query Image Result
```bash
neodomain image query --token "<your-token>" --taskCode "IMG_GEN_XXX"
```
**Expected Output**: Checks if process is PENDING or SUCCESS. If SUCCESS, contains `image_urls`.

---

## 4. Payment & Project Modules

**Projects List**:
```bash
neodomain project list --token "<your-token>"
```

**Create Order**:
```bash
neodomain pay create --token "<your-token>" --subject "Credits" --amount 9.9
```

**Query Order Status**:
```bash
neodomain pay status --token "<your-token>" --orderNo "2026xxxx"
```

## AI Agent Integration Best Practices

1. **Wait and Poll**: For video and image tasks returning `PENDING`, AI agents should write a simple bash loop using the `query` command with sleep (`sleep 5`) to poll for completion.
2. **Handle Errors Logically**: If `"success": false` and `errCode` is returned, adjust your parameters according to the error message (e.g., `INSUFFICIENT_POINTS` means you should prompt the user to use the pay module).
3. **Parse Safely**: Extract the JSON block reliably. The tool guarantees the last output stream is valid JSON.
