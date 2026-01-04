import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
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
        onError: null,
        // New: connection status tracking
        isConnected: true,
        consecutiveErrors: 0,
        lastSuccessfulPoll: null
    });

    const [successData, setSuccessData] = useState(null);
    const pollingRef = useRef(null);

    // Clear polling when unmounting
    useEffect(() => {
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, []);

    // Core polling function - can be called to restart polling
    const startPolling = useCallback((taskId, brandName, onComplete, onError) => {
        // Clear any existing polling
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
        }

        // Reset connection status
        setScrapingState(prev => ({
            ...prev,
            isConnected: true,
            consecutiveErrors: 0
        }));

        // Start polling for task status
        pollingRef.current = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
                    signal: AbortSignal.timeout(10000) // 10s timeout
                });

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const task = await res.json();

                // Successfully got response - reset error counter
                setScrapingState(prev => ({
                    ...prev,
                    isConnected: true,
                    consecutiveErrors: 0,
                    lastSuccessfulPoll: Date.now()
                }));

                if (task.status === 'completed') {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;

                    setScrapingState(prev => ({ ...prev, progress: 100, stage: 'Complete!' }));

                    setTimeout(() => {
                        // Show success modal
                        setSuccessData({
                            brandName: task.brandName || brandName,
                            count: task.productCount || task.brand?.productCount || 0,
                            enriched: task.summary?.enriched || 0
                        });

                        setScrapingState(prev => ({ ...prev, isActive: false }));

                        // Call completion callback
                        if (onComplete) onComplete(task);
                    }, 500);

                } else if (task.status === 'failed') {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;

                    setScrapingState(prev => ({ ...prev, isActive: false }));
                    if (onError) onError(new Error(task.error || 'Scraping failed'));

                } else if (task.status === 'cancelled') {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                    setScrapingState(prev => ({ ...prev, isActive: false }));

                } else {
                    // Update progress
                    setScrapingState(prev => ({
                        ...prev,
                        progress: task.progress || prev.progress,
                        stage: task.stage || prev.stage,
                        brandName: task.brandName || prev.brandName
                    }));
                }
            } catch (e) {
                console.error('Polling error:', e.message);

                // Track consecutive errors
                setScrapingState(prev => {
                    const newErrorCount = prev.consecutiveErrors + 1;
                    const isDisconnected = newErrorCount >= 3;

                    return {
                        ...prev,
                        consecutiveErrors: newErrorCount,
                        isConnected: !isDisconnected,
                        stage: isDisconnected
                            ? '⚠️ Connection lost - Click refresh to reconnect'
                            : prev.stage
                    };
                });
            }
        }, 2000);
    }, []);

    // Refresh/Reconnect function - manually restarts polling
    const refreshConnection = useCallback(() => {
        if (scrapingState.taskId && scrapingState.isActive) {
            console.log('🔄 Manually refreshing connection for task:', scrapingState.taskId);

            setScrapingState(prev => ({
                ...prev,
                stage: 'Reconnecting...',
                consecutiveErrors: 0,
                isConnected: true
            }));

            startPolling(
                scrapingState.taskId,
                scrapingState.brandName,
                scrapingState.onComplete,
                scrapingState.onError
            );
        }
    }, [scrapingState.taskId, scrapingState.brandName, scrapingState.onComplete, scrapingState.onError, scrapingState.isActive, startPolling]);

    // Start scraping and begin polling - THIS PERSISTS AFTER MODAL CLOSES
    const startScrapingWithTask = useCallback((brandName, taskId, onComplete, onError) => {
        setSuccessData(null);

        setScrapingState({
            isActive: true,
            brandName,
            progress: 5,
            stage: 'Connecting to server...',
            taskId,
            onComplete,
            onError,
            isConnected: true,
            consecutiveErrors: 0,
            lastSuccessfulPoll: Date.now()
        });

        // Start polling
        startPolling(taskId, brandName, onComplete, onError);
    }, [startPolling]);

    // Legacy startScraping for backward compatibility (will be replaced soon)
    const startScraping = (brandName, onComplete, onError, taskId = null) => {
        setSuccessData(null);
        setScrapingState({
            isActive: true,
            brandName,
            progress: 5,
            stage: 'Connecting to Website...',
            taskId: taskId,
            onComplete,
            onError,
            isConnected: true,
            consecutiveErrors: 0,
            lastSuccessfulPoll: Date.now()
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
        // Stop polling first
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }

        if (scrapingState.taskId) {
            try {
                await fetch(`${API_BASE}/api/tasks/${scrapingState.taskId}`, {
                    method: 'DELETE'
                });
            } catch (e) {
                console.error('Failed to notify server of cancellation:', e);
            }
        }

        setScrapingState({
            isActive: false,
            brandName: '',
            progress: 0,
            stage: '',
            taskId: null,
            onComplete: null,
            onError: null,
            isConnected: true,
            consecutiveErrors: 0,
            lastSuccessfulPoll: null
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
            onError: null,
            isConnected: true,
            consecutiveErrors: 0,
            lastSuccessfulPoll: null
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
            onError: null,
            isConnected: true,
            consecutiveErrors: 0,
            lastSuccessfulPoll: null
        });
    };

    return (
        <ScrapingContext.Provider value={{
            ...scrapingState,
            startScraping,
            startScrapingWithTask,
            updateProgress,
            completeScraping,
            failScraping,
            cancelCurrentScrape,
            refreshConnection
        }}>
            {children}
            {/* Global Floating Progress Bar - Always visible during scraping */}
            <div className={`${styles.scrapingContainer} ${scrapingState.isActive ? styles.active : ''} ${successData ? styles.success : ''} ${!scrapingState.isConnected ? styles.disconnected : ''}`}>
                {scrapingState.isActive && !successData && (
                    <div className={styles.minimizedBarContent}>
                        <div className={`${styles.throbber} ${!scrapingState.isConnected ? styles.paused : ''}`}></div>
                        <div className={styles.progressInfo}>
                            <span className={styles.minimizedText}>
                                {!scrapingState.isConnected && '⚠️ '}
                                Scraping {scrapingState.brandName}... {scrapingState.progress}%
                            </span>
                            <span className={`${styles.minimizedStage} ${!scrapingState.isConnected ? styles.errorStage : ''}`}>
                                {scrapingState.stage}
                            </span>
                        </div>
                        <div className={styles.minimizedProgress}>
                            <div
                                className={`${styles.minimizedProgressFill} ${!scrapingState.isConnected ? styles.disconnectedFill : ''}`}
                                style={{ width: `${scrapingState.progress}%` }}
                            />
                        </div>
                        {/* Refresh Button - Always visible, highlighted when disconnected */}
                        <button
                            className={`${styles.refreshBtn} ${!scrapingState.isConnected ? styles.refreshBtnActive : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                refreshConnection();
                            }}
                            title="Refresh connection"
                        >
                            🔄
                        </button>
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

