// Validation rules
const VALIDATION_RULES = {
    required: ['bioId', 'sessionId', 'deviceId'],

    commonMistakes: {
        'BioID': 'bioId',
        'BioId': 'bioId',
        'Bio_ID': 'bioId',
        'bio_id': 'bioId',
        'bio-id': 'bioId',
        'SessionID': 'sessionId',
        'Session_ID': 'sessionId',
        'session_id': 'sessionId',
        'session-id': 'sessionId',
        'DeviceID': 'deviceId',
        'Device_ID': 'deviceId',
        'Device_Id': 'deviceId',
        'device_id': 'deviceId',
        'device-id': 'deviceId'
    },

    vendorFields: [
        'vendor_internal_field',
        'vendor_tracking_id',
        'internal_tracking_id',
        'partner_reference',
        'partner_id',
        'external_reference',
        'tracking_id'
    ]
};

function extractField(text, fieldName) {
    // ONLY extract exact field name (case-sensitive)
    const patterns = [
        // Standard format: fieldName: value
        new RegExp(`\\b${fieldName}\\s*:\\s*([^,\\n\\r]+)`),
        // JSON format: "fieldName": "value"
        new RegExp(`"${fieldName}"\\s*:\\s*"([^"]+)"`),
        // Single quote: 'fieldName': 'value'
        new RegExp(`'${fieldName}'\\s*:\\s*'([^']+)'`),
        // Swift/iOS Dictionary format: AnyHashable("fieldName"): value
        new RegExp(`AnyHashable\\(\\s*"${fieldName}"\\s*\\)\\s*:\\s*([^,\\n\\r]+)`, 'i'),
        // Without AnyHashable: ("fieldName"): value
        new RegExp(`\\(\\s*"${fieldName}"\\s*\\)\\s*:\\s*([^,\\n\\r]+)`, 'i')
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            let value = match[1].trim();

            // Clean up trailing junk: commas, brackets, XML tags, etc.
            // Remove everything after first occurrence of these terminators
            value = value.replace(/[,;}\]<]+.*$/, '').trim();

            return value;
        }
    }
    return null;
}

function extractBioIdFromPortalLink(text) {
    // Extract bioId from portal link
    const pattern = /portal2\.digibank\.vn\/onboarding\/bio-id\/([^\/\s]+)/i;
    const match = text.match(pattern);
    return match ? match[1].trim() : null;
}

function extractFieldFlexible(text, fieldName) {
    // First try exact extraction
    let value = extractField(text, fieldName);
    if (value) return value;

    // Fallback: Try flexible patterns based on expected format

    if (fieldName === 'bioId') {
        // bioId: Look for UUID_SHA1_timestamp pattern (91 chars)
        // Pattern: 8-4-4-4-12_40hex_13digits
        const bioIdPattern = /\b([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_[0-9a-fA-F]{40}_\d{13})\b/;
        const match = text.match(bioIdPattern);
        if (match) return match[1];

        // Also try common field names (case-insensitive)
        const flexPatterns = [
            /BIO_ID\s*[:\s]+([^\s,\n]+)/i,
            /bioId\s*[:\s]+([^\s,\n]+)/i,
            /bio_id\s*[:\s]+([^\s,\n]+)/i,
            /bio-id\s*[:\s]+([^\s,\n]+)/i
        ];
        for (const pattern of flexPatterns) {
            const m = text.match(pattern);
            if (m) {
                let val = m[1].trim();
                val = val.replace(/[,;}\]<]+.*$/, '').trim();
                // Validate it looks like bioId (has underscores and reasonable length)
                if (val.includes('_') && val.length > 50) return val;
            }
        }
    }

    if (fieldName === 'sessionId') {
        // sessionId: Look for 64 hex chars
        const sessionIdPattern = /\b([0-9a-fA-F]{64})\b/;
        const match = text.match(sessionIdPattern);
        if (match) return match[1];

        // Also try with quotes or field name
        const quotedPattern = /"sessionId"\s*[:\s]+"([0-9a-fA-F]{64})"/i;
        const qm = text.match(quotedPattern);
        if (qm) return qm[1];
    }

    if (fieldName === 'deviceId') {
        // deviceId: Look for 40 hex chars (but not part of bioId)
        // Find all 40-char hex strings
        const deviceIdPattern = /\b([0-9a-fA-F]{40})\b/g;
        let match;
        const candidates = [];
        while ((match = deviceIdPattern.exec(text)) !== null) {
            candidates.push(match[1]);
        }

        // // If we found a bioId, exclude the deviceId that's part of it
        // const bioIdValue = extractFieldFlexible(text, 'bioId');
        // if (bioIdValue && bioIdValue.includes('_')) {
        //     const bioIdDeviceId = extractDeviceIdFromBioId(bioIdValue);
        //     // Return a deviceId that's different from bioId's deviceId, or the same one if only one exists
        //     const others = candidates.filter(c => c.toLowerCase() !== bioIdDeviceId?.toLowerCase());
        //     if (others.length > 0) return others[0];
        //     if (bioIdDeviceId) return bioIdDeviceId;
        // }

        // No bioId found, return first 40-char hex
        if (candidates.length > 0) return candidates[0];
    }

    return null;
}

