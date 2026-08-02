/* public/js/crypto.js */

/**
 * Menerjemahkan ArrayBuffer ke Base64 String
 */
export function bufferToBase64(buf) {
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

/**
 * Menerjemahkan Base64 String ke ArrayBuffer
 */
export function base64ToBuffer(base64) {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Mengubah Passphrase teks menjadi CryptoKey AES-256-GCM via SHA-256
 */
export async function deriveKeyFromPassphrase(passphrase) {
    const encoder = new TextEncoder();
    const data = encoder.encode(passphrase);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    return await crypto.subtle.importKey(
        'raw',
        hashBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Mengenkripsi Teks menggunakan AES-256-GCM & Random 96-bit IV
 */
export async function encryptText(plainText, key, customIv = null) {
    const encoder = new TextEncoder();
    const iv = customIv || crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encoder.encode(plainText)
    );

    return {
        ciphertext: bufferToBase64(encryptedBuffer),
        iv: bufferToBase64(iv)
    };
}

/**
 * Mendekripsi Teks dari Base64 menggunakan AES-256-GCM
 */
export async function decryptText(ciphertextBase64, ivBase64, key) {
    try {
        const decoder = new TextDecoder();
        const ciphertextBuffer = base64ToBuffer(ciphertextBase64);
        const ivBuffer = base64ToBuffer(ivBase64);

        const decryptedBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBuffer },
            key,
            ciphertextBuffer
        );

        return decoder.decode(decryptedBuffer);
    } catch (err) {
        return "[Gagal Dekripsi: Key Salah]";
    }
}

/**
 * Mengenkripsi Title & Body dengan IV independen (mencegah nonce reuse)
 */
export async function encryptNotePayload(title, body, key) {
    const ivTitleBytes = crypto.getRandomValues(new Uint8Array(12));
    const ivBodyBytes = crypto.getRandomValues(new Uint8Array(12));

    const encTitle = await encryptText(title, key, ivTitleBytes);
    const encBody = await encryptText(body, key, ivBodyBytes);

    return {
        encrypted_title: encTitle.ciphertext,
        encrypted_body: encBody.ciphertext,
        iv: `${encTitle.iv}|${encBody.iv}`
    };
}

/**
 * Mendekripsi Gabungan Payload Title & Body
 */
export async function decryptNotePayload(encTitle, encBody, ivString, key) {
    let ivTitle, ivBody;
    if (ivString && ivString.includes('|')) {
        const parts = ivString.split('|');
        ivTitle = parts[0];
        ivBody = parts[1];
    } else {
        ivTitle = ivString;
        ivBody = ivString;
    }

    const title = await decryptText(encTitle, ivTitle, key);
    const body = await decryptText(encBody, ivBody, key);

    return { title, body };
}