import { useState, useRef } from 'react';
import { useCompanyProfile } from '../context/CompanyContext';
import styles from '../styles/CompanySettings.module.css';

export default function CompanySettings({ isModal = false, onClose = null }) {
    const {
        companyName,
        companyLogo,
        updateProfile,
        processLogoFile,
        clearProfile
    } = useCompanyProfile();

    const [name, setName] = useState(companyName || '');
    const [logo, setLogo] = useState(companyLogo || null);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const fileInputRef = useRef(null);

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);
        setIsProcessing(true);

        try {
            const base64 = await processLogoFile(file);
            setLogo(base64);
            setSuccess('Logo uploaded successfully!');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRemoveLogo = () => {
        setLogo(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleSave = () => {
        if (!name.trim()) {
            setError('Please enter a company name.');
            return;
        }

        setError(null);
        const result = updateProfile(name.trim(), logo);

        if (result.success) {
            setSuccess('Company profile saved successfully!');
            setTimeout(() => {
                setSuccess(null);
                if (onClose) onClose();
            }, 1500);
        } else {
            setError(result.error);
        }
    };

    const handleReset = () => {
        if (window.confirm('Are you sure you want to reset your company profile? This cannot be undone.')) {
            clearProfile();
            setName('');
            setLogo(null);
        }
    };

    const handleSkip = () => {
        // Save with just minimal info
        updateProfile(name.trim() || 'My Company', logo);
        if (onClose) onClose();
    };

    return (
        <div className={isModal ? styles.modalOverlay : styles.settingsPage}>
            <div className={isModal ? styles.modalContent : styles.settingsContainer}>
                {/* Header */}
                <div className={styles.header}>
                    <h2 className={styles.title}>
                        {isModal ? 'Welcome to BOQFLOW' : 'Company Settings'}
                    </h2>
                    {isModal && (
                        <p className={styles.subtitle}>
                            Set up your company profile to personalize your documents
                        </p>
                    )}
                </div>

                {/* Form */}
                <div className={styles.form}>
                    {/* Company Name */}
                    <div className={styles.field}>
                        <label className={styles.label}>Company Name</label>
                        <input
                            type="text"
                            className={styles.input}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Enter your company name"
                            maxLength={100}
                        />
                    </div>

                    {/* Company Logo */}
                    <div className={styles.field}>
                        <label className={styles.label}>
                            Company Logo
                            <span className={styles.hint}>(Max 500KB - PNG, JPG, SVG)</span>
                        </label>

                        <div className={styles.logoSection}>
                            {/* Logo Preview */}
                            <div className={styles.logoPreview}>
                                {logo ? (
                                    <img src={logo} alt="Company Logo" className={styles.logoImage} />
                                ) : (
                                    <div className={styles.logoPlaceholder}>
                                        <span className={styles.placeholderText}>No Logo</span>
                                    </div>
                                )}
                            </div>

                            {/* Upload Controls */}
                            <div className={styles.logoControls}>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    className={styles.fileInput}
                                    id="logo-upload"
                                />
                                <label htmlFor="logo-upload" className={styles.uploadBtn}>
                                    {isProcessing ? 'Processing...' : 'Upload Logo'}
                                </label>
                                {logo && (
                                    <button
                                        type="button"
                                        className={styles.removeBtn}
                                        onClick={handleRemoveLogo}
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Messages */}
                    {error && (
                        <div className={styles.errorMessage}>{error}</div>
                    )}
                    {success && (
                        <div className={styles.successMessage}>{success}</div>
                    )}
                </div>

                {/* Actions */}
                <div className={styles.actions}>
                    {isModal ? (
                        <>
                            <button
                                type="button"
                                className={styles.skipBtn}
                                onClick={handleSkip}
                            >
                                Skip for Now
                            </button>
                            <button
                                type="button"
                                className={styles.saveBtn}
                                onClick={handleSave}
                                disabled={isProcessing}
                            >
                                Save & Continue
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                className={styles.resetBtn}
                                onClick={handleReset}
                            >
                                Reset Profile
                            </button>
                            <button
                                type="button"
                                className={styles.saveBtn}
                                onClick={handleSave}
                                disabled={isProcessing}
                            >
                                Save Changes
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