function findWrongFormatFields(text, correctFieldName) {
    // Find fields with wrong format - will be used for manual check warnings
    const found = [];
    const foundValues = new Set(); // Track to avoid duplicates

    Object.keys(VALIDATION_RULES.commonMistakes).forEach(wrongFormat => {
        if (VALIDATION_RULES.commonMistakes[wrongFormat] === correctFieldName) {
            const patterns = [
                // Standard format
                new RegExp(`\\b${wrongFormat}\\s*[:=]\\s*([^,\\n\\r]+)`, 'i'),
                // Dictionary format: AnyHashable("WrongFormat"): value
                new RegExp(`AnyHashable\\(\\s*"${wrongFormat}"\\s*\\)\\s*:\\s*([^,\\n\\r]+)`, 'i'),
                // Without AnyHashable: ("WrongFormat"): value
                new RegExp(`\\(\\s*"${wrongFormat}"\\s*\\)\\s*:\\s*([^,\\n\\r]+)`, 'i')
            ];

            // Try each pattern, stop after first match for this wrongFormat
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                    let value = match[1].trim();

                    // Clean up trailing junk: commas, brackets, XML tags, etc.
                    value = value.replace(/[,;}\]<]+.*$/, '').trim();

                    // Create unique key to check for duplicates
                    const uniqueKey = `${wrongFormat}:${value}`;

                    if (!foundValues.has(uniqueKey)) {
                        foundValues.add(uniqueKey);
                        found.push({
                            wrongField: wrongFormat,
                            value: value,
                            correctField: correctFieldName
                        });
                    }
                    break; // Found match for this wrongFormat, move to next
                }
            }
        }
    });

    return found;
}

function validateBioIdFormat(bioId) {
    // bioId format: <uuid-v4>_<deviceId>_<unix-timestamp>
    // Total length: 91 chars
    // uuid-v4: 8-4-4-4-12 (36 chars with hyphens)
    // deviceId: 40 chars (SHA1)
    // unix_timestamp: 13 chars (milliseconds)
    // Total: 36 + 1 + 40 + 1 + 13 = 91

    if (bioId.length !== 91) {
        return {
            valid: false,
            reason: `Độ dài không đúng: ${bioId.length} chars (phải là 91 chars)`
        };
    }

    const parts = bioId.split('_');
    if (parts.length !== 3) {
        return {
            valid: false,
            reason: `Phải có đúng 2 dấu gạch dưới (_), tìm thấy ${parts.length - 1}`
        };
    }

    const [uuid, deviceId, timestamp] = parts;

    // Validate UUID v4 format: 8-4-4-4-12
    const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidPattern.test(uuid)) {
        return {
            valid: false,
            reason: `UUID không đúng format (phải là 8-4-4-4-12): ${uuid}`
        };
    }

    // Validate deviceId (SHA1 - 40 hex chars)
    if (deviceId.length !== 40) {
        return {
            valid: false,
            reason: `deviceId trong bioId phải 40 chars (SHA1), tìm thấy ${deviceId.length} chars`
        };
    }

    if (!/^[0-9a-fA-F]{40}$/.test(deviceId)) {
        return {
            valid: false,
            reason: `deviceId trong bioId phải là hex (0-9, A-F): ${deviceId}`
        };
    }

    // Validate timestamp (13 digits - milliseconds)
    if (timestamp.length !== 13) {
        return {
            valid: false,
            reason: `Timestamp phải 13 chars (milliseconds), tìm thấy ${timestamp.length} chars`
        };
    }

    if (!/^\d{13}$/.test(timestamp)) {
        return {
            valid: false,
            reason: `Timestamp phải là số: ${timestamp}`
        };
    }

    return { valid: true };
}

