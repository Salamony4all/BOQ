import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Create the context
const CompanyContext = createContext(null);

// Storage key
const STORAGE_KEY = 'boqflow_company_profile';

// Default empty profile
const DEFAULT_PROFILE = {
    companyName: '',
    companyLogo: null, // Base64 string
    setupComplete: false
};

// Provider component
export function CompanyProvider({ children }) {
    const [profile, setProfile] = useState(DEFAULT_PROFILE);
    const [isLoading, setIsLoading] = useState(true);
    const [showSetupModal, setShowSetupModal] = useState(false);

    // Load profile from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                setProfile(parsed);
                setShowSetupModal(!parsed.setupComplete);
            } else {
                setShowSetupModal(true);
            }
        } catch (error) {
            console.error('Failed to load company profile:', error);
            setShowSetupModal(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Save profile to localStorage
    const saveProfile = useCallback((newProfile) => {
        try {
            const profileToSave = { ...newProfile, setupComplete: true };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(profileToSave));
            setProfile(profileToSave);
            setShowSetupModal(false);
            return { success: true };
        } catch (error) {
            console.error('Failed to save company profile:', error);
            // Check if it's a quota error
            if (error.name === 'QuotaExceededError') {
                return { success: false, error: 'Storage quota exceeded. Please use a smaller logo.' };
            }
            return { success: false, error: 'Failed to save profile.' };
        }
    }, []);

    // Update company name
    const updateCompanyName = useCallback((name) => {
        const updated = { ...profile, companyName: name };
        return saveProfile(updated);
    }, [profile, saveProfile]);

    // Update company logo (expects Base64 string)
    const updateCompanyLogo = useCallback((logoBase64) => {
        const updated = { ...profile, companyLogo: logoBase64 };
        return saveProfile(updated);
    }, [profile, saveProfile]);

    // Update both at once
    const updateProfile = useCallback((name, logoBase64) => {
        const updated = {
            ...profile,
            companyName: name,
            companyLogo: logoBase64 !== undefined ? logoBase64 : profile.companyLogo
        };
        return saveProfile(updated);
    }, [profile, saveProfile]);

    // Clear profile (reset)
    const clearProfile = useCallback(() => {
        try {
            localStorage.removeItem(STORAGE_KEY);
            setProfile(DEFAULT_PROFILE);
            setShowSetupModal(true);
            return { success: true };
        } catch (error) {
            return { success: false, error: 'Failed to clear profile.' };
        }
    }, []);

    // Convert file to Base64 with size validation
    const processLogoFile = useCallback((file) => {
        return new Promise((resolve, reject) => {
            // Max 500KB
            const MAX_SIZE = 500 * 1024;

            if (file.size > MAX_SIZE) {
                reject(new Error(`Logo file too large. Maximum size is 500KB. Your file is ${(file.size / 1024).toFixed(1)}KB.`));
                return;
            }

            // Validate file type
            if (!file.type.startsWith('image/')) {
                reject(new Error('Please upload an image file (PNG, JPG, SVG, etc.)'));
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                resolve(reader.result); // This is the Base64 data URL
            };
            reader.onerror = () => {
                reject(new Error('Failed to read the logo file.'));
            };
            reader.readAsDataURL(file);
        });
    }, []);

    const value = {
        // Profile data
        companyName: profile.companyName,
        companyLogo: profile.companyLogo,
        setupComplete: profile.setupComplete,

        // State
        isLoading,
        showSetupModal,
        setShowSetupModal,

        // Actions
        updateCompanyName,
        updateCompanyLogo,
        updateProfile,
        clearProfile,
        processLogoFile
    };

    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
}

// Custom hook to use the company profile
export function useCompanyProfile() {
    const context = useContext(CompanyContext);
    if (!context) {
        throw new Error('useCompanyProfile must be used within a CompanyProvider');
    }
    return context;
}

export default CompanyContext;
