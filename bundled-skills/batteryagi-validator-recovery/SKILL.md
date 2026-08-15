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

## 8. SATA SSD / Storage Corruption Recovery (Power Outage)

**Applies to BOTH x86_64 (C-3PO) AND RK3588 ARM (R2-D2) boxes.** After power outages, the external storage device — whether SATA SSD or SD card — can corrupt and remount read-only.

### Dual-Box Corruption Pattern (2026-08-12)

**Critical finding:** Both C-3PO and R2-D2 suffered storage corruption after a power outage. However, the boxes have **DIFFERENT storage configurations** despite both being RK3588 ARM boards.

| Box | Storage Config | Corruption Type |
|-----|---------------|-----------------|
| **C-3PO** | SD card ONLY (108GB overlayroot) | **No SATA SSD** — entire root disk corrupted |
| **R2-D2** | SD card + 1.9TB SATA SSD | SATA SSD (`/dev/sda1`) remounted read-only |

**C-3PO appeared "healthy" for 25 hours** — CometBFT was running but NOT advancing. The only symptom was a frozen `latest_block_height` (`630,522`) with `catching_up=false` (false positive). The actual cause was a corrupted `/storage` symlink pointing to a non-existent SATA SSD.

**Always verify `lsblk` on EACH box before assuming storage layout applies fleet-wide.**

### SATA SSD Intermittent Disappearance Pattern

A critical new finding from 2026-08-12: **the SATA SSD can intermittently vanish from the kernel entirely** (`lsblk` shows no `/dev/sda1`), then **reappear after reboot** as a fully functional 1.9TB drive, only to **corrupt again within minutes**.

This is **hardware failure** (flaky SATA connector or dying SSD controller), not a software issue. The reboot temporarily fixes it because the SATA controller re-initializes.

**Reference:** `references/intermittent-sata-ssd-reboot-pattern.md` for full diagnostic cascade, reboot-vs-format decision tree, and the `mkfs.ext4` agent safety block explanation.

### When to Reboot vs. When to Format

| Scenario | Action | Reason |
|----------|--------|--------|
| SSD missing from `lsblk` | **Reboot first** | SATA controller may re-initialize |
| SSD present but `ro` mount | **Format** if reboot doesn't help | Filesystem corruption |
| Repeated corruption after reboot | **Format** | Dying SSD needs fresh filesystem |
| SSD works after reboot, then fails again | **Replace hardware** | Intermittent hardware failure |

### The "Clean" Fix: Format the SSD (`mkfs.ext4`)

### Symptoms of `/storage` Read-Only Failure

```
# mount shows (ro) instead of (rw)
/dev/sda1 on /storage type ext4 (ro,noatime,nodiratime,commit=120)

# Any data access fails
ls ~/.batterycoin-comet/data/
# → ls: reading directory ...: Input/output error

# CometBFT log shows pexRequest loop but NO block advancement
Ensure peers                                 module=pex numOutPeers=1 numInPeers=3
We need more addresses. Sending pexRequest to random peer
No addresses to dial. Falling back to seeds
```

### The "Clean" Fix: Format the SSD (`mkfs.ext4`)

When `fsck` fails or the SSD remounts read-only, a **full format** often fixes the underlying filesystem:

```bash
# 1. CRITICAL: Back up validator keys FIRST
cp ~/.batterycoin-comet/config/priv_validator_key.json ~/priv_validator_key.json.BACKUP
cp ~/.batterycoin-comet/config/node_key.json ~/node_key.json.BACKUP
cp ~/.batterycoin-comet/data/priv_validator_state.json ~/priv_validator_state.json.BACKUP

# 2. Stop CometBFT
pkill -9 -f "cometbft node"
sleep 3

# 3. Unmount corrupted storage
sudo umount /storage

# 4. FORMAT the SSD (wipes everything, creates fresh filesystem)
sudo mkfs.ext4 -F /dev/sda1

# 5. Remount fresh
sudo mkdir -p /storage
sudo mount /dev/sda1 /storage

# 6. Recreate BatteryAGI data directory
sudo mkdir -p /storage/batteryagi/<node>-comet-data
sudo chown -R hyperai:hyperai /storage/batteryagi

# 7. If data exists on home dir, move it to /storage
mv ~/.batterycoin-comet/data/* /storage/batteryagi/<node>-comet-data/
rm -f ~/.batterycoin-comet/data
ln -s /storage/batteryagi/<node>-comet-data ~/.batterycoin-comet/data

# 8. Restore validator state
cp ~/priv_validator_state.json.BACKUP ~/.batterycoin-comet/data/priv_validator_state.json

# 9. Restart CometBFT
tmux new-session -d -s cometbft \
  'cd /home/hyperai && cometbft node --home /home/hyperai/.batterycoin-comet --proxy_app=kvstore 2>&1 | tee /home/hyperai/<node>-cometbft.log'
```