function validateSessionIdFormat(sessionId) {
    // sessionId: SHA256 hash
    // Length: 64 hex chars (256 bits = 32 bytes = 64 hex chars)

    if (sessionId.length !== 64) {
        return {
            valid: false,
            reason: `Độ dài không đúng: ${sessionId.length} chars (phải là 64 chars - SHA256)`
        };
    }

    if (!/^[0-9a-fA-F]{64}$/.test(sessionId)) {
        return {
            valid: false,
            reason: `Phải là hex (0-9, A-F), 64 chars`
        };
    }

    return { valid: true };
}

function validateDeviceIdFormat(deviceId) {
    // deviceId: SHA1 hash
    // Length: 40 hex chars (160 bits = 20 bytes = 40 hex chars)

    if (deviceId.length !== 40) {
        return {
            valid: false,
            reason: `Độ dài không đúng: ${deviceId.length} chars (phải là 40 chars - SHA1)`
        };
    }

    if (!/^[0-9a-fA-F]{40}$/.test(deviceId)) {
        return {
            valid: false,
            reason: `Phải là hex (0-9, A-F), 40 chars`
        };
    }

    return { valid: true };
}

function extractDeviceIdFromBioId(bioId) {
    // Extract deviceId from bioId format: uuid_deviceId_timestamp
    const parts = bioId.split('_');
    if (parts.length === 3) {
        return parts[1]; // Return the middle part
    }
    return null;
}

