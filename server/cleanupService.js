
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Service to manage file cleanup on session end
 */
class CleanupService {
    // ... existing constructor ... 
    constructor() {
        this.sessions = new Map(); // sessionId -> Set of file paths
        this.cleanupTimeout = 30 * 60 * 1000; // 30 minutes
        this.timers = new Map(); // sessionId -> timeout
    }

    // ... existing methods ...

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
                await fs.unlink(filePath);
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
            const uploadsDir = path.join(__dirname, '../uploads');
            // Be careful to not delete ../uploads/brands if it exists!
            // The previous logic was: await fs.rm(uploadsDir, { recursive: true, force: true });
            // This deletes EVERYTHING.

            // Let's only delete 'images' subdir and files in root uploads
            // Or ensure we don't delete 'brands'

            // For now, let's just create if missing, but maybe we shouldn't wipe the whole dir if brands are there?
            // User requested "separate file for each brand". I put JSON in server/data/brands.
            // But Multer puts IMAGES in uploads/brands.
            // If I wipe uploads/, I wipe brand images.
            // FIX: Only wipe uploads/tmp or similar? Or iterate.

            // Let's iterate and delete everything EXCEPT 'brands' folder.
            const entries = await fs.readdir(uploadsDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === 'brands') continue;
                const fullPath = path.join(uploadsDir, entry.name);
                await fs.rm(fullPath, { recursive: true, force: true });
            }
        } catch (error) {
            // console.error('Failed to clean uploads directory:', error.message);
        }
    }
}

export { CleanupService };
