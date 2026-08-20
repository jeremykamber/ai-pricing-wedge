# Orphaned Node Watchdog

A LaunchAgent that automatically kills orphaned Node.js processes — worker
children whose parent died, leaking memory indefinitely.

## How it works

Every 5 minutes, `launchd` runs `~/.local/bin/kill-orphan-nodes.sh`. The script
finds any Node process whose parent is PID 1 (`launchd` itself — meaning the
original parent crashed or was killed) and has been running >5 minutes, then
kills it.

This catches orphans from any project, not just Kynd. Raycast's bundled Node
runtime is excluded.

## Files

| File | Purpose |
|------|---------|
| `~/.local/bin/kill-orphan-nodes.sh` | The cleanup script |
| `~/Library/LaunchAgents/com.jeremykamber.orphan-node-watchdog.plist` | LaunchAgent config |
| `/tmp/com.jeremykamber.orphan-node-watchdog.log` | Execution log |

## Manual use

```bash
~/.local/bin/kill-orphan-nodes.sh       # run once
npm run cleanup                          # same, from Kynd
```

## Management

```bash
launchctl list | grep orphan             # check if loaded
launchctl stop com.jeremykamber.orphan-node-watchdog   # stop next run
launchctl unload ~/Library/LaunchAgents/com.jeremykamber.orphan-node-watchdog.plist   # disable permanently
launchctl load ~/Library/LaunchAgents/com.jeremykamber.orphan-node-watchdog.plist     # re-enable
```