function validateTicket() {
    const description = document.getElementById('ticket-description').value.trim();

    if (!description) {
        alert('⚠️ Vui lòng nhập Description!');
        return;
    }

    const result = {
        errors: [],
        warnings: [],
        extracted: {},
        wrongFormatFields: [],
        isValid: true
    };

    // Step 1: Extract ONLY correct format fields (exact case match)
    // Try flexible extraction if exact fails
    VALIDATION_RULES.required.forEach(field => {
        const value = extractFieldFlexible(description, field);
        if (value) {
            result.extracted[field] = value;
        }
    });

    // Step 1b: Special case - bioId can also be extracted from portal link
    if (!result.extracted.bioId) {
        const bioIdFromLink = extractBioIdFromPortalLink(description);
        if (bioIdFromLink) {
            result.extracted.bioId = bioIdFromLink;
            result.warnings.push({
                type: 'extracted_from_link',
                field: 'bioId',
                value: bioIdFromLink,
                message: `bioId được extract từ Portal link: ${bioIdFromLink}`
            });
        }
    }

    // Step 1c: Validate bioId format (91 chars, UUID_SHA1_timestamp)
    if (result.extracted.bioId) {
        const bioIdValidation = validateBioIdFormat(result.extracted.bioId);
        if (!bioIdValidation.valid) {
            result.warnings.push({
                type: 'bioid_format_invalid',
                field: 'bioId',
                value: result.extracted.bioId,
                message: `bioId format không đúng: ${bioIdValidation.reason}`
            });
        }
    }

    // Step 1d: Validate sessionId format (64 chars SHA256)
    if (result.extracted.sessionId) {
        const sessionIdValidation = validateSessionIdFormat(result.extracted.sessionId);
        if (!sessionIdValidation.valid) {
            result.warnings.push({
                type: 'sessionid_format_invalid',
                field: 'sessionId',
                value: result.extracted.sessionId,
                message: `sessionId format không đúng: ${sessionIdValidation.reason}`
            });
        }
    }

    // Step 1e: Validate deviceId format (40 chars SHA1)
    if (result.extracted.deviceId) {
        const deviceIdValidation = validateDeviceIdFormat(result.extracted.deviceId);
        if (!deviceIdValidation.valid) {
            result.warnings.push({
                type: 'deviceid_format_invalid',
                field: 'deviceId',
                value: result.extracted.deviceId,
                message: `deviceId format không đúng: ${deviceIdValidation.reason}`
            });
        }
    }

    // Step 1f: Check deviceId matching with bioId (only if both are valid format)
    if (result.extracted.bioId && result.extracted.deviceId) {
        const bioIdValidation = validateBioIdFormat(result.extracted.bioId);
        const deviceIdValidation = validateDeviceIdFormat(result.extracted.deviceId);

        if (bioIdValidation.valid && deviceIdValidation.valid) {
            const deviceIdFromBioId = extractDeviceIdFromBioId(result.extracted.bioId);
            if (deviceIdFromBioId && deviceIdFromBioId.toLowerCase() !== result.extracted.deviceId.toLowerCase()) {
                result.warnings.push({
                    type: 'deviceid_mismatch',
                    field: 'deviceId',
                    value: result.extracted.deviceId,
                    bioIdDeviceId: deviceIdFromBioId,
                    message: `deviceId không khớp với bioId - deviceId trong bioId là "${deviceIdFromBioId}" nhưng deviceId field là "${result.extracted.deviceId}". Khách hàng đã thay đổi thiết bị (lần đầu dùng deviceId khác).`
                });
            }
        }
    }

    // Step 2: Find ALL wrong format fields - these go to WARNINGS for manual check
    // ONLY warn if we DON'T already have the correct field
    VALIDATION_RULES.required.forEach(correctField => {
        const hasCorrectField = !!result.extracted[correctField];

        // Only check for wrong format if we don't have the correct one
        if (!hasCorrectField) {
            const wrongFields = findWrongFormatFields(description, correctField);

            wrongFields.forEach(wrong => {
                result.wrongFormatFields.push({
                    correctField: correctField,
                    wrongField: wrong.wrongField,
                    value: wrong.value
                });

                result.warnings.push({
                    type: 'wrong_format_field',
                    correctField: correctField,
                    wrongField: wrong.wrongField,
                    value: wrong.value,
                    message: `Phát hiện trường sai format "${wrong.wrongField}: ${wrong.value}" - cần manual check xem có phải là "${correctField}" không`
                });
            });
        }
    });

    // Step 3: Check for COMPLETELY missing fields (no correct format AND no wrong format found)
    VALIDATION_RULES.required.forEach(field => {
        const hasCorrectField = !!result.extracted[field];
        const hasWrongField = result.wrongFormatFields.some(wf => wf.correctField === field);

        if (!hasCorrectField && !hasWrongField) {
            result.errors.push({
                type: 'completely_missing',
                field: field,
                message: `Thiếu hoàn toàn trường "${field}" - không tìm thấy cả trường đúng lẫn sai format`
            });
            result.isValid = false;
        }
    });

    // Step 4: Check for vendor fields (warning only)
    VALIDATION_RULES.vendorFields.forEach(vendorField => {
        const pattern = new RegExp(`\\b${vendorField}\\s*[:=]\\s*([^\\n\\r]+)`, 'i');
        const match = description.match(pattern);
        if (match) {
            result.warnings.push({
                type: 'vendor_field',
                field: vendorField,
                value: match[1].trim(),
                message: `Phát hiện trường "${vendorField}: ${match[1].trim()}" - đây là trường của vendor/hệ thống khác, không phải eKYC Solution`
            });
        }
    });

    displayResults(result, description);
}