**⚠️ Agent safety block:** `mkfs.ext4` is on the agent's unconditional blocklist — it CANNOT be executed via SSH through the agent. The user MUST run these commands locally on each box.

### USB Device Claims `/dev/sda` After Power Outage (2026-08-13)

**New pattern:** A USB storage device (e.g. Kingston DataTraveler) can be detected BEFORE the SATA SSD after a power outage, causing the USB to claim `/dev/sda` and the real SSD to shift to `/dev/sdb1`.

**Result:** `/etc/fstab` mounts the WRONG device (115GB FAT32 USB stick) as `/storage` instead of the real 1.9TB SSD.

#### Symptoms
```bash
lsblk
# sda            8:0    1 115.5G  0 disk    ← USB stick (wrong!)
# └─sda1         8:1    1 115.5G  0 part
# sdb            8:16   0   1.9T   0 disk    ← Real SSD (shifted!)
# └─sdb1         8:17   0   1.9T   0 part

mount | grep storage
# /dev/sda1 on /storage type vfat (rw,relatime)  ← WRONG filesystem!

touch /storage/test-write
# WRITE_FAIL
```

#### Fix
```bash
# 1. Unmount wrong device
sudo umount /storage

# 2. Mount correct device
sudo mount /dev/sdb1 /storage

# 3. Update fstab to use UUID (permanent fix)
SSD_UUID=$(sudo blkid /dev/sdb1 | grep -oP 'UUID="\K[^"]+')
echo "UUID=$SSD_UUID /storage ext4 defaults,noatime 0 2" | sudo tee /etc/fstab.storage
sudo sed -i '/storage/d' /etc/fstab
sudo cat /etc/fstab.storage | sudo tee -a /etc/fstab > /dev/null

# 4. Verify
mount | grep storage
# → /dev/sdb1 on /storage type ext4 (rw,relatime)
```

**Prevention:** Always use `UUID=` instead of `/dev/sdX` in `/etc/fstab`:
```bash
# Get UUID
sudo blkid /dev/sdb1
# → UUID="61b4ad0a-36c2-408d-82ef-acfcc08a21b5"

# Update fstab to use UUID (permanent fix)
echo 'UUID=61b4ad0a-36c2-408d-82ef-acfcc08a21b5 /storage ext4 defaults,noatime 0 2' | sudo tee -a /etc/fstab
```

See `references/usb-device-ssd-shift-post-power-outage.md` for full details.

### RK3588 SD Card Corruption (also applies)

RK3588 boards use SD cards which are ALSO prone to corruption after power outages. Symptoms:

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

### "umount: /storage: target is busy" Fix

When trying to unmount `/storage` for formatting, you may get "target is busy". This means a process still has files open on `/storage`:

```bash
# Find what's holding /storage
sudo lsof /storage | head -10
# → Often cardano-node, python, or dockerd

# Kill the process
sudo pkill -9 -f 'cardano-node'
sleep 2

# Try unmount again
sudo umount /storage
# → If still busy, use lazy unmount:
sudo umount -f -l /storage
```

**C-3PO had cardano-node (PID 1644) holding /storage open** during the 2026-08-12 update attempt. Killing it allowed the unmount to proceed.

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

### Sync Status Check Cascade (Cron / Monitoring)

When checking if validators are synced, run checks in this order. Each step tells you something different about failure mode:

```bash
# 1. Is the box reachable at all?
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -o ConnectTimeout=10 -o BatchMode=yes hyperai@<IP> "echo OK" 2>/dev/null
# → "OK" = box is up; timeout = box down or network issue

# 2. Is CometBFT process running?
ssh hyperai@<IP> "pgrep -af 'cometbft node' || echo 'NO_PROCESS'"
# → process lines = running; NO_PROCESS = box up, validator down

# 3. Is RPC port listening?
ssh hyperai@<IP> "ss -tlnp | grep 26657 || echo 'PORT_DOWN'"
# → listening = RPC up; PORT_DOWN = process missing or crashed

# 4. RPC responds with valid JSON?
ssh hyperai@<IP> "curl -s --max-time 10 http://localhost:26657/status | \
  python3 -c 'import sys,json; d=json.load(sys.stdin); s=d[\"result\"][\"sync_info\"]; \
  print(\"height=\"+s[\"latest_block_height\"]+\" catching_up=\"+str(s[\"catching_up\"]))'"
# → height + catching_up = healthy; JSON decode error = empty response (port open but no handler)

# 5. Peers?
ssh hyperai@<IP> "curl -s --max-time 10 http://localhost:26657/net_info | \
  python3 -c 'import sys,json; d=json.load(sys.stdin); print(\"n_peers=\"+str(len(d[\"result\"][\"peers\"])))'"
# → n_peers=N = meshed; n_peers=0 = isolated

# 6. Validator state (R2-D2 only — native deployment)
ssh hyperai@<IP> "cat ~/.batterycoin-comet/data/priv_validator_state.json | \
  python3 -c 'import sys,json; d=json.load(sys.stdin); print(\"val_height=\"+d[\"height\"]+\" step=\"+str(d[\"step\"]))'"
# → val_height = last signed height (STALE if process not running!)
```

### Failure Mode Decision Tree

| Symptom | Failure Mode | Action |
|---------|-------------|--------|
| SSH timeout | Box down / network unreachable | Check power, Tailscale, physical network |
| SSH OK, `pgrep` empty | Box up, CometBFT NOT running | Start CometBFT (tmux or systemd) |
| Process running, port DOWN | CometBFT crashed / port binding failed | Check logs, restart |
| Port listening, empty JSON | RPC handler broken / startup incomplete | Wait 30s, retry; if still broken, restart |
| RPC OK, `catching_up=true` | Normal sync — catching up to tip | Wait, monitor height advancement |
| RPC OK, `catching_up=false`, `n_peers=0` | Synced but ISOLATED — no peers | Check `persistent_peers`, UFW, Tailscale |
| RPC OK, `catching_up=false`, `n_peers>=2` | **HEALTHY** — fully synced + peered | ✅ Victory condition met |
| `val_height` present but process dead | Stale validator state — box rebooted without auto-start | Start CometBFT, set up `@reboot` cron |

**Critical:** `priv_validator_state.json` shows the LAST signed height. If the process is NOT running, this height is **stale** — the validator is NOT actively signing. Always pair validator-state checks with a process check (`pgrep` or `ss -tlnp`).

### Native CometBFT Auto-Start Gap

On RK3588 boxes running native CometBFT (outside Docker), there is often **NO systemd service** for the validator. CometBFT may have been started manually in tmux or via a one-off cron, and will NOT survive reboot.

**Check for service:**
```bash
systemctl list-unit-files --type=service | grep -i -E 'battery|comet|stargate|validator'
# → empty output means NO auto-start service exists
```

**If no service exists, add `@reboot` cron:**
```bash
(crontab -l 2>/dev/null; echo '@reboot sleep 30 && tmux new-session -d -s cometbft "cd /home/hyperai && cometbft node --home /home/hyperai/.batterycoin-comet --proxy_app=kvstore 2>&1 | tee /home/hyperai/r2d2-cometbft.log"') | crontab -
```

**Or create a minimal systemd service:**
```bash
# /etc/systemd/system/batterycoin-comet.service
[Unit]
Description=BatteryAGI CometBFT Validator
After=network.target

[Service]
Type=simple
User=hyperai
WorkingDirectory=/home/hyperai
ExecStart=/usr/local/bin/cometbft node --home /home/hyperai/.batterycoin-comet --proxy_app=kvstore
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```
Then: `sudo systemctl enable --now batterycoin-comet.service`

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

### Node Manager v0.5.4 `su` Authentication Failure (Non-Interactive SSH)

**Applies to:** RK3588 ARM boards (C-3PO, R2-D2). Discovered 2026-08-12.

The HyperCycle Node Manager v0.5.4 `start_all.sh` script uses `su -c` to run the backend as the `hypercycle` user:

```bash
# In start_all.sh:
su -c '$PWD/start_manager.sh ../../../config/config.yaml > /dev/null' "$user" &
su -c '$PWD/start_admin_ui.sh ../../config/.env > /dev/null' "$user" &
```

This works in an **interactive local shell** but **fails in non-interactive SSH** with:
```
Authentication failure
```

#### Why It Fails

| Context | Result |
|---------|--------|
| Interactive SSH with `su` | Prompts for password → works if password known |
| Non-interactive SSH / systemd | `su` cannot prompt → fails silently |
| `sudo -n -u hypercycle` | Also fails because `hypercycle` has no NOPASSWD rule |

#### Workaround: Direct Execution (No `su`)

Run the backend components directly as the current user (e.g. `hyperai`), bypassing `su` entirely:

```bash
# 1. Kill old processes
pkill -f 'controller_serve'
pkill -f 'vite'
pkill -f 'esbuild'

# 2. Start backend directly (no su)
cd /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_backend/node_controller
./controller_serve --config=../../../config/config.yaml --admin &
./controller_serve --config=../../../config/config.yaml --merkle &
./controller_serve --config=../../../config/config.yaml &

# 3. Start UI directly
cd /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_ui
cp ../../config/.env ./
npx vite --host 0.0.0.0 --port 8006 &
```

#### Systemd Service Workaround

For auto-start on boot, replace the init.d script with a systemd service that runs directly:

```bash
# /etc/systemd/system/hypercycle-054.service
[Unit]
Description=HyperCycle Node Manager v0.5.4
After=network.target mongod.service

[Service]
Type=forking
User=hyperai
WorkingDirectory=/home/hypercycle/hypercycle-manager-0.5.4-arm64
ExecStartPre=/bin/sleep 10
ExecStart=/bin/bash -c 'cd /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_backend/node_controller && ./controller_serve --config=../../../config/config.yaml --admin >> /tmp/hc-admin.log 2>&1 & ./controller_serve --config=../../../config/config.yaml --merkle >> /tmp/hc-merkle.log 2>&1 & ./controller_serve --config=../../../config/config.yaml >> /tmp/hc-server.log 2>&1 & cd /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_ui && cp ../../config/.env ./ && npx vite --host 0.0.0.0 --port 8006 >> /tmp/hc-ui.log 2>&1 &'
ExecStop=/bin/bash -c 'pkill -f controller_serve; pkill -f vite; pkill -f esbuild'
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable hypercycle-054.service
sudo systemctl start hypercycle-054.service
```

#### glibc Version Mismatch (Ubuntu 20.04 vs 22.04)

**R2-D2 (Ubuntu 20.04, glibc 2.31)** cannot run the v0.5.4 binary compiled for glibc 2.35:

```
Failed to load Python shared library '/tmp/_MEIxxx/libpython3.10.so.1.0':
/lib/aarch64-linux-gnu/libm.so.6: version `GLIBC_2.35' not found
```

| Machine | OS | glibc | HC v0.5.4 |
|---------|-----|-------|-----------|
| C-3PO | Ubuntu 22.04 | 2.35 | ✅ Works |
| R2-D2 | Ubuntu 20.04 | 2.31 | ❌ Crashes |
| AtomMan | Ubuntu 24.04 | 2.39 | ✅ Works |

**Fix:** Keep R2-D2 on v0.5.1 (or earlier), or upgrade Ubuntu to 22.04+.

**Note:** The v0.5.0 binary on R2-D2 was ALSO compiled for glibc 2.35 — it only appeared to work because old processes survived from before a prior update. Once killed, they cannot restart.

---

#### Missing `node_modules` in v0.5.4 Tarball

The v0.5.4 tarball does NOT include `node_modules` for the UI. If you try to start the UI without them:

```bash
cd /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_ui
npx vite --host 0.0.0.0 --port 8006
# → Error: Cannot find module 'vite'
```

**Fix:** Copy `node_modules` from the previous version:
```bash
cp -r /home/hypercycle/hypercycle-manager-0.5.0-arm64/controller_ui/node_modules \
  /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_ui/
```

Also copy the `.env` file:
```bash
cp /home/hypercycle/hypercycle-manager-0.5.0-arm64/controller_ui/.env \
  /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_ui/
# Or from config dir:
cp /home/hypercycle/config/.env \
  /home/hypercycle/hypercycle-manager-0.5.4-arm64/controller_ui/
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
