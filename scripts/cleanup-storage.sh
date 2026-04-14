#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Lone OS — Storage Cleanup Script
# Runs weekly via cron to free disk space
# Deletes local preview files but preserves DB records + Drive links
# ═══════════════════════════════════════════════════════════

set -euo pipefail

LOG_FILE="/var/log/loneos-cleanup.log"
STORAGE_DIRS=(
  "/opt/loneos/.next/cache"
  "/tmp/loneos-previews"
  "/opt/loneos/public/uploads"
)

# Minimum age in days before file is eligible for cleanup
MIN_AGE_DAYS=7

echo "$(date -Iseconds) [CLEANUP START]" >> "$LOG_FILE"

TOTAL_FREED=0

for DIR in "${STORAGE_DIRS[@]}"; do
  if [ -d "$DIR" ]; then
    # Calculate size before
    SIZE_BEFORE=$(du -sb "$DIR" 2>/dev/null | awk '{print $1}' || echo 0)

    # Delete files older than MIN_AGE_DAYS
    find "$DIR" -type f -mtime +${MIN_AGE_DAYS} \
      \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" \
         -o -name "*.webp" -o -name "*.mp4" -o -name "*.mov" -o -name "*.pdf" \
         -o -name "*.tmp" -o -name "*.cache" \) \
      -delete 2>/dev/null || true

    # Delete empty directories
    find "$DIR" -type d -empty -delete 2>/dev/null || true

    # Calculate size after
    SIZE_AFTER=$(du -sb "$DIR" 2>/dev/null | awk '{print $1}' || echo 0)
    FREED=$((SIZE_BEFORE - SIZE_AFTER))
    TOTAL_FREED=$((TOTAL_FREED + FREED))

    echo "$(date -Iseconds) [DIR] $DIR: freed $(numfmt --to=iec $FREED)" >> "$LOG_FILE"
  fi
done

# Clean Docker build cache (can grow large)
DOCKER_FREED=$(docker system prune -f --filter "until=168h" 2>/dev/null | grep "Total reclaimed" | awk '{print $4$5}' || echo "0B")
echo "$(date -Iseconds) [DOCKER] Reclaimed: $DOCKER_FREED" >> "$LOG_FILE"

# Clean Next.js build cache older than 7 days
if [ -d "/opt/loneos/.next/cache" ]; then
  find /opt/loneos/.next/cache -type f -mtime +7 -delete 2>/dev/null || true
fi

# Save cleanup report to a JSON file for CEO dashboard
DISK_TOTAL=$(df -B1 / | tail -1 | awk '{print $2}')
DISK_USED=$(df -B1 / | tail -1 | awk '{print $3}')
DISK_FREE=$(df -B1 / | tail -1 | awk '{print $4}')
DISK_PCT=$(df / | tail -1 | awk '{print $5}')

cat > /opt/loneos/public/cleanup-report.json << EOF
{
  "lastCleanup": "$(date -Iseconds)",
  "freedBytes": $TOTAL_FREED,
  "freedHuman": "$(numfmt --to=iec $TOTAL_FREED)",
  "dockerReclaimed": "$DOCKER_FREED",
  "disk": {
    "total": $DISK_TOTAL,
    "used": $DISK_USED,
    "free": $DISK_FREE,
    "usedPercent": "$DISK_PCT"
  }
}
EOF

echo "$(date -Iseconds) [CLEANUP DONE] Total freed: $(numfmt --to=iec $TOTAL_FREED) | Disk: $DISK_PCT used" >> "$LOG_FILE"