function displayResults(result, description) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.className = 'results-section show';

    let html = '';

    // Statistics
    html += '<div class="stats">';
    html += `<div class="stat-box errors">
                <div class="stat-number">${result.errors.length}</div>
                <div class="stat-label">Lỗi</div>
             </div>`;
    html += `<div class="stat-box warnings">
                <div class="stat-number">${result.warnings.length}</div>
                <div class="stat-label">Cảnh báo</div>
             </div>`;
    html += `<div class="stat-box valid">
                <div class="stat-number">${result.isValid ? '✓' : '✗'}</div>
                <div class="stat-label">${result.isValid ? 'Hợp lệ' : 'Không hợp lệ'}</div>
             </div>`;
    html += '</div>';

    // Overall result
    if (result.isValid && result.warnings.length === 0) {
        html += `<div class="result-card success">
                    <div class="result-header">
                        <span class="icon">✅</span>
                        <span>Extract thành công! Dữ liệu đầy đủ và hợp lệ</span>
                    </div>
                    <p>Tất cả thông tin đều đúng format. Click vào giá trị bên dưới để copy nhanh.</p>
                 </div>`;
    } else if (result.isValid && result.warnings.length > 0) {
        html += `<div class="result-card warning">
                    <div class="result-header">
                        <span class="icon">⚠️</span>
                        <span>Extract thành công nhưng có ${result.warnings.length} cảnh báo</span>
                    </div>
                    <p>Format cơ bản đúng, nhưng nên kiểm tra lại các cảnh báo bên dưới.</p>
                 </div>`;
    } else {
        html += `<div class="result-card error">
                    <div class="result-header">
                        <span class="icon">❌</span>
                        <span>Phát hiện ${result.errors.length} lỗi cần sửa</span>
                    </div>
                    <p>Thiếu thông tin bắt buộc. Vui lòng kiểm tra lại log/description.</p>
                 </div>`;
    }

    // Extracted information with 1-click copy
    if (Object.keys(result.extracted).length > 0) {
        html += '<h3 style="margin: 25px 0 15px 0; color: #1565c0;">📊 Thông tin đã extract (click để copy):</h3>';
        html += '<div class="extracted-info">';

        VALIDATION_RULES.required.forEach(field => {
            const value = result.extracted[field];
            html += `<div class="info-item" style="cursor: pointer; transition: all 0.2s;" 
                          onclick="copyToClipboard('${value || ''}', this)" 
                          title="Click để copy giá trị">
                        <label>${field}:</label>
                        <div class="value ${value ? '' : 'missing'}">
                            ${value || '&lt;không tìm thấy&gt;'}
                        </div>
                     </div>`;
        });

        html += '</div>';
    }

    // Errors
    if (result.errors.length > 0) {
        html += '<h3 style="margin: 25px 0 15px 0; color: #c62828;">🚫 Lỗi nghiêm trọng (phải sửa):</h3>';
        html += '<ul class="error-list">';

        result.errors.forEach((error, index) => {
            html += '<li>';
            html += `<div style="margin-bottom: 8px;"><strong>${index + 1}. ${error.message}</strong></div>`;

            if (error.type === 'completely_missing') {
                html += `<div style="margin-bottom: 8px; color: #666;">
                            Không tìm thấy trường "${error.field}" với bất kỳ format nào trong description
                         </div>`;
            }

            html += '</li>';
        });

        html += '</ul>';
    }

    // Warnings
    if (result.warnings.length > 0) {
        html += '<h3 style="margin: 25px 0 15px 0; color: #e65100;">⚠️ Cảnh báo (cần manual check):</h3>';
        html += '<ul class="warning-list">';

        result.warnings.forEach((warning, index) => {
            html += '<li>';
            html += `<div style="margin-bottom: 8px;"><strong>${index + 1}. ${warning.message}</strong></div>`;

            if (warning.type === 'deviceid_mismatch') {
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">deviceId trong bioId:</span> 
                            <span class="field-value">${warning.bioIdDeviceId}</span>
                         </div>`;
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">deviceId từ field:</span> 
                            <span class="field-value">${warning.value}</span>
                         </div>`;
                html += `<div class="suggestion">
                            <strong>💡 Giải thích:</strong> Khách hàng đã thay đổi thiết bị giữa các lần sử dụng (bioId lưu deviceId lần đầu tiên).
                         </div>`;
            } else if (warning.type === 'bioid_format_invalid') {
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">Giá trị hiện tại:</span> 
                            <span class="field-name">${warning.value}</span>
                         </div>`;
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">Độ dài:</span> 
                            <span class="field-value">${warning.value.length} chars</span>
                         </div>`;
                html += `<div class="suggestion">
                            <strong>💡 Format chuẩn:</strong> UUID_deviceId_timestamp (91 chars)<br>
                            - UUID: 8-4-4-4-12 (36 chars)<br>
                            - deviceId: SHA1 (40 chars hex)<br>
                            - timestamp: milliseconds (13 digits)
                         </div>`;
            } else if (warning.type === 'sessionid_format_invalid') {
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">Giá trị hiện tại:</span> 
                            <span class="field-name">${warning.value}</span>
                         </div>`;
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">Độ dài:</span> 
                            <span class="field-value">${warning.value.length} chars</span>
                         </div>`;
                html += `<div class="suggestion">
                            <strong>💡 Format chuẩn:</strong> SHA256 hash (64 chars hex: 0-9, A-F)
                         </div>`;
            } else if (warning.type === 'deviceid_format_invalid') {
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">Giá trị hiện tại:</span> 
                            <span class="field-name">${warning.value}</span>
                         </div>`;
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">Độ dài:</span> 
                            <span class="field-value">${warning.value.length} chars</span>
                         </div>`;
                html += `<div class="suggestion">
                            <strong>💡 Format chuẩn:</strong> SHA1 hash (40 chars hex: 0-9, A-F)
                         </div>`;
            } else if (warning.type === 'wrong_format_field') {
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">Tìm thấy:</span> 
                            <span class="field-name">${warning.wrongField}: ${warning.value}</span>
                         </div>`;
                html += `<div class="suggestion">
                            <strong>💡 Gợi ý:</strong> Nếu đúng là "${warning.correctField}", hãy sửa thành: 
                            <span class="field-value">${warning.correctField}: ${warning.value}</span>
                         </div>`;
            } else if (warning.type === 'vendor_field' || warning.type === 'extracted_from_link') {
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">${warning.type === 'vendor_field' ? 'Trường vendor' : 'Giá trị'}:</span> 
                            <span class="field-name">${warning.field}: ${warning.value}</span>
                         </div>`;
            } else if (warning.field && warning.value) {
                html += `<div style="margin-bottom: 8px;">
                            <span style="color: #666;">Giá trị:</span> 
                            <span class="field-value">${warning.field}: ${warning.value}</span>
                         </div>`;
            }

            html += '</li>';
        });

        html += '</ul>';
    }

    // Generate standard template
    html += '<div class="divider"></div>';
    html += '<h3 style="margin: 25px 0 15px 0; color: #1565c0;">📝 Template chuẩn cho Odoo:</h3>';

    const standardTemplate = generateStandardTemplate(result.extracted);

    html += `<div class="template-box">
                <button class="copy-btn" onclick="copyTemplate(this)">📋 Copy All</button>
                ${escapeHtml(standardTemplate)}
             </div>`;

    resultsDiv.innerHTML = html;
}

