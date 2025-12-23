import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Service to manage file cleanup on session end
 */
class CleanupService {
    constructor() {
        this.sessions = new Map(); // sessionId -> Set of file paths
        this.cleanupTimeout = 30 * 60 * 1000; // 30 minutes
        this.timers = new Map(); // sessionId -> timeout
    }

    trackFile(sessionId, filePath) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, new Set());
        }
        this.sessions.get(sessionId).add(filePath);
        this.resetCleanupTimer(sessionId);
    }

    resetCleanupTimer(sessionId) {
        if (this.timers.has(sessionId)) {
            clearTimeout(this.timers.get(sessionId));
        }
        const timer = setTimeout(() => {
            this.cleanupSession(sessionId);
        }, this.cleanupTimeout);
        this.timers.set(sessionId, timer);
    }

    async cleanupSession(sessionId) {
        const filePaths = this.sessions.get(sessionId);
        if (!filePaths || filePaths.size === 0) return;
        for (const filePath of filePaths) {
            try {
                // Only attempt delete if file exists
                const exists = await fs.access(filePath).then(() => true).catch(() => false);
                if (exists) await fs.unlink(filePath);
            } catch (error) {
                console.error(`Failed to delete ${filePath}:`, error.message);
            }
        }
        this.sessions.delete(sessionId);
        if (this.timers.has(sessionId)) {
            clearTimeout(this.timers.get(sessionId));
            this.timers.delete(sessionId);
        }
    }

    async cleanupAll() {
        for (const sessionId of this.sessions.keys()) {
            await this.cleanupSession(sessionId);
        }

        try {
            const isVercel = process.env.VERCEL === '1';
            const uploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, '../uploads');

            const exists = await fs.access(uploadsDir).then(() => true).catch(() => false);
            if (!exists) return;

            const entries = await fs.readdir(uploadsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'brands') continue;
                const fullPath = path.join(uploadsDir, entry.name);
                try {
                    await fs.rm(fullPath, { recursive: true, force: true });
                } catch (e) { /* silent skip */ }
            }
        } catch (error) {
            console.warn('[Cleanup] Bulk cleanup skipped:', error.message);
        }
    }
}

export { CleanupService };
