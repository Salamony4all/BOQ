import { useState, useEffect, useRef } from 'react';
import styles from '../styles/AddBrandModal.module.css';
import { useScraping } from '../context/ScrapingContext';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

export default function AddBrandModal({ isOpen, onClose, onBrandAdded, onBrandUpdated }) {
    const [name, setName] = useState('');
    const [website, setWebsite] = useState('');
    const [origin, setOrigin] = useState('');
    const [budgetTier, setBudgetTier] = useState('mid');
    const [scrapingMethod, setScrapingMethod] = useState('ai');
    const [loading, setLoading] = useState(false);

    // DB Management State
    const [allBrands, setAllBrands] = useState([]);
    const [importingId, setImportingId] = useState(null);
    const fileInputRef = useRef(null);

    // Global scraping context
    const { isActive: isScrapingActive, startScraping, updateProgress, completeScraping, failScraping } = useScraping();

    useEffect(() => {
        if (isOpen) {
            fetchBrands();
        }
    }, [isOpen]);

    const fetchBrands = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/brands`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setAllBrands(data.sort((a, b) => a.name.localeCompare(b.name)));
            }
        } catch (err) {
            console.error('Failed to fetch brands:', err);
        }
    };

    if (!isOpen) return null;

    const handleScraping = async (e) => {
        e.preventDefault();
        setLoading(true);

        // Start global scraping indicator (initially without taskId, will update when received)
        startScraping(name, (data) => {
            // On complete callback
            if (data.success) {
                onBrandAdded(data.brand);
                fetchBrands(); // Refresh list
            }
        }, (error) => {
            // On error callback
            alert('Scraping failed: ' + error.message);
        });

        // Close the modal - scraping continues in background via global context
        onClose();

        try {
            const endpoint = scrapingMethod === 'ai'
                ? `${API_BASE}/api/scrape-ai`
                : `${API_BASE}/api/scrape-brand`;

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, url: website, origin, budgetTier })
            });

            if (!res.ok) throw new Error('Failed to start scraping');
            const startData = await res.json();
            const taskId = startData.taskId;

            // Update context with taskId so it can be cancelled
            startScraping(name, (data) => {
                if (data.success) {
                    onBrandAdded(data.brand);
                    fetchBrands();
                }
            }, (error) => {
                alert('Scraping failed: ' + error.message);
            }, taskId);

            // Poll for status
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${API_BASE}/api/tasks/${taskId}`);
                    if (!statusRes.ok) return;
                    const task = await statusRes.json();

                    if (task.status === 'completed') {
                        clearInterval(pollInterval);
                        updateProgress(100, 'Complete!');
                        setTimeout(() => {
                            setLoading(false);
                            onBrandAdded(task.brand);
                            completeScraping(task);
                            fetchBrands();
                        }, 500);
                    } else if (task.status === 'failed') {
                        clearInterval(pollInterval);
                        setLoading(false);
                        failScraping(new Error(task.error || 'Scraping failed'));
                    } else if (task.status === 'cancelled') {
                        clearInterval(pollInterval);
                        setLoading(false);
                    } else {
                        // Update progress from server task
                        updateProgress(task.progress || 50, task.stage || 'Processing...', task.brandName);
                    }
                } catch (e) {
                    console.error('Polling error:', e);
                }
            }, 2000);

        } catch (error) {
            console.error('Scraping Error:', error);
            setLoading(false);
            failScraping(error);
        }
    };

    const handleDownloadDB = (brandId) => {
        window.open(`${API_BASE}/api/brands/${brandId}/export`, '_blank');
    };

    const handleUploadClick = (brandId) => {
        setImportingId(brandId);
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file || !importingId) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API_BASE}/api/brands/${importingId}/import`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                alert(`Database for brand updated successfully! (${data.count} products)`);
                fetchBrands();
                if (onBrandUpdated) onBrandUpdated();
            } else {
                throw new Error(data.error || 'Update failed');
            }
        } catch (e) {
            console.error('Import error:', e);
            alert("Upload failed: " + e.message);
        } finally {
            setImportingId(null);
            e.target.value = ''; // Reset input
        }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.title}>➕ Brand Management</div>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                <div className={styles.content}>
                    {/* Add Brand Section */}
                    <div className={styles.sectionTitle}>🚀 Add New Brand</div>
                    <div className={styles.description}>
                        Enter brand website or Architonic collection link to scrape products automatically.
                    </div>

                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Brand Name *</label>
                            <input className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Herman Miller" />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Website / Architonic Link *</label>
                            <input className={styles.input} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Origin</label>
                            <input className={styles.input} value={origin} onChange={e => setOrigin(e.target.value)} placeholder="e.g., USA" />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Budget Tier</label>
                            <select className={styles.select} value={budgetTier} onChange={e => setBudgetTier(e.target.value)}>
                                <option value="budgetary">💰 Budgetary</option>
                                <option value="mid">⭐ Mid-Range</option>
                                <option value="high">👑 High-End</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Scraping Method</label>
                        <select className={styles.select} value={scrapingMethod} onChange={e => setScrapingMethod(e.target.value)}>
                            <option value="ai">🤖 AI Scraper (Intelligent extraction for any site)</option>
                            <option value="requests">🔧 Specialized Scraper (Optimized for Architonic)</option>
                        </select>
                    </div>

                    <div className={styles.actionRow}>
                        <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                        <button className={styles.getProductsBtn} onClick={handleScraping} disabled={loading || !name || !website}>
                            {loading ? 'Processing...' : '🔍 Start Harvesting'}
                        </button>
                    </div>

                    <div className={styles.sectionDivider} />

                    {/* DB Management */}
                    <div className={styles.sectionTitle}>📥 Excel Database Operations</div>
                    <div className={styles.description}>
                        Bulk update brand products using the Excel interface.
                    </div>

                    <div className={styles.brandListContainer}>
                        {allBrands.length === 0 ? (
                            <div className={styles.emptyList}>No brands found. Add one above to manage its database.</div>
                        ) : (
                            <div className={styles.brandList}>
                                {allBrands.map(brand => (
                                    <div key={brand.id} className={styles.brandItem}>
                                        <div className={styles.brandInfo}>
                                            <div className={styles.brandNameText}>{brand.name}</div>
                                            <div className={styles.brandStats}>
                                                {brand.products?.length || 0} Products • {brand.budgetTier}
                                            </div>
                                        </div>
                                        <div className={styles.brandActions}>
                                            <button
                                                className={`${styles.actionBtn} ${styles.miniDownloadBtn}`}
                                                onClick={() => handleDownloadDB(brand.id)}
                                                title="Download Excel"
                                            >
                                                📥 Export
                                            </button>
                                            <button
                                                className={`${styles.actionBtn} ${styles.miniUploadBtn}`}
                                                onClick={() => handleUploadClick(brand.id)}
                                                title="Upload Excel"
                                            >
                                                📤 {(importingId === brand.id) ? '...' : 'Import'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept=".xlsx, .xls"
                        onChange={handleFileChange}
                    />
                </div>
            </div>
        </div>
    );
}
