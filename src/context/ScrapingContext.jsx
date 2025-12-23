import { createContext, useContext, useState } from 'react';
import styles from '../styles/AddBrandModal.module.css';

const ScrapingContext = createContext(null);

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

export function ScrapingProvider({ children }) {
    const [scrapingState, setScrapingState] = useState({
        isActive: false,
        brandName: '',
        progress: 0,
        stage: '',
        taskId: null,
        onComplete: null,
        onError: null
    });


    const [successData, setSuccessData] = useState(null);

    const startScraping = (brandName, onComplete, onError, taskId = null) => {
        setSuccessData(null);
        setScrapingState({
            isActive: true,
            brandName,
            progress: 5,
            stage: 'Connecting to Website...',
            taskId: taskId,
            onComplete,
            onError
        });
    };

    const updateProgress = (progress, stage, brandName = null) => {
        setScrapingState(prev => ({
            ...prev,
            progress,
            stage,
            brandName: brandName || prev.brandName
        }));
    };

    const cancelCurrentScrape = async () => {
        if (!scrapingState.taskId) {
            setScrapingState(prev => ({ ...prev, isActive: false }));
            return;
        }

        try {
            await fetch(`${API_BASE}/api/tasks/${scrapingState.taskId}`, {
                method: 'DELETE'
            });
        } catch (e) {
            console.error('Failed to notify server of cancellation:', e);
        }

        setScrapingState({
            isActive: false,
            brandName: '',
            progress: 0,
            stage: '',
            taskId: null,
            onComplete: null,
            onError: null
        });
    };

    const completeScraping = (data) => {
        const callback = scrapingState.onComplete;

        // Show success modal instead of immediately clearing
        setSuccessData({
            brandName: scrapingState.brandName,
            count: data.productCount || 0,
            enriched: data.summary?.enriched || 0
        });

        // Trigger callback but keep success modal open
        if (callback) callback(data);

        setScrapingState(prev => ({ ...prev, isActive: false }));
    };

    const closeSuccessModal = () => {
        setSuccessData(null);
        setScrapingState({
            isActive: false,
            brandName: '',
            progress: 0,
            stage: '',
            taskId: null,
            onComplete: null,
            onError: null
        });
    };

    const failScraping = (error) => {
        const callback = scrapingState.onError;
        setScrapingState(prev => ({ ...prev, isActive: false }));
        if (callback) callback(error);

        // Reset state after failure
        setScrapingState({
            isActive: false,
            brandName: '',
            progress: 0,
            stage: '',
            taskId: null,
            onComplete: null,
            onError: null
        });
    };

    return (
        <ScrapingContext.Provider value={{
            ...scrapingState,
            startScraping,
            updateProgress,
            completeScraping,
            failScraping,
            cancelCurrentScrape
        }}>
            {children}
            {/* Global Floating Progress Bar */}
            <div className={`${styles.scrapingContainer} ${scrapingState.isActive ? styles.active : ''} ${successData ? styles.success : ''}`}>
                {scrapingState.isActive && !successData && (
                    <div className={styles.minimizedBarContent}>
                        <div className={styles.throbber}></div>
                        <div className={styles.progressInfo}>
                            <span className={styles.minimizedText}>
                                Scraping {scrapingState.brandName}... {scrapingState.progress}%
                            </span>
                            <span className={styles.minimizedStage}>{scrapingState.stage}</span>
                        </div>
                        <div className={styles.minimizedProgress}>
                            <div
                                className={styles.minimizedProgressFill}
                                style={{ width: `${scrapingState.progress}%` }}
                            />
                        </div>
                        <button
                            className={styles.cancelScrapeBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                cancelCurrentScrape();
                            }}
                            title="Cancel Scraping"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Success Modal State (Transforms from Bar) */}
                {successData && (
                    <div className={styles.successContent}>
                        <div className={styles.successIcon}>✅</div>
                        <div className={styles.successTitle}>Scraping Complete!</div>
                        <div className={styles.successDetails}>
                            Successfully added <strong>{successData.count}</strong> products to <strong>{successData.brandName}</strong>.
                        </div>
                        <button className={styles.successBtn} onClick={closeSuccessModal}>OK</button>
                    </div>
                )}
            </div>

            {/* Backdrop for Success */}
            {successData && <div className={styles.successBackdrop} onClick={closeSuccessModal} />}
        </ScrapingContext.Provider>
    );
}

export function useScraping() {
    const context = useContext(ScrapingContext);
    if (!context) {
        throw new Error('useScraping must be used within a ScrapingProvider');
    }
    return context;
}