function generateStandardTemplate(extracted) {
    const bioId = extracted.bioId || '<cần-điền-bioId>';
    const sessionId = extracted.sessionId || '<cần-điền-sessionId>';
    const deviceId = extracted.deviceId || '<cần-điền-deviceId>';

    return `bioId: ${bioId}
sessionId: ${sessionId}
deviceId: ${deviceId}

Portal link: https://portal2.digibank.vn/onboarding/bio-id/${bioId}/summary`;
}

function copyToClipboard(text, element) {
    if (!text || text === '') {
        alert('Không có giá trị để copy!');
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        // Visual feedback
        const originalBg = element.style.background;
        element.style.background = '#4caf50';
        element.style.transform = 'scale(0.98)';

        setTimeout(() => {
            element.style.background = originalBg;
            element.style.transform = 'scale(1)';
        }, 300);

        // Show toast message
        showToast('✓ Đã copy: ' + text.substring(0, 50) + (text.length > 50 ? '...' : ''));
    }).catch(err => {
        alert('Không thể copy. Vui lòng copy thủ công.');
    });
}

function showToast(message) {
    // Create toast element
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: #323232;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-size: 14px;
        animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 2000);
}

function copyTemplate(button) {
    const templateBox = button.parentElement;
    const text = templateBox.textContent.replace('📋 Copy', '').trim();

    navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = '✓ Đã copy!';
        button.classList.add('copied');

        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        alert('Không thể copy. Vui lòng copy thủ công.');
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function clearForm() {
    const textarea = document.getElementById('ticket-description');
    const results = document.getElementById('results');

    textarea.value = '';
    textarea.classList.height = 'auto';

    results.className = 'results-section';
    results.innerHTML = '';
}

// Auto-resize textarea
const textarea = document.getElementById('ticket-description');
textarea.addEventListener('input', function () {
    this.style.height = 'auto';
    // this.style.height = Math.max(200, this.scrollHeight) + 'px';
    this.style.height = this.scrollHeight + 'px';
});

// Add CSS animations for toast
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
    }
`;
document.head.appendChild(style);