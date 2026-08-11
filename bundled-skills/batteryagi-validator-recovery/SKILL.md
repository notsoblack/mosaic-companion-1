---
name: batteryagi-validator-recovery
description: Recover BatteryAGI CometBFT validators after crashes.
trigger: Use when a BatteryAGI validator node is offline, not syncing, or disk is full.
---

# BatteryAGI Validator Recovery on ARM Boxes

## ⚠️ CRITICAL: RK3588 Storage Architecture

**DO NOT assume `/storage` is a separate mount.** On RK3588 ARM boards:
- `/storage` is often just a directory on the **same root disk**
- The root disk is typically a **108GB SD card** (`/dev/mmcblk0p7` → `/userdata`)
- `overlayroot` mounts on top of `/userdata`
- **Always verify** with `lsblk -f` and `mount | grep storage` before moving data

**Key directories on root disk:**
| Path | Typical Size | Notes |
|------|-------------|-------|
| `/storage/mongodb` | **55GB+** | MongoDB data — can often be compacted |
| `/storage/swapfile` | **33GB** | Often unused if RAM ≥16GB — safe to delete |
| `/usr` | 33GB | System packages |
| `/home` | 26GB+ | User data, snap, projects |
| `/var` | 27GB+ | Logs, Docker, apt cache |

### Quick Storage Diagnosis
```bash
# Verify if /storage is separate mount
lsblk -f | head -20
mount | grep -E 'storage|overlay|mmcblk0p7'
df -h / /storage /userdata

# Find what's eating space
sudo du -sh /storage/* /home/* /var/* 2>/dev/null | sort -hr | head -20
```

## 1. Pre-Flight Checks

Check in this order every time:

```bash
# 1. Is the box reachable?
ping <TAILSCALE_IP>
ssh -o ConnectTimeout=10 hyperai@<TAILSCALE_IP> "echo 'OK'"

# 2. Is CometBFT running?
pgrep -af 'cometbft node'
tmux ls

# 3. Is RPC responding?
curl -s --max-time 10 http://localhost:26657/status | grep -E 'latest_block_height|catching_up'

# 4. Is disk full? (Most common root cause)
df -h /

# 5. Check data directory
ls -la ~/.batterycoin-comet/data
du -sh ~/.batterycoin-comet/data/
```

## 2. Disk Full Recovery

### Immediate Safe Cleanup (no data loss)

```bash
# A. Truncate CometBFT log (fast, +tens of MB)
truncate -s 0 /home/hyperai/r2d2-cometbft.log

# B. Vacuum system journals (fast, +hundreds of MB)
sudo journalctl --vacuum-time=1d

# C. Clean apt cache
sudo apt-get clean

# D. Remove inactive swapfile (HUGE win: +33GB on RK3588)
# Check first: swapon --show
sudo swapoff /storage/swapfile 2>/dev/null
sudo rm -f /storage/swapfile

# E. Clean MongoDB diagnostic data (safe if MongoDB stopped)
sudo systemctl stop mongod 2>/dev/null
sudo rm -rf /storage/mongodb/diagnostic.data/*
sudo rm -rf /storage/mongodb/journal/prealloc.*
```

### ⚠️ NEVER Delete Without Approval
User preference: **move to `/storage` rather than delete**. But on RK3588 boxes, this may not free root disk space — `/storage` is on root disk!

## 3. Data Directory Recovery

### The Broken Symlink Problem

The data directory may be a symlink to `/storage/batteryagi/r2d2-comet-data`. If the target is missing or root disk is full:

```bash
# Check symlink
ls -la ~/.batterycoin-comet/data
readlink -f ~/.batterycoin-comet/data

# If target is missing, CometBFT panics with:
# "mkdir /home/hyperai/.batterycoin-comet/data: file exists"
```

### Restore from `data.rootdisk-backup`

If CometBFT was reset with `unsafe-reset-all`, the old data is lost BUT a backup exists:

```bash
# Remove broken data dir
rm -rf ~/.batterycoin-comet/data

# Option A: Restore from pre-ceremony backup (saves replay time)
# This backup is at height ~12,844 (pre-genesis ceremony)
cp -r ~/.batterycoin-comet/data.rootdisk-backup ~/.batterycoin-comet/data

# Option B: Start fresh (replays from genesis — very slow)
cometbft unsafe-reset-all --home ~/.batterycoin-comet
```

### Data on Real External Storage

If the box DOES have a separate `/storage` mount (verify first!):

```bash
# Move data to external storage
mkdir -p /storage/batteryagi/r2d2-comet-data
rsync -aH --info=progress2 ~/.batterycoin-comet/data/* /storage/batteryagi/r2d2-comet-data/
rm -rf ~/.batterycoin-comet/data
ln -s /storage/batteryagi/r2d2-comet-data ~/.batterycoin-comet/data
```

## 4. Restart Procedure

Always use **tmux** for persistence:

```bash
# Kill old session if exists
tmux kill-session -t cometbft 2>/dev/null
pkill -f 'cometbft node'
sleep 2

# Start fresh under tmux
tmux new-session -d -s cometbft \
  'cd /home/hyperai && cometbft node --home /home/hyperai/.batterycoin-comet --proxy_app=kvstore 2>&1 | tee /home/hyperai/r2d2-cometbft.log'

# Reduce log verbosity to save disk
sed -i 's/^log_level.*/log_level = "error"/g' ~/.batterycoin-comet/config/config.toml
```

## 5. Peer Connectivity Fixes

If nodes can't see each other:

```bash
# Check UFW — Tailscale IPs need specific rules
sudo ufw status numbered | grep 26656
sudo ufw allow in on tailscale0 proto tcp to any port 26656
sudo ufw allow in on tailscale0 proto tcp to any port 26657

# Check persistent_peers in config
grep persistent_peers ~/.batterycoin-comet/config/config.toml

# Verify P2P reachability
nc -vz <PEER_TAILSCALE_IP> 26656
```

## 6. Auto-Restart on Boot

```bash
# Add to crontab for automatic restart after reboot
(crontab -l 2>/dev/null; echo '@reboot sleep 30 && tmux new-session -d -s cometbft "cd /home/hyperai && cometbft node --home /home/hyperai/.batterycoin-comet --proxy_app=kvstore 2>&1 | tee /home/hyperai/r2d2-cometbft.log"') | crontab -
```

## 7. Disable Desktop to Save RAM

Adgas optimization — saves ~400MB RAM on headless boxes:

```bash
# Disable auto desktop start
sudo systemctl disable gdm3

# Stop desktop now
sudo systemctl stop gdm3
```

## 8. SD Card Corruption Recovery (Power Outage)

RK3588 boards use SD cards which are prone to corruption after power outages. Symptoms:

```
EXT4-fs error (device sda1): reading directory lblock 0
pebble: backing file error: input/output error
```

### Recovery Steps

```bash
# 1. Stop CometBFT immediately
pkill -9 -f 'cometbft node'

# 2. Check if data is readable
ls ~/.batterycoin-comet/data/blockstore.db/ 2>&1
# If "Input/output error" → corruption confirmed

# 3. Remove corrupted symlink/data
rm -f ~/.batterycoin-comet/data

# 4. Restore from backup (saves replaying from genesis)
# data.rootdisk-backup is created by the install script at height ~12,844
cp -r ~/.batterycoin-comet/data.rootdisk-backup ~/.batterycoin-comet/data

# 5. If /storage is also corrupted, use home dir directly
# (backup is always on home dir, not symlinked)

# 6. Restart and resync
tmux new-session -d -s cometbft \
  'cd /home/hyperai && cometbft node --home /home/hyperai/.batterycoin-comet --proxy_app=kvstore 2>&1 | tee /home/hyperai/r2d2-cometbft.log'
```

### The `data.rootdisk-backup` Safety Net

The genesis ceremony package creates `data.rootdisk-backup` alongside the main data dir. This is a **pre-ceremony snapshot** at height ~12,844:

| File | Height | Size | Purpose |
|------|--------|------|---------|
| `data/` (current) | Tip | ~2-6GB | Live chain data |
| `data.rootdisk-backup` | ~12,844 | ~162MB | **Recovery fallback** |

**Never delete `data.rootdisk-backup`** — it's the only way to recover without replaying from genesis.

## 9. Health Monitoring Cron

Set up automatic health checks every 3 hours:

```bash
# Via Hermes cronjob — checks both nodes and reports issues
# Job checks: height, catching_up, peers, disk usage, process status
```

Manual one-liner for quick status:
```bash
# Both nodes
for IP in 100.92.116.49 100.94.115.120; do
  echo "=== $IP ==="
  ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o ConnectTimeout=10 hyperai@$IP \
    "curl -s --max-time 5 http://localhost:26657/status | grep -E 'latest_block_height|catching_up' 2>/dev/null || echo 'RPC_DOWN'"
done
```

## Pitfalls

| Pitfall | Why It Happens | Prevention |
|---------|---------------|------------|
| `/storage` is root disk | RK3588 has no separate drive | Always run `lsblk` first |
| `unsafe-reset-all` loses everything | Clears all block history | Use `data.rootdisk-backup` instead |
| Swapfile eats 33GB | Default Ubuntu creates huge swap | Delete if RAM ≥16GB and swap unused |
| MongoDB grows to 55GB+ | HyperCycle Node Manager uses it | Compact/clean when MongoDB stopped |
| Hermes request dumps eat 19GB+ | `.hermes/profiles/*/sessions/request_dump_*` | Safe to delete (log files, not config) |
| tmux log stops writing | `tee` process dies, CometBFT continues | Use `tmux capture-pane` to check live output |
| tmux can't create sockets | `/tmp` on root disk full | Truncate logs, clean caches, or use `truncate -s 0` on log files |
| **SD card corruption after power outage** | SD cards are fragile | Keep `data.rootdisk-backup`, use UPS if possible |
| **I/O errors on blockstore.db** | SD card bad blocks | Restore from backup immediately, don't retry writes |
| **Moving data to `/storage` after corruption** | `/storage` is same corrupted disk | Use home dir directly, or replace SD card |
