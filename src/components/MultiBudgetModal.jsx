import { useState, useEffect } from 'react';
import AddBrandModal from './AddBrandModal';
import CostingModal from './CostingModal';
import styles from '../styles/MultiBudgetModal.module.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { ScrapingProvider } from '../context/ScrapingContext';
import { useCompanyProfile } from '../context/CompanyContext';

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

const getFullUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    return `${API_BASE}${url}`;
};

export default function MultiBudgetModal({ isOpen, onClose, originalTables }) {
    const { companyLogo: globalCompanyLogo } = useCompanyProfile();
    const [activeTier, setActiveTier] = useState('mid'); // budgetary, mid, high
    const [previewImage, setPreviewImage] = useState(null); // URL of image to preview
    const [previewLogo, setPreviewLogo] = useState(null); // URL of brand logo for preview
    // State stores data + mode PER TIER
    // Structure: { mid: { rows: [...], mode: 'boq'|'new' }, ... }
    const [tierData, setTierData] = useState({
        budgetary: null,
        mid: null,
        high: null
    });

    // Brand System
    const [brands, setBrands] = useState([]);
    const [isAddBrandOpen, setIsAddBrandOpen] = useState(false);
    const [openBrandDropdown, setOpenBrandDropdown] = useState(null); // row index of open dropdown

    // Costing System
    const [isCostingOpen, setIsCostingOpen] = useState(false);
    const [costingFactors, setCostingFactors] = useState({
        profit: 0,
        freight: 0,
        customs: 0,
        installation: 0,
        fromCurrency: 'USD',
        toCurrency: 'OMR',
        exchangeRate: 0.385
    });

    useEffect(() => {
        // Fetch brands on mount
        fetch(`${API_BASE}/api/brands`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setBrands(data);
            })
            .catch(err => console.error('Failed to load brands', err));
    }, []);

    if (!isOpen) return null;

    // Helper to find column index in original table
    const findCol = (header, regex) => {
        if (!header) return -1;
        return header.findIndex(h => regex.test(h));
    };

    const handleGenerateFromBoq = () => {
        if (!originalTables || originalTables.length === 0) {
            console.warn("No original tables to generate from.");
            return;
        }

        const sourceTable = originalTables[0];
        const header = sourceTable.header || [];

        const idxDesc = findCol(header, /description|desc/i);
        const idxQty = findCol(header, /qty|quantity/i);
        const idxUnit = findCol(header, /unit|uom/i);
        const idxRate = findCol(header, /rate|price/i);
        const idxTotal = findCol(header, /total|amount/i);

        const newRows = sourceTable.rows.map((row, i) => {
            const getVal = (idx) => idx !== -1 ? (row.cells[idx]?.value || '') : '';
            const imageCell = row.cells.find(c => c.image || (c.images && c.images.length > 0));
            let imgSrc = imageCell ? (imageCell.image || imageCell.images[0]) : null;
            if (imgSrc && typeof imgSrc === 'object' && imgSrc.url) imgSrc = imgSrc.url;
            // Ensure proper path format
            if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('/')) imgSrc = '/' + imgSrc;

            return {
                id: Date.now() + i,
                sn: i + 1,
                imageRef: imgSrc,
                brandImage: '',
                brandDesc: '',
                description: getVal(idxDesc) || (idxDesc === -1 ? row.cells[1]?.value : ''),
                qty: getVal(idxQty),
                unit: getVal(idxUnit),
                rate: getVal(idxRate),
                amount: getVal(idxTotal),

                // Dropdown States
                selectedBrand: '',
                selectedMainCat: '',
                selectedSubCat: '',
                selectedFamily: '',
                selectedModel: ''
            };
        });

        // Update ONLY active tier with BOQ mode
        setTierData(prev => ({
            ...prev,
            [activeTier]: { rows: newRows, mode: 'boq' }
        }));
    };

    const handleCreateNewBoq = () => {
        const emptyRows = Array(5).fill().map((_, i) => ({
            id: Date.now() + i,
            sn: i + 1,
            imageRef: null,
            brandImage: '', brandDesc: '', description: '', qty: '', unit: '', rate: '', amount: '',
            selectedBrand: '', selectedMainCat: '', selectedSubCat: '', selectedFamily: '', selectedModel: ''
        }));

        // Update ONLY active tier with NEW mode
        setTierData(prev => ({
            ...prev,
            [activeTier]: { rows: emptyRows, mode: 'new' }
        }));
    };

    const handleAddBrand = () => {
        setIsAddBrandOpen(true);
    };

    const handleBrandAdded = (newBrand) => {
        setBrands(prev => [...prev, newBrand]);
    };

    const getUniqueValues = (items, key) => [...new Set(items.map(i => i[key]).filter(Boolean))];

    const handleCellChange = (rowIndex, field, value) => {
        setTierData(prev => {
            const tier = prev[activeTier];
            if (!tier) return prev;
            const newRows = [...tier.rows];
            const row = { ...newRows[rowIndex] };

            // Special handling for cascading dropdowns
            if (field === 'selectedBrand') {
                row.selectedBrand = value;
                row.selectedMainCat = '';
                row.selectedSubCat = '';
                row.selectedFamily = '';
                row.selectedModel = '';
                row.brandImage = '';
                row.brandDesc = '';
                // Store brand logo for PDF export
                const brand = brands.find(b => b.name === value);
                row.brandLogo = brand?.logo || '';
            }
            else if (field === 'selectedMainCat') {
                row.selectedMainCat = value;
                row.selectedSubCat = '';
                row.selectedFamily = '';
                row.selectedModel = '';
            }
            else if (field === 'selectedSubCat') {
                row.selectedSubCat = value;
                row.selectedFamily = '';
                row.selectedModel = '';
            }
            else if (field === 'selectedFamily') {
                row.selectedFamily = value;
                row.selectedModel = '';
            }
            else if (field === 'selectedModel') {
                // value is now { model, url } to support variants
                const { model, url } = value;
                row.selectedModel = model;
                row.selectedModelUrl = url;

                // Auto-fill Description, Image, and Rate from Product Data
                const brand = brands.find(b => b.name === row.selectedBrand);
                if (brand && brand.products) {
                    const product = brand.products.find(p => p.productUrl === url);
                    if (product) {
                        row.brandDesc = product.description || product.model;
                        row.brandImage = product.imageUrl || '';
                        // Calculate rate with costing factors
                        const basePrice = parseFloat(product.price) || 0;
                        if (basePrice > 0) {
                            const markup = 1 + (costingFactors.profit + costingFactors.freight + costingFactors.customs + costingFactors.installation) / 100;
                            const costedPrice = basePrice * markup * costingFactors.exchangeRate;
                            row.rate = costedPrice.toFixed(2);
                            row.basePrice = basePrice; // Store base price for recalculation
                        }
                    }
                }
            } else {
                // Standard Field
                row[field] = value;
            }

            newRows[rowIndex] = row;
            return { ...prev, [activeTier]: { ...tier, rows: newRows } };
        });
    };

    const handleAddRow = (index) => {
        setTierData(prev => {
            const tier = prev[activeTier];
            if (!tier) return prev;
            const newRows = [...tier.rows];
            newRows.splice(index + 1, 0, {
                id: Date.now(),
                sn: newRows.length + 2,
                imageRef: null,
                brandImage: '', brandDesc: '', description: '', qty: '', unit: '', rate: '', amount: '',
                selectedBrand: '', selectedMainCat: '', selectedSubCat: '', selectedFamily: '', selectedModel: ''
            });
            newRows.forEach((r, i) => r.sn = i + 1);
            return { ...prev, [activeTier]: { ...tier, rows: newRows } };
        });
    };

    const handleRemoveRow = (index) => {
        setTierData(prev => {
            const tier = prev[activeTier];
            if (!tier) return prev;
            const newRows = [...tier.rows];
            newRows.splice(index, 1);
            newRows.forEach((r, i) => r.sn = i + 1);
            return { ...prev, [activeTier]: { ...tier, rows: newRows } };
        });
    };

    // Apply costing factors to all rows with base prices
    const handleApplyCosting = (factors) => {
        setCostingFactors(factors);
        setIsCostingOpen(false);

        // Recalculate rates for all rows with base prices
        setTierData(prev => {
            const tier = prev[activeTier];
            if (!tier) return prev;
            const newRows = tier.rows.map(row => {
                if (row.basePrice && row.basePrice > 0) {
                    const markup = 1 + (factors.profit + factors.freight + factors.customs + factors.installation) / 100;
                    const costedPrice = row.basePrice * markup * factors.exchangeRate;
                    return { ...row, rate: costedPrice.toFixed(2) };
                }
                return row;
            });
            return { ...prev, [activeTier]: { ...tier, rows: newRows } };
        });
    };

    // Helper to load image as data URL (uses proxy for external URLs)
    const getImageData = async (url) => {
        if (!url) return null;

        // Check if it's an external URL (not from our server)
        const isExternal = url.startsWith('http') && !url.includes('localhost:3001');

        if (isExternal) {
            // Use server proxy for external images
            try {
                const proxyUrl = `${API_BASE}/api/image-proxy?url=${encodeURIComponent(url)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) return null;
                const data = await response.json();
                if (data.dataUrl) {
                    // Get dimensions by loading the image
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.src = data.dataUrl;
                        img.onload = () => resolve({ dataUrl: data.dataUrl, width: img.width, height: img.height });
                        img.onerror = () => resolve(null);
                    });
                }
                return null;
            } catch (e) {
                console.error('Proxy fetch error:', e);
                return null;
            }
        } else {
            // Local images - load directly
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = url;
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext("2d");
                    ctx.fillStyle = "white";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    resolve({ dataUrl: canvas.toDataURL("image/jpeg"), width: img.width, height: img.height });
                };
                img.onerror = () => resolve(null);
            });
        }
    };

    const calcFitSize = (imgW, imgH, maxW, maxH) => {
        const ratio = Math.min(maxW / imgW, maxH / imgH);
        return { w: imgW * ratio, h: imgH * ratio };
    };

    // ===================== MULTI-BUDGET PDF EXPORT =====================
    const handleExportPDF = async () => {
        const tier = tierData[activeTier];
        if (!tier || !tier.rows.length) return alert('No data to export');

        const isBoqMode = tier.mode === 'boq';
        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();

        const colors = {
            primary: [30, 95, 168],
            accent: [245, 166, 35],
            text: [51, 51, 51],
            white: [255, 255, 255],
            lightBg: [248, 250, 252]
        };

        // Header
        doc.setFillColor(...colors.primary);
        doc.rect(0, 0, pageWidth, 18, 'F');
        doc.setFillColor(...colors.accent);
        doc.rect(0, 18, pageWidth, 2, 'F');
        doc.setTextColor(...colors.white);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`Multi-Budget Offer - ${activeTier.charAt(0).toUpperCase() + activeTier.slice(1)} Tier`, 10, 12);

        // Top Right Logo (Now Company Logo from Settings)
        if (globalCompanyLogo) {
            try {
                const docLogo = await getImageData(globalCompanyLogo);
                if (docLogo) {
                    const logoFit = calcFitSize(docLogo.width, docLogo.height, 35, 12);
                    doc.addImage(docLogo.dataUrl, 'JPEG', pageWidth - 10 - logoFit.w, 3, logoFit.w, logoFit.h);
                }
            } catch (e) { }
        }

        // Define columns based on mode (removed Brand column - logo now goes above product image)
        const header = isBoqMode
            ? ['Sr.', 'Ref Image', 'Original Desc', 'Brand Image', 'Brand Desc', 'Qty', 'Unit', 'Rate', 'Amount']
            : ['Sr.', 'Image', 'Description', 'Qty', 'Unit', 'Rate', 'Amount'];

        // Pre-load all images
        const imageDataMap = {};
        for (let i = 0; i < tier.rows.length; i++) {
            const row = tier.rows[i];
            // Reference image
            if (row.imageRef) {
                try {
                    const url = getFullUrl(row.imageRef);
                    const result = await getImageData(url);
                    if (result) imageDataMap[`ref_${i}`] = result;
                } catch (e) { console.log('Ref image load error:', e); }
            }
            // Brand product image
            if (row.brandImage) {
                try {
                    const result = await getImageData(row.brandImage);
                    if (result) imageDataMap[`brand_${i}`] = result;
                } catch (e) { console.log('Brand image load error:', e); }
            }
            // Brand logo
            if (row.brandLogo) {
                try {
                    const result = await getImageData(row.brandLogo);
                    if (result) imageDataMap[`logo_${i}`] = result;
                } catch (e) { console.log('Logo load error:', e); }
            }
        }

        // Build table data (removed Brand column)
        const body = tier.rows.map((row, i) => {
            const amount = (parseFloat(row.qty || 0) * parseFloat(row.rate || 0)).toFixed(2);
            if (isBoqMode) {
                return [row.sn, '', row.description || '', '', row.brandDesc || '', row.qty || '', row.unit || '', row.rate || '', amount];
            } else {
                return [row.sn, '', row.brandDesc || '', row.qty || '', row.unit || '', row.rate || '', amount];
            }
        });

        autoTable(doc, {
            startY: 25,
            head: [header],
            body: body,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
            headStyles: { fillColor: colors.primary, textColor: colors.white, fontStyle: 'bold' },
            columnStyles: isBoqMode ? {
                0: { cellWidth: 10 },  // Sr
                1: { cellWidth: 22 },  // Ref Image
                2: { cellWidth: 55 },  // Original Desc (wider now)
                3: { cellWidth: 30 },  // Brand Image (wider for logo + image)
                4: { cellWidth: 55 },  // Brand Desc (wider now)
                5: { cellWidth: 14 },  // Qty
                6: { cellWidth: 14 },  // Unit
                7: { cellWidth: 20 },  // Rate
                8: { cellWidth: 22 }   // Amount
            } : {
                0: { cellWidth: 12 },
                1: { cellWidth: 35 },  // Image (wider for logo + image)
                2: { cellWidth: 90 },  // Description (wider now)
                3: { cellWidth: 18 },
                4: { cellWidth: 18 },
                5: { cellWidth: 25 },
                6: { cellWidth: 28 }
            },
            didDrawCell: (data) => {
                if (data.section === 'body') {
                    const rowIdx = data.row.index;
                    const refImgCol = isBoqMode ? 1 : -1;      // Ref Image column (shifted)
                    const brandImgCol = isBoqMode ? 3 : 1;     // Brand Image column (shifted)

                    // Draw ref image
                    if (data.column.index === refImgCol && imageDataMap[`ref_${rowIdx}`]) {
                        const img = imageDataMap[`ref_${rowIdx}`];
                        const fit = calcFitSize(img.width, img.height, data.cell.width - 2, data.cell.height - 2);
                        const x = data.cell.x + (data.cell.width - fit.w) / 2;
                        const y = data.cell.y + (data.cell.height - fit.h) / 2;
                        doc.addImage(img.dataUrl, 'JPEG', x, y, fit.w, fit.h);
                    }

                    // Draw brand logo above product image in the same cell
                    if (data.column.index === brandImgCol) {
                        const hasLogo = imageDataMap[`logo_${rowIdx}`];
                        const hasBrandImg = imageDataMap[`brand_${rowIdx}`];

                        const logoHeight = 8;  // Fixed height for logo area
                        const padding = 1;
                        const gap = 2;  // Gap between logo and product image

                        // Draw brand logo at top of cell
                        if (hasLogo) {
                            const logoImg = imageDataMap[`logo_${rowIdx}`];
                            const logoFit = calcFitSize(logoImg.width, logoImg.height, data.cell.width - 4, logoHeight);
                            const logoX = data.cell.x + (data.cell.width - logoFit.w) / 2;
                            const logoY = data.cell.y + padding;
                            doc.addImage(logoImg.dataUrl, 'JPEG', logoX, logoY, logoFit.w, logoFit.h);
                        }

                        // Draw product image below logo
                        if (hasBrandImg) {
                            const img = imageDataMap[`brand_${rowIdx}`];
                            const imgStartY = hasLogo ? (data.cell.y + logoHeight + gap + padding) : (data.cell.y + padding);
                            const availableHeight = hasLogo
                                ? (data.cell.height - logoHeight - gap - padding * 2)
                                : (data.cell.height - padding * 2);
                            const fit = calcFitSize(img.width, img.height, data.cell.width - 4, availableHeight);
                            const x = data.cell.x + (data.cell.width - fit.w) / 2;
                            const y = imgStartY + (availableHeight - fit.h) / 2;
                            doc.addImage(img.dataUrl, 'JPEG', x, y, fit.w, fit.h);
                        }
                    }
                }
            },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    const refImgCol = isBoqMode ? 1 : -1;
                    const brandImgCol = isBoqMode ? 3 : 1;
                    // Increase cell height for brand image column to fit logo + product image
                    if (data.column.index === brandImgCol) {
                        data.cell.styles.minCellHeight = 32;  // Increased height for logo + image
                    } else if (data.column.index === refImgCol) {
                        data.cell.styles.minCellHeight = 22;
                    }
                }
            }
        });

        doc.save(`MultiBudget_${activeTier}_Offer.pdf`);
    };

    // ===================== MULTI-BUDGET EXCEL EXPORT (WITH IMAGES) =====================
    const handleExportExcel = async () => {
        const tier = tierData[activeTier];
        if (!tier || !tier.rows.length) return alert('No data to export');

        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'BOQFlow';
        workbook.created = new Date();

        const ws = workbook.addWorksheet(`${activeTier} Tier`, {
            properties: { tabColor: { argb: 'F5A623' } }
        });
        const isBoqMode = tier.mode === 'boq';

        // 1. Add Header Space for Logo & Info
        ws.addRow(['']); // Spacer
        ws.addRow(['', '', '', '', '', '', '', '', '']);
        ws.addRow(['', '', '', '', '', '', '', '', '']);
        ws.mergeCells('A2:C2');
        const titleCell = ws.getCell('A2');
        titleCell.value = `${activeTier.toUpperCase()} TIER OFFER`;
        titleCell.font = { bold: true, size: 14, color: { argb: '1E5FA8' } };

        ws.getCell('A3').value = `Generated on: ${new Date().toLocaleDateString()}`;
        ws.getCell('A3').font = { italic: true, size: 10, color: { argb: '64748B' } };

        // Helper to fetch image as base64
        const fetchImageBase64 = async (url) => {
            if (!url) return null;
            try {
                const isExternal = url.startsWith('http') && !url.includes('localhost:3001') && !url.includes(window.location.hostname);
                if (isExternal) {
                    const proxyUrl = `${API_BASE}/api/image-proxy?url=${encodeURIComponent(url)}`;
                    const response = await fetch(proxyUrl);
                    if (!response.ok) return null;
                    const data = await response.json();
                    return data.dataUrl ? data.dataUrl.split(',')[1] : null;
                } else {
                    const response = await fetch(url);
                    if (!response.ok) return null;
                    const blob = await response.blob();
                    return new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result.split(',')[1]);
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                    });
                }
            } catch (e) { return null; }
        };

        // Add Company Logo if available
        if (globalCompanyLogo) {
            try {
                const logoBase64 = await fetchImageBase64(globalCompanyLogo);
                if (logoBase64) {
                    const logoId = workbook.addImage({
                        base64: logoBase64,
                        extension: 'jpeg'
                    });
                    const lastCol = isBoqMode ? 9 : 7;
                    ws.addImage(logoId, {
                        tl: { col: lastCol - 1, row: 1 },
                        ext: { width: 120, height: 40 }
                    });
                }
            } catch (e) { }
        }

        ws.addRow(['']); // Spacer before table

        // Header with proper columns
        const header = isBoqMode
            ? ['Sr.', 'Ref Image', 'Original Desc', 'Brand Image', 'Brand Desc', 'Qty', 'Unit', 'Rate', 'Amount']
            : ['Sr.', 'Image', 'Description', 'Qty', 'Unit', 'Rate', 'Amount'];

        // Set column widths first
        ws.columns = isBoqMode
            ? [
                { width: 6 },   // Sr
                { width: 15 },  // Ref Image
                { width: 40 },  // Original Desc
                { width: 18 },  // Brand Image (wider for logo + image)
                { width: 40 },  // Brand Desc
                { width: 10 },  // Qty
                { width: 10 },  // Unit
                { width: 14 },  // Rate
                { width: 16 }   // Amount
            ]
            : [
                { width: 6 },   // Sr
                { width: 18 },  // Image (wider for logo + image)
                { width: 55 },  // Description
                { width: 12 },  // Qty
                { width: 12 },  // Unit
                { width: 16 },  // Rate
                { width: 18 }   // Amount
            ];

        // Add header row
        const headerRow = ws.addRow(header);
        headerRow.height = 25;
        headerRow.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E5FA8' } };
            cell.font = { color: { argb: 'FFFFFF' }, bold: true, size: 11 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = {
                top: { style: 'thin', color: { argb: '1E5FA8' } },
                bottom: { style: 'medium', color: { argb: 'F5A623' } }
            };
        });

        // Add data rows with images
        for (let i = 0; i < tier.rows.length; i++) {
            const row = tier.rows[i];
            const amount = (parseFloat(row.qty || 0) * parseFloat(row.rate || 0)).toFixed(2);
            const brandName = (row.selectedBrand || '').replace(/Explore collections by/i, '').trim();

            const dataRow = isBoqMode
                ? [row.sn, '', row.description || '', '', row.brandDesc || '', row.qty || '', row.unit || '', row.rate || '', amount]
                : [row.sn, '', row.brandDesc || '', row.qty || '', row.unit || '', row.rate || '', amount];

            const excelRow = ws.addRow(dataRow);
            const rowNumber = excelRow.number;
            excelRow.height = 75; // Taller rows for images

            // Style data cells
            excelRow.eachCell((cell, colNumber) => {
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.border = {
                    bottom: { style: 'thin', color: { argb: 'E2E8F0' } }
                };
                // Description columns - left align
                if ((isBoqMode && (colNumber === 3 || colNumber === 5)) || (!isBoqMode && colNumber === 3)) {
                    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
                }
            });

            // Add reference image (BOQ mode only, column 2)
            if (isBoqMode && row.imageRef) {
                try {
                    const refUrl = getFullUrl(row.imageRef);
                    const base64 = await fetchImageBase64(refUrl);
                    if (base64) {
                        const imageId = workbook.addImage({
                            base64: base64,
                            extension: 'jpeg'
                        });
                        ws.addImage(imageId, {
                            tl: { col: 1.1, row: rowNumber - 1 + 0.1 },
                            ext: { width: 80, height: 55 }
                        });
                    }
                } catch (e) { console.log('Ref image error:', e); }
            }

            // Determine brand image column
            const brandImgCol = isBoqMode ? 3 : 1; // 0-indexed: col 4 for BOQ, col 2 for non-BOQ

            // Add brand logo on top of brand image cell
            if (row.brandLogo) {
                try {
                    const logoBase64 = await fetchImageBase64(row.brandLogo);
                    if (logoBase64) {
                        const logoId = workbook.addImage({
                            base64: logoBase64,
                            extension: 'jpeg'
                        });
                        ws.addImage(logoId, {
                            tl: { col: brandImgCol + 0.15, row: rowNumber - 1 + 0.05 },
                            ext: { width: 60, height: 18 }
                        });
                    }
                } catch (e) { console.log('Logo error:', e); }
            }

            // Add brand product image below logo
            if (row.brandImage) {
                try {
                    const brandBase64 = await fetchImageBase64(row.brandImage);
                    if (brandBase64) {
                        const brandId = workbook.addImage({
                            base64: brandBase64,
                            extension: 'jpeg'
                        });
                        // Position below logo
                        ws.addImage(brandId, {
                            tl: { col: brandImgCol + 0.1, row: rowNumber - 1 + 0.35 },
                            ext: { width: 90, height: 42 }
                        });
                    }
                } catch (e) { console.log('Brand image error:', e); }
            }
        }
        const totalAmount = tier.rows.reduce((sum, row) => sum + (parseFloat(row.qty || 0) * parseFloat(row.rate || 0)), 0);
        const summaryRow = ws.addRow(isBoqMode
            ? ['', '', '', '', '', '', '', 'Total:', totalAmount.toFixed(2)]
            : ['', '', '', '', '', 'Total:', totalAmount.toFixed(2)]
        );
        summaryRow.height = 25;
        summaryRow.eachCell((cell, colNumber) => {
            if (colNumber >= (isBoqMode ? 8 : 6)) {
                cell.font = { bold: true, size: 11 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5A623' } };
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
            }
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const { saveAs } = await import('file-saver');
        saveAs(blob, `MultiBudget_${activeTier}_Offer.xlsx`);
    };

    // ===================== MULTI-BUDGET PPTX EXPORT (PREMIUM DESIGN) =====================
    const handleExportPPTX = async () => {
        const tier = tierData[activeTier];
        if (!tier || !tier.rows.length) return alert('No data to export');

        const PptxGenJS = (await import('pptxgenjs')).default;
        const pres = new PptxGenJS();
        const isBoqMode = tier.mode === 'boq';

        // Professional color palette
        const colors = {
            primary: '1E5FA8',      // Deep blue
            accent: 'F5A623',       // Gold/amber
            text: '2D3748',         // Dark gray
            lightText: '718096',    // Medium gray
            lightBg: 'F7FAFC',      // Light background
            white: 'FFFFFF',
            border: 'E2E8F0'
        };

        // Define premium slide master
        pres.defineSlideMaster({
            title: 'PREMIUM_MASTER',
            background: { color: colors.white },
            objects: [
                // Header bar
                { rect: { x: 0, y: 0, w: '100%', h: 0.75, fill: { color: colors.primary } } },
                // Gold accent line
                { rect: { x: 0, y: 0.75, w: '100%', h: 0.06, fill: { color: colors.accent } } },
                // Footer bar
                { rect: { x: 0, y: 5.2, w: '100%', h: 0.3, fill: { color: colors.lightBg } } }
            ]
        });

        // Title slide with enhanced design
        const titleSlide = pres.addSlide({ masterName: 'PREMIUM_MASTER' });
        titleSlide.addText('PRODUCT SHOWCASE', {
            x: 0.3, y: 0.2, w: 4, h: 0.4, fontSize: 14, bold: true, color: colors.white
        });
        titleSlide.addShape('rect', {
            x: 2, y: 1.8, w: 6, h: 1.5, fill: { color: colors.lightBg }, line: { color: colors.border, pt: 1 }
        });
        titleSlide.addText(`Multi-Budget Offer`, {
            x: 2, y: 2, w: 6, h: 0.6, fontSize: 32, bold: true, color: colors.primary, align: 'center'
        });
        titleSlide.addText(`${activeTier.charAt(0).toUpperCase() + activeTier.slice(1)} Tier`, {
            x: 2, y: 2.6, w: 6, h: 0.5, fontSize: 20, color: colors.accent, align: 'center'
        });
        titleSlide.addText(`${tier.rows.filter(r => r.brandImage || r.brandDesc).length} Products`, {
            x: 2, y: 3.8, w: 6, h: 0.3, fontSize: 12, color: colors.lightText, align: 'center'
        });

        let itemNum = 1;
        for (const row of tier.rows) {
            if (!row.brandImage && !row.brandDesc) continue;
            const slide = pres.addSlide({ masterName: 'PREMIUM_MASTER' });
            const brandName = (row.selectedBrand || '').replace(/Explore collections by/i, '').trim();

            // Header text
            slide.addText(`Item ${itemNum}: ${(row.brandDesc || '').substring(0, 55)}${(row.brandDesc || '').length > 55 ? '...' : ''}`, {
                x: 0.3, y: 0.2, w: 7.5, h: 0.4, fontSize: 13, bold: true, color: colors.white
            });

            // Top Right Logo box (Now Company Logo)
            slide.addShape('rect', {
                x: 8.3, y: 0.1, w: 1.5, h: 0.55, fill: { color: colors.white }, line: { color: colors.border, pt: 0.5 }
            });
            if (globalCompanyLogo) {
                try {
                    const logoImg = await getImageData(globalCompanyLogo);
                    if (logoImg) {
                        slide.addImage({ data: logoImg.dataUrl, x: 8.4, y: 0.15, w: 1.3, h: 0.45, sizing: { type: 'contain', w: 1.3, h: 0.45 } });
                    }
                } catch (e) { }
            } else {
                slide.addText('LOGO', { x: 8.3, y: 0.25, w: 1.5, h: 0.3, fontSize: 10, color: colors.lightText, align: 'center' });
            }

            // ===== LEFT COLUMN: Images =====
            const leftX = 0.3;
            let leftY = 1.0;
            const leftWidth = 4.5;

            // Reference image section (BOQ mode only)
            if (isBoqMode && row.imageRef) {
                const refUrl = getFullUrl(row.imageRef);
                try {
                    const refImg = await getImageData(refUrl);
                    if (refImg) {
                        // Reference label
                        slide.addText('Reference Image', { x: leftX, y: leftY, w: 1.5, h: 0.2, fontSize: 8, color: colors.lightText });
                        // Reference image container
                        slide.addShape('rect', {
                            x: leftX, y: leftY + 0.2, w: 1.4, h: 1.0,
                            fill: { color: colors.lightBg }, line: { color: colors.border, pt: 0.5 }
                        });
                        slide.addImage({ data: refImg.dataUrl, x: leftX + 0.05, y: leftY + 0.25, w: 1.3, h: 0.9, sizing: { type: 'contain', w: 1.3, h: 0.9 } });
                        leftY += 1.35;
                    }
                } catch (e) { }
            }

            // Brand badge (No logo now, logo moved above image)
            if (brandName) {
                slide.addShape('roundRect', {
                    x: leftX, y: leftY, w: 2.5, h: 0.4,
                    fill: { color: colors.lightBg }, line: { color: colors.primary, pt: 1 }
                });
                slide.addText(brandName.substring(0, 22), {
                    x: leftX + 0.15, y: leftY + 0.08, w: 2.3, h: 0.25, fontSize: 10, bold: true, color: colors.primary, align: 'center'
                });
                leftY += 0.5;
            }

            // Brand Logo moved above product image
            if (row.brandLogo) {
                try {
                    const brandLogoImg = await getImageData(row.brandLogo);
                    if (brandLogoImg) {
                        slide.addImage({
                            data: brandLogoImg.dataUrl,
                            x: leftX + (leftWidth - 1.0) / 2, y: leftY - 0.1,
                            w: 1.0, h: 0.35, sizing: { type: 'contain', w: 1.0, h: 0.35 }
                        });
                        leftY += 0.3;
                    }
                } catch (e) { }
            }

            // Main product image container
            const imgContainerH = 3.0;
            slide.addShape('rect', {
                x: leftX, y: leftY, w: leftWidth, h: imgContainerH,
                fill: { color: colors.white }, line: { color: colors.border, pt: 1 }
            });

            if (row.brandImage) {
                try {
                    const brandImg = await getImageData(row.brandImage);
                    if (brandImg) {
                        const maxW = (leftWidth - 0.2) * 96;
                        const maxH = (imgContainerH - 0.2) * 96;
                        const fit = calcFitSize(brandImg.width, brandImg.height, maxW, maxH);
                        const imgW = fit.w / 96;
                        const imgH = fit.h / 96;
                        const imgX = leftX + (leftWidth - imgW) / 2;
                        const imgY = leftY + (imgContainerH - imgH) / 2;
                        slide.addImage({ data: brandImg.dataUrl, x: imgX, y: imgY, w: imgW, h: imgH });
                    }
                } catch (e) { }
            }

            // ===== RIGHT COLUMN: Product Details =====
            const rightX = 5.0;
            let rightY = 1.0;
            const rightWidth = 4.7;

            // Product Details header
            slide.addText('Product Details', {
                x: rightX, y: rightY, w: rightWidth, h: 0.35, fontSize: 16, bold: true, color: colors.primary
            });
            rightY += 0.45;

            // Divider line
            slide.addShape('line', {
                x: rightX, y: rightY, w: rightWidth, h: 0,
                line: { color: colors.accent, pt: 2 }
            });
            rightY += 0.15;

            // Description section
            slide.addText('Description:', {
                x: rightX, y: rightY, w: rightWidth, h: 0.25, fontSize: 10, bold: true, color: colors.text
            });
            rightY += 0.25;
            const descText = (row.brandDesc || 'N/A').substring(0, 250);
            slide.addText(descText, {
                x: rightX, y: rightY, w: rightWidth, h: 1.0, fontSize: 9, color: colors.text, valign: 'top'
            });
            rightY += 1.1;

            // Brand info
            slide.addText('Brand:', {
                x: rightX, y: rightY, w: 0.8, h: 0.25, fontSize: 10, bold: true, color: colors.text
            });
            slide.addText(brandName || 'N/A', {
                x: rightX + 0.8, y: rightY, w: rightWidth - 0.8, h: 0.25, fontSize: 10, color: colors.primary
            });
            rightY += 0.35;

            // Quantity
            slide.addText('Quantity:', {
                x: rightX, y: rightY, w: 0.9, h: 0.25, fontSize: 10, bold: true, color: colors.text
            });
            slide.addText(String(row.qty || 'As per BOQ'), {
                x: rightX + 0.9, y: rightY, w: rightWidth - 0.9, h: 0.25, fontSize: 10, color: colors.text
            });
            rightY += 0.4;

            // Specifications section
            slide.addText('Specifications:', {
                x: rightX, y: rightY, w: rightWidth, h: 0.25, fontSize: 10, bold: true, color: colors.primary
            });
            rightY += 0.3;
            slide.addText('• Warranty: As per manufacturer', {
                x: rightX + 0.15, y: rightY, w: rightWidth - 0.15, h: 0.2, fontSize: 9, color: colors.text
            });
            rightY += 0.25;
            slide.addText('• Installation: Professional installation included', {
                x: rightX + 0.15, y: rightY, w: rightWidth - 0.15, h: 0.2, fontSize: 9, color: colors.text
            });

            // ===== FOOTER =====
            // Warranty section
            slide.addText('Warranty', {
                x: 0.3, y: 4.65, w: 1.0, h: 0.2, fontSize: 9, bold: true, color: colors.text
            });
            slide.addText('As per manufacturer - 5 years', {
                x: 0.3, y: 4.85, w: 2.0, h: 0.18, fontSize: 8, color: colors.lightText
            });

            // Page number
            slide.addText(`${itemNum} / ${tier.rows.filter(r => r.brandImage || r.brandDesc).length}`, {
                x: 9, y: 5.25, w: 0.8, h: 0.2, fontSize: 8, color: colors.lightText, align: 'right'
            });

            itemNum++;
        }

        pres.writeFile({ fileName: `MultiBudget_${activeTier}_Presentation.pptx` });
    };

    // ===================== MULTI-BUDGET PRESENTATION PDF (PREMIUM DESIGN) =====================
    const handleExportPresentationPDF = async () => {
        const tier = tierData[activeTier];
        if (!tier || !tier.rows.length) return alert('No data to export');

        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const isBoqMode = tier.mode === 'boq';
        const totalItems = tier.rows.filter(r => r.brandImage || r.brandDesc).length;

        // Professional color palette
        const colors = {
            primary: [30, 95, 168],      // Deep blue
            accent: [245, 166, 35],       // Gold/amber
            text: [45, 55, 72],           // Dark gray
            lightText: [113, 128, 150],   // Medium gray
            lightBg: [247, 250, 252],     // Light background
            white: [255, 255, 255],
            border: [226, 232, 240]
        };

        let itemNum = 1;

        for (const row of tier.rows) {
            if (!row.brandImage && !row.brandDesc) continue;
            if (itemNum > 1) doc.addPage();
            const brandName = (row.selectedBrand || '').replace(/Explore collections by/i, '').trim();

            // ===== HEADER BAR =====
            doc.setFillColor(...colors.primary);
            doc.rect(0, 0, pageWidth, 20, 'F');
            doc.setFillColor(...colors.accent);
            doc.rect(0, 20, pageWidth, 2.5, 'F');

            // Header title
            doc.setTextColor(...colors.white);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            const title = `Item ${itemNum}: ${(row.brandDesc || '').substring(0, 65)}${(row.brandDesc || '').length > 65 ? '...' : ''}`;
            doc.text(title, 10, 13);

            // Top Right Logo (Now Company Logo)
            doc.setFillColor(...colors.white);
            doc.setDrawColor(...colors.border);
            doc.roundedRect(pageWidth - 42, 3, 38, 14, 2, 2, 'FD');
            if (globalCompanyLogo) {
                try {
                    const docLogo = await getImageData(globalCompanyLogo);
                    if (docLogo) {
                        const fit = calcFitSize(docLogo.width, docLogo.height, 34, 10);
                        const logoX = pageWidth - 42 + (38 - fit.w) / 2;
                        doc.addImage(docLogo.dataUrl, 'JPEG', logoX, 5, fit.w, fit.h);
                    }
                } catch (e) { }
            } else {
                doc.setTextColor(...colors.lightText);
                doc.setFontSize(9);
                doc.text('LOGO', pageWidth - 28, 11);
            }

            // ===== LEFT COLUMN: Images =====
            const leftX = 10;
            let leftY = 28;
            const leftWidth = 120;

            // Reference image section (BOQ mode only)
            if (isBoqMode && row.imageRef) {
                const refUrl = getFullUrl(row.imageRef);
                try {
                    const refImg = await getImageData(refUrl);
                    if (refImg) {
                        // Reference label
                        doc.setTextColor(...colors.lightText);
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'normal');
                        doc.text('Reference Image', leftX, leftY);
                        leftY += 2;

                        // Reference image container
                        doc.setFillColor(...colors.lightBg);
                        doc.setDrawColor(...colors.border);
                        doc.roundedRect(leftX, leftY, 35, 25, 2, 2, 'FD');
                        const fit = calcFitSize(refImg.width, refImg.height, 31, 21);
                        const refX = leftX + (35 - fit.w) / 2;
                        const refY = leftY + (25 - fit.h) / 2;
                        doc.addImage(refImg.dataUrl, 'JPEG', refX, refY, fit.w, fit.h);
                        leftY += 30;
                    }
                } catch (e) { }
            }

            // Brand badge (No logo now)
            if (brandName) {
                doc.setFillColor(...colors.lightBg);
                doc.setDrawColor(...colors.primary);
                doc.setLineWidth(0.5);
                doc.roundedRect(leftX, leftY, 60, 12, 2, 2, 'FD');

                doc.setTextColor(...colors.primary);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text(brandName.substring(0, 30), leftX + 30, leftY + 7.5, { align: 'center' });
                leftY += 15;
            }

            // Brand Logo moved above product image
            if (row.brandLogo) {
                try {
                    const brandLogoImg = await getImageData(row.brandLogo);
                    if (brandLogoImg) {
                        const fit = calcFitSize(brandLogoImg.width, brandLogoImg.height, 30, 12);
                        const logoX = leftX + (imgContainerW - fit.w) / 2;
                        doc.addImage(brandLogoImg.dataUrl, 'JPEG', logoX, leftY - 12, fit.w, fit.h);
                    }
                } catch (e) { }
            }

            // Main product image container
            const imgContainerW = leftWidth;
            const imgContainerH = isBoqMode ? 100 : 130;
            doc.setFillColor(...colors.white);
            doc.setDrawColor(...colors.border);
            doc.setLineWidth(0.5);
            doc.roundedRect(leftX, leftY, imgContainerW, imgContainerH, 3, 3, 'FD');

            if (row.brandImage) {
                try {
                    const brandImg = await getImageData(row.brandImage);
                    if (brandImg) {
                        const fit = calcFitSize(brandImg.width, brandImg.height, imgContainerW - 8, imgContainerH - 8);
                        const imgX = leftX + (imgContainerW - fit.w) / 2;
                        const imgY = leftY + (imgContainerH - fit.h) / 2;
                        doc.addImage(brandImg.dataUrl, 'JPEG', imgX, imgY, fit.w, fit.h);
                    }
                } catch (e) { }
            }

            // ===== RIGHT COLUMN: Product Details =====
            const rightX = 145;
            let rightY = 28;
            const rightWidth = 135;

            // Product Details header
            doc.setTextColor(...colors.primary);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('Product Details', rightX, rightY);
            rightY += 4;

            // Gold accent line under header
            doc.setFillColor(...colors.accent);
            doc.rect(rightX, rightY, 50, 1.5, 'F');
            rightY += 8;

            // Description section
            doc.setTextColor(...colors.text);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Description:', rightX, rightY);
            rightY += 5;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const descLines = doc.splitTextToSize(row.brandDesc || 'N/A', rightWidth - 5);
            doc.text(descLines.slice(0, 6), rightX, rightY);
            rightY += Math.min(descLines.length, 6) * 4 + 8;

            // Brand info
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Brand:', rightX, rightY);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colors.primary);
            doc.text(brandName || 'N/A', rightX + 18, rightY);
            rightY += 8;

            // Quantity
            doc.setTextColor(...colors.text);
            doc.setFont('helvetica', 'bold');
            doc.text('Quantity:', rightX, rightY);
            doc.setFont('helvetica', 'normal');
            doc.text(String(row.qty || 'As per BOQ'), rightX + 22, rightY);
            rightY += 12;

            // Specifications section
            doc.setTextColor(...colors.primary);
            doc.setFont('helvetica', 'bold');
            doc.text('Specifications:', rightX, rightY);
            rightY += 6;

            doc.setTextColor(...colors.text);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('• Warranty: As per manufacturer', rightX + 3, rightY);
            rightY += 5;
            doc.text('• Installation: Professional installation included', rightX + 3, rightY);
            rightY += 5;
            doc.text('• Returns: Subject to terms and conditions', rightX + 3, rightY);

            // ===== FOOTER =====
            // Footer background
            doc.setFillColor(...colors.lightBg);
            doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');

            // Warranty section in footer
            doc.setTextColor(...colors.text);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.text('Warranty', 10, pageHeight - 6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...colors.lightText);
            doc.text('As per manufacturer - 5 years', 10, pageHeight - 2);

            // Page number
            doc.setTextColor(...colors.lightText);
            doc.setFontSize(8);
            doc.text(`${itemNum} / ${totalItems}`, pageWidth - 20, pageHeight - 4);

            itemNum++;
        }

        doc.save(`MultiBudget_${activeTier}_Presentation.pdf`);
    };

    // ===================== MULTI-BUDGET MAS PDF (PREMIUM DESIGN) =====================
    const handleExportMAS = async () => {
        const tier = tierData[activeTier];
        if (!tier || !tier.rows.length) return alert('No data to export');

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const isBoqMode = tier.mode === 'boq';
        const totalItems = tier.rows.filter(r => r.brandImage || r.brandDesc).length;

        // Professional color palette for formal documents
        const colors = {
            primary: [30, 41, 59],         // Slate 800
            accent: [245, 158, 11],        // Amber 500
            text: [51, 65, 85],            // Slate 600
            lightText: [100, 116, 139],    // Slate 500
            lightBg: [248, 250, 252],      // Slate 50
            white: [255, 255, 255],
            border: [203, 213, 225],       // Slate 300
            success: [16, 185, 129]        // Emerald 500
        };

        let itemNum = 1;

        for (const row of tier.rows) {
            if (!row.brandImage && !row.brandDesc) continue;
            if (itemNum > 1) doc.addPage();
            const brandName = (row.selectedBrand || '').replace(/Explore collections by/i, '').trim();

            // ===== HEADER BAR =====
            doc.setFillColor(...colors.primary);
            doc.rect(0, 0, pageWidth, 22, 'F');
            doc.setFillColor(...colors.accent);
            doc.rect(0, 22, pageWidth, 2, 'F');

            // Header title
            doc.setTextColor(...colors.white);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('MATERIAL APPROVAL SHEET', pageWidth / 2, 13, { align: 'center' });

            // Top Right Logo box (Now Company Logo)
            doc.setFillColor(...colors.white);
            doc.setDrawColor(...colors.border);
            doc.roundedRect(pageWidth - 38, 3, 34, 16, 1, 1, 'FD');
            if (globalCompanyLogo) {
                try {
                    const docLogo = await getImageData(globalCompanyLogo);
                    if (docLogo) {
                        const fit = calcFitSize(docLogo.width, docLogo.height, 30, 12);
                        const logoX = pageWidth - 38 + (34 - fit.w) / 2;
                        const logoY = 3 + (16 - fit.h) / 2;
                        doc.addImage(docLogo.dataUrl, 'JPEG', logoX, logoY, fit.w, fit.h);
                    }
                } catch (e) { }
            } else {
                doc.setTextColor(...colors.lightText);
                doc.setFontSize(8);
                doc.text('LOGO', pageWidth - 21, 12, { align: 'center' });
            }

            // ===== DOCUMENT INFO BAR =====
            doc.setFillColor(...colors.lightBg);
            doc.rect(0, 24, pageWidth, 14, 'F');
            doc.setDrawColor(...colors.border);
            doc.line(0, 38, pageWidth, 38);

            doc.setTextColor(...colors.text);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`Document No: MAS-${String(itemNum).padStart(3, '0')}`, 10, 31);
            doc.text(`Date: ${new Date().toLocaleDateString()}`, 10, 36);
            doc.text(`Item: ${itemNum} of ${totalItems}`, pageWidth / 2, 31, { align: 'center' });
            doc.setFont('helvetica', 'bold');
            doc.text(`Brand: ${brandName || 'N/A'}`, pageWidth - 10, 33, { align: 'right' });

            // ===== REFERENCE IMAGE (BOQ mode, small on right) =====
            let refImgOffset = 0;
            if (isBoqMode && row.imageRef) {
                const refUrl = row.imageRef.startsWith('http') ? row.imageRef : `http://localhost:3001${row.imageRef}`;
                try {
                    const refImg = await getImageData(refUrl);
                    if (refImg) {
                        doc.setTextColor(...colors.lightText);
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'normal');
                        doc.text('Reference:', pageWidth - 35, 43);

                        doc.setFillColor(...colors.lightBg);
                        doc.setDrawColor(...colors.border);
                        doc.roundedRect(pageWidth - 35, 45, 30, 22, 1, 1, 'FD');
                        const fit = calcFitSize(refImg.width, refImg.height, 28, 20);
                        const refX = pageWidth - 35 + (30 - fit.w) / 2;
                        const refY = 45 + (22 - fit.h) / 2;
                        doc.addImage(refImg.dataUrl, 'JPEG', refX, refY, fit.w, fit.h);
                    }
                } catch (e) { }
            }

            // ===== PRODUCT IMAGE SECTION =====
            let imgY = 45;
            const imgContainerW = 90;
            const imgContainerH = 65;
            const imgContainerX = (pageWidth - imgContainerW) / 2 - (isBoqMode ? 15 : 0);

            // Brand badge above image (No logo now)
            if (brandName) {
                const badgeW = 65;
                const badgeX = imgContainerX + (imgContainerW - badgeW) / 2;
                doc.setFillColor(...colors.lightBg);
                doc.setDrawColor(...colors.primary);
                doc.setLineWidth(0.4);
                doc.roundedRect(badgeX, imgY, badgeW, 10, 2, 2, 'FD');

                doc.setTextColor(...colors.primary);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.text(brandName.substring(0, 35), badgeX + badgeW / 2, imgY + 6.5, { align: 'center' });
                imgY += 12;
            }

            // Brand Logo moved above product image
            if (row.brandLogo) {
                try {
                    const brandLogoImg = await getImageData(row.brandLogo);
                    if (brandLogoImg) {
                        const fit = calcFitSize(brandLogoImg.width, brandLogoImg.height, 30, 8);
                        const logoX = imgContainerX + (imgContainerW - fit.w) / 2;
                        doc.addImage(brandLogoImg.dataUrl, 'JPEG', logoX, imgY - 10, fit.w, fit.h);
                    }
                } catch (e) { }
            }

            // Product image container
            doc.setFillColor(...colors.white);
            doc.setDrawColor(...colors.border);
            doc.setLineWidth(0.5);
            doc.roundedRect(imgContainerX, imgY, imgContainerW, imgContainerH, 3, 3, 'FD');

            if (row.brandImage) {
                try {
                    const brandImg = await getImageData(row.brandImage);
                    if (brandImg) {
                        const fit = calcFitSize(brandImg.width, brandImg.height, imgContainerW - 8, imgContainerH - 8);
                        const imgX = imgContainerX + (imgContainerW - fit.w) / 2;
                        const imgYPos = imgY + (imgContainerH - fit.h) / 2;
                        doc.addImage(brandImg.dataUrl, 'JPEG', imgX, imgYPos, fit.w, fit.h);
                    }
                } catch (e) { }
            }
            imgY += imgContainerH + 8;

            // ===== SPECIFICATIONS TABLE =====
            autoTable(doc, {
                startY: imgY,
                margin: { left: 15, right: 15 },
                head: [['Specification', 'Details']],
                body: [
                    ['Product Description', row.brandDesc || 'N/A'],
                    ['Brand / Manufacturer', brandName || 'N/A'],
                    ['Quantity Required', String(row.qty || 'As per BOQ')],
                    ['Unit Rate', row.rate ? `${row.rate}` : 'TBD'],
                    ['Origin', 'As per manufacturer specification'],
                    ['Warranty Period', 'As per manufacturer standard warranty'],
                    ['Lead Time', 'Subject to confirmation'],
                    ['Installation', 'Professional installation included']
                ],
                theme: 'plain',
                styles: {
                    fontSize: 9,
                    cellPadding: 4,
                    lineColor: colors.border,
                    lineWidth: 0.2
                },
                headStyles: {
                    fillColor: colors.primary,
                    textColor: colors.white,
                    fontStyle: 'bold',
                    fontSize: 10
                },
                bodyStyles: {
                    textColor: colors.text
                },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 55, fillColor: colors.lightBg },
                    1: { cellWidth: 'auto' }
                },
                alternateRowStyles: {
                    fillColor: [255, 255, 255]
                }
            });

            // ===== APPROVAL SECTION =====
            const approvalY = doc.lastAutoTable.finalY + 10;

            doc.setFillColor(...colors.lightBg);
            doc.rect(15, approvalY, pageWidth - 30, 30, 'F');
            doc.setDrawColor(...colors.border);
            doc.rect(15, approvalY, pageWidth - 30, 30, 'S');

            doc.setTextColor(...colors.primary);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('APPROVAL SIGNATURES', 20, approvalY + 6);

            // Signature boxes
            const boxWidth = (pageWidth - 50) / 3;
            const signatureLabels = ['Prepared By', 'Reviewed By', 'Approved By'];
            signatureLabels.forEach((label, i) => {
                const boxX = 20 + i * (boxWidth + 5);
                doc.setDrawColor(...colors.border);
                doc.rect(boxX, approvalY + 10, boxWidth, 16, 'S');
                doc.setTextColor(...colors.lightText);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.text(label, boxX + 2, approvalY + 14);
                doc.text('Signature: ________________', boxX + 2, approvalY + 22);
            });

            // ===== FOOTER =====
            doc.setFillColor(...colors.lightBg);
            doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');

            doc.setTextColor(...colors.lightText);
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.text('This document is for material approval purposes only.', 10, pageHeight - 4);
            doc.text(`Page ${itemNum} of ${totalItems}`, pageWidth - 10, pageHeight - 4, { align: 'right' });

            itemNum++;
        }

        doc.save(`MultiBudget_${activeTier}_MAS.pdf`);
    };

    const renderTable = (tier) => {
        if (!tier) return null;
        const { rows, mode } = tier;
        const isBoqMode = mode === 'boq';

        return (
            <table className={styles.budgetTable}>
                <thead>
                    <tr>
                        <th style={{ width: '50px' }}>Sl</th>
                        {isBoqMode && <th style={{ width: '80px' }}>Ref Img</th>}
                        {isBoqMode && <th style={{ minWidth: '200px' }}>Original Desc</th>}
                        <th style={{ width: '80px' }}>Brand Img</th>
                        <th style={{ width: '200px' }}>Brand Desc</th>
                        <th style={{ width: '50px' }}>Qty</th>
                        <th style={{ width: '50px' }}>Unit</th>
                        <th style={{ width: '80px' }}>Rate</th>
                        <th style={{ width: '90px' }}>Amount</th>
                        <th style={{ width: '180px' }}>Product Selection</th>
                        <th style={{ width: '60px' }}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => {
                        const refImgSrc = row.imageRef ? (String(row.imageRef).startsWith('http') ? row.imageRef : `http://localhost:3001${row.imageRef}`) : null;

                        // Active Data for Dropdowns
                        const activeBrand = brands.find(b => b.name === row.selectedBrand);
                        const brandProducts = activeBrand?.products || [];

                        // Filter Logic
                        const mainCats = getUniqueValues(brandProducts, 'mainCategory');
                        const subCats = getUniqueValues(brandProducts.filter(p => p.mainCategory === row.selectedMainCat), 'subCategory');
                        const families = getUniqueValues(brandProducts.filter(p => p.mainCategory === row.selectedMainCat && p.subCategory === row.selectedSubCat), 'family');

                        // To solve "missing products" like Sokoa variants (same model name), 
                        // we'll append a short description snippet to the model selection if multiple products have the same model.
                        const rawModels = brandProducts.filter(p => p.mainCategory === row.selectedMainCat && p.subCategory === row.selectedSubCat && p.family === row.selectedFamily);
                        const modelGroups = {};
                        rawModels.forEach(p => {
                            if (!modelGroups[p.model]) modelGroups[p.model] = [];
                            modelGroups[p.model].push(p);
                        });

                        const modelOptions = [];
                        Object.entries(modelGroups).forEach(([modelName, items]) => {
                            if (items.length > 1) {
                                // Add each variant with a snippet of description or unique ID
                                items.forEach((item, i) => {
                                    const snippet = item.description ? item.description.substring(0, 25) + '...' : `Variant ${i + 1}`;
                                    modelOptions.push({
                                        value: item.productUrl, // Use URL as unique value for better matching
                                        label: `${modelName} (${snippet})`,
                                        rawModel: modelName
                                    });
                                });
                            } else {
                                modelOptions.push({
                                    value: items[0].productUrl,
                                    label: modelName,
                                    rawModel: modelName
                                });
                            }
                        });

                        return (
                            <tr key={row.id}>
                                <td>{row.sn}</td>

                                {/* Ref Image (BOQ Only) */}
                                {isBoqMode && (
                                    <td>
                                        {row.imageRef ? (
                                            <div className={styles.imgPlaceholder} style={{ background: 'none' }}>
                                                <img
                                                    src={refImgSrc}
                                                    alt="ref"
                                                    className={styles.tableImg}
                                                    onClick={() => {
                                                        setPreviewImage(refImgSrc);
                                                        setPreviewLogo(null);
                                                    }}
                                                />
                                            </div>
                                        ) : (
                                            <div className={styles.imgPlaceholder}>No Img</div>
                                        )}
                                    </td>
                                )}

                                {/* Original Description (BOQ Only) */}
                                {isBoqMode && (
                                    <td>
                                        <textarea
                                            className={styles.cellInput}
                                            value={row.description}
                                            onChange={(e) => handleCellChange(index, 'description', e.target.value)}
                                            style={{ minHeight: '80px', resize: 'vertical' }}
                                        />
                                    </td>
                                )}

                                {/* Brand Image */}
                                <td>
                                    <div className={styles.brandImageCell}>
                                        {/* Brand Logo Badge */}
                                        {row.brandLogo && (
                                            <div className={styles.brandLogoBadge}>
                                                <img src={row.brandLogo} alt="" className={styles.badgeLogo} />
                                            </div>
                                        )}

                                        {/* Product Image */}
                                        {row.brandImage ? (
                                            <img
                                                src={row.brandImage}
                                                alt="brand"
                                                className={styles.tableImg}
                                                onClick={() => {
                                                    setPreviewImage(row.brandImage);
                                                    setPreviewLogo(row.brandLogo);
                                                }}
                                            />
                                        ) : (
                                            <div className={styles.imgPlaceholder}>Select</div>
                                        )}
                                    </div>
                                </td>

                                {/* Brand Description */}
                                <td>
                                    <textarea className={styles.cellInput} value={row.brandDesc} onChange={(e) => handleCellChange(index, 'brandDesc', e.target.value)} style={{ minHeight: '80px' }} placeholder="Product details..." />
                                </td>

                                <td>
                                    <input className={styles.cellInput} value={row.qty} onChange={(e) => handleCellChange(index, 'qty', e.target.value)} style={{ textAlign: 'center' }} />
                                </td>
                                <td>
                                    <input className={styles.cellInput} value={row.unit} onChange={(e) => handleCellChange(index, 'unit', e.target.value)} />
                                </td>
                                <td>
                                    <input className={styles.cellInput} value={row.rate} onChange={(e) => handleCellChange(index, 'rate', e.target.value)} style={{ textAlign: 'right' }} />
                                </td>
                                <td>
                                    <div style={{ textAlign: 'right', paddingRight: '5px' }}>
                                        {row.amount || (parseFloat(row.qty || 0) * parseFloat(row.rate || 0)).toFixed(2)}
                                    </div>
                                </td>

                                {/* CASCADING DROPDOWNS COLUMN (Moved) */}
                                <td>
                                    <div className={styles.dropdownStack}>
                                        {/* 1. Brand Selector */}
                                        <div className={styles.brandDropdownContainer}>
                                            {/* Trigger Button */}
                                            <button
                                                className={`${styles.brandTrigger} ${row.selectedBrand ? styles.brandSelected : ''}`}
                                                onClick={() => setOpenBrandDropdown(openBrandDropdown === index ? null : index)}
                                            >
                                                {row.selectedBrand ? (
                                                    <>
                                                        {row.brandLogo ? (
                                                            <img src={row.brandLogo} alt="" className={styles.triggerLogo} />
                                                        ) : (
                                                            <span className={styles.triggerInitial}>{row.selectedBrand.charAt(0)}</span>
                                                        )}
                                                        <span className={styles.triggerText}>{row.selectedBrand}</span>
                                                    </>
                                                ) : (
                                                    <span className={styles.triggerPlaceholder}>Select Brand...</span>
                                                )}
                                                <span className={styles.triggerArrow}>{openBrandDropdown === index ? '▲' : '▼'}</span>
                                            </button>

                                            {/* Dropdown Panel */}
                                            {openBrandDropdown === index && (
                                                <div className={styles.brandDropdownPanel}>
                                                    {brands.map(b => (
                                                        <button
                                                            key={b.id}
                                                            className={`${styles.brandOption} ${row.selectedBrand === b.name ? styles.brandOptionActive : ''}`}
                                                            onClick={() => {
                                                                handleCellChange(index, 'selectedBrand', b.name);
                                                                setOpenBrandDropdown(null);
                                                            }}
                                                        >
                                                            {b.logo ? (
                                                                <img src={b.logo} alt="" className={styles.optionLogo} />
                                                            ) : (
                                                                <span className={styles.optionInitial}>{b.name.charAt(0)}</span>
                                                            )}
                                                            <span className={styles.optionName}>
                                                                {b.name.replace(/Explore collections by/i, '').trim()}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* 2. Main Category */}
                                        {row.selectedBrand && (
                                            <select className={styles.productSelect} value={row.selectedMainCat} onChange={(e) => handleCellChange(index, 'selectedMainCat', e.target.value)}>
                                                <option value="">Select Category...</option>
                                                {mainCats.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        )}

                                        {/* 3. Sub Category */}
                                        {row.selectedMainCat && (
                                            <select className={styles.productSelect} value={row.selectedSubCat} onChange={(e) => handleCellChange(index, 'selectedSubCat', e.target.value)}>
                                                <option value="">Select Sub-Category...</option>
                                                {subCats.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        )}

                                        {/* 4. Family */}
                                        {row.selectedSubCat && (
                                            <select className={styles.productSelect} value={row.selectedFamily} onChange={(e) => handleCellChange(index, 'selectedFamily', e.target.value)}>
                                                <option value="">Select Family...</option>
                                                {families.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        )}

                                        {/* 5. Model (With Variant Support) */}
                                        {row.selectedFamily && (
                                            <select
                                                className={styles.productSelect}
                                                value={row.selectedModelUrl || ''}
                                                onChange={(e) => {
                                                    const opt = modelOptions.find(o => o.value === e.target.value);
                                                    handleCellChange(index, 'selectedModel', {
                                                        model: opt?.rawModel || '',
                                                        url: e.target.value
                                                    });
                                                }}
                                            >
                                                <option value="">Select Model/Variant...</option>
                                                {modelOptions.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </td>

                                <td>
                                    <div className={styles.actionsCell}>
                                        <button className={`${styles.iconBtn} ${styles.add}`} onClick={() => handleAddRow(index)}>+</button>
                                        <button className={`${styles.iconBtn} ${styles.remove}`} onClick={() => handleRemoveRow(index)}>×</button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        );
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContainer} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.title}>
                        💰 Multi-Budget Offers
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>×</button>
                </div>

                {/* Main Content (Flex Column) */}
                <div className={styles.content}>

                    {/* Fixed Top Section: Actions + Tabs */}
                    <div className={styles.topSection}>
                        <div className={styles.mainActions}>
                            <button className={styles.actionCard} onClick={handleGenerateFromBoq}>
                                📝 Generate from BOQ
                            </button>
                            <button className={styles.actionCard} onClick={handleCreateNewBoq}>
                                ➕ Create New BOQ
                            </button>
                            <button className={styles.actionCard} onClick={handleAddBrand}>
                                🌐 Add Brand
                            </button>
                        </div>

                        <div className={styles.tabsContainer}>
                            <button className={`${styles.tab} ${activeTier === 'budgetary' ? styles.activeTabBudgetary : ''}`} onClick={() => setActiveTier('budgetary')}>
                                💰 Budgetary
                            </button>
                            <button className={`${styles.tab} ${activeTier === 'mid' ? styles.activeTabMid : ''}`} onClick={() => setActiveTier('mid')}>
                                ⭐ Mid-Range
                            </button>
                            <button className={`${styles.tab} ${activeTier === 'high' ? styles.activeTabHigh : ''}`} onClick={() => setActiveTier('high')}>
                                👑 High-End
                            </button>
                        </div>
                    </div>

                    {/* Scrollable Table Area */}
                    <div className={styles.tableContainer}>
                        {tierData[activeTier] ? (
                            renderTable(tierData[activeTier])
                        ) : (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                <div style={{ fontSize: '3rem', opacity: 0.2 }}>📋</div>
                                <div style={{ marginTop: '1rem' }}>No table data yet. Click "Generate from BOQ" or "Create New BOQ".</div>
                            </div>
                        )}
                    </div>

                    {/* Fixed Footer */}
                    <div className={styles.footer}>
                        <button className={styles.applyCostingBtn} onClick={() => setIsCostingOpen(true)}>
                            💰 Apply Costing to Table
                        </button>

                        <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

                        <div className={styles.exportGroup}>
                            <button className={styles.exportBtn} onClick={handleExportPDF}>📄 Offer PDF</button>
                            <button className={styles.exportBtn} onClick={handleExportExcel}>📊 Offer Excel</button>
                            <button className={styles.exportBtn} onClick={handleExportPPTX}>📽️ Presentation</button>
                            <button className={styles.exportBtn} onClick={handleExportPresentationPDF}>📑 PDF</button>
                            <button className={styles.exportBtn} onClick={handleExportMAS}>📋 MAS</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Image Preview Overlay */}
            {previewImage && (
                <div className={styles.previewOverlay} onClick={(e) => { e.stopPropagation(); setPreviewImage(null); setPreviewLogo(null); }}>
                    <div className={styles.previewContent} onClick={e => e.stopPropagation()}>
                        <button className={styles.previewCloseBtn} onClick={() => { setPreviewImage(null); setPreviewLogo(null); }}>×</button>

                        {/* Brand Logo Badge in Modal */}
                        {previewLogo && (
                            <div className={styles.previewLogoBadge}>
                                <img src={previewLogo} alt="brand logo" className={styles.previewBadgeLogo} />
                            </div>
                        )}

                        <img src={previewImage} alt="Full view" className={styles.previewImage} />
                    </div>
                </div>
            )}
            {/* Add Brand Modal */}
            <AddBrandModal
                isOpen={isAddBrandOpen}
                onClose={() => setIsAddBrandOpen(false)}
                onBrandAdded={handleBrandAdded}
            />
            {/* Costing Modal */}
            <CostingModal
                isOpen={isCostingOpen}
                onClose={() => setIsCostingOpen(false)}
                initialFactors={costingFactors}
                onApply={handleApplyCosting}
            />
        </div>
    );
}
