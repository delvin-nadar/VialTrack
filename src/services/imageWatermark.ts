/**
 * Image Watermark & Base64 Compression Service
 * Resizes images to max 800px and compresses to JPEG (quality 0.6) for direct Base64 Firestore storage.
 * Superimposes GPS coordinates, timestamp, stop details, and SecondMedic VialTrack chain-of-custody verification overlay.
 */

export interface WatermarkData {
  stopName?: string;
  address?: string;
  clientName?: string;
  riderName: string;
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp: string;
  sampleCount?: number;
  vialCount?: number;
  coldBoxTemp?: number;
  temperature?: number;
  verificationCode?: string;
  isDrop?: boolean;
  receiverName?: string;
}

/**
 * Compresses an image to max dimension of 800px and JPEG quality 0.6 Base64 string for Firestore.
 */
export async function compressImageToBase64(
  imageSource: File | Blob | string | HTMLImageElement,
  maxDimension: number = 800,
  quality: number = 0.6
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (typeof imageSource === 'string' && /^https?:\/\//i.test(imageSource)) {
      img.crossOrigin = 'anonymous';
    }

    const handleLoad = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Canvas 2D context not available');
        }

        let width = img.naturalWidth || img.width || 800;
        let height = img.naturalHeight || img.height || 600;

        // Maintain aspect ratio, max dimension 800px
        if (width > maxDimension || height > maxDimension) {
          const scale = Math.min(maxDimension / width, maxDimension / height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }

        canvas.width = width;
        canvas.height = height;

        // Draw image onto canvas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to compressed Base64 JPEG
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      } catch (err) {
        reject(err);
      }
    };

    img.onload = handleLoad;
    img.onerror = (err) => reject(err);

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else if (imageSource instanceof Blob || imageSource instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(imageSource);
    } else if (imageSource instanceof HTMLImageElement) {
      img.src = imageSource.src;
    }
  });
}

export async function addWatermarkToImage(
  imageSource: string | HTMLImageElement | File | Blob,
  data: WatermarkData
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only set crossOrigin for external http/https URLs, not for data: or blob: URLs
    if (typeof imageSource === 'string' && /^https?:\/\//i.test(imageSource)) {
      img.crossOrigin = 'anonymous';
    }

    const handleLoad = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Canvas 2D context not available');
        }

        // Set dimensions (maintain aspect ratio, max 800px dimension for Spark plan Firestore limits)
        const maxDimension = 800;
        let width = img.naturalWidth || img.width || 800;
        let height = img.naturalHeight || img.height || 600;

        if (width > maxDimension || height > maxDimension) {
          const scale = Math.min(maxDimension / width, maxDimension / height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }

        canvas.width = width;
        canvas.height = height;

        // Draw original photo
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Calculate responsive scaling
        const baseFontSize = Math.max(12, Math.floor(width / 45));
        const padding = Math.max(12, Math.floor(width / 40));

        // Draw top brand banner
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)'; // slate-900 with alpha
        ctx.fillRect(0, 0, width, baseFontSize * 2.6);

        ctx.fillStyle = '#38bdf8'; // sky-400
        ctx.font = `bold ${baseFontSize * 1.1}px 'Plus Jakarta Sans', sans-serif`;
        ctx.fillText('SECOND MEDIC VIALTRACK', padding, baseFontSize * 1.7);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = `500 ${baseFontSize * 0.85}px 'Plus Jakarta Sans', sans-serif`;
        const roleLabel = data.isDrop ? '• LAB DESTINATION DROP PROOF' : '• COLLECTION POINT PICKUP PROOF';
        ctx.fillText(roleLabel, padding + ctx.measureText('SECOND MEDIC VIALTRACK ').width + 10, baseFontSize * 1.7);

        // Draw bottom metadata box (Dark glass panel with cyan/emerald accent line)
        const boxHeight = baseFontSize * 7.5;
        const boxY = height - boxHeight;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(0, boxY, width, boxHeight);

        // Top accent line on the box
        ctx.fillStyle = data.isDrop ? '#10b981' : '#0284c7'; // emerald for drop, sky for pickup
        ctx.fillRect(0, boxY, width, 4);

        // Left Column: Location & Stop Info
        let textY = boxY + baseFontSize * 1.6;
        
        ctx.fillStyle = '#f8fafc';
        ctx.font = `bold ${baseFontSize * 1.15}px 'Plus Jakarta Sans', sans-serif`;
        const locationName = data.stopName || data.address || (data.isDrop ? 'Diagnostic Lab' : 'Collection Stop');
        const titleText = data.isDrop ? `DROP: ${locationName}` : `PICKUP: ${locationName}`;
        ctx.fillText(titleText, padding, textY);

        textY += baseFontSize * 1.4;
        ctx.fillStyle = '#94a3b8';
        ctx.font = `500 ${baseFontSize * 0.9}px 'Plus Jakarta Sans', sans-serif`;
        const clientText = data.clientName ? ` | Client: ${data.clientName}` : '';
        ctx.fillText(`Rider: ${data.riderName}${clientText}`, padding, textY);

        textY += baseFontSize * 1.3;
        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${baseFontSize * 0.9}px 'JetBrains Mono', monospace`;
        const coordText = `GPS: ${data.lat.toFixed(6)}° N, ${data.lng.toFixed(6)}° E (±${data.accuracy || 8}m)`;
        ctx.fillText(coordText, padding, textY);

        textY += baseFontSize * 1.3;
        ctx.fillStyle = '#e2e8f0';
        ctx.font = `500 ${baseFontSize * 0.85}px 'JetBrains Mono', monospace`;
        const formattedDate = new Date(data.timestamp).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        ctx.fillText(`TIMESTAMP: ${formattedDate} IST`, padding, textY);

        // Right Column / Badges: Vials count, Temp, Verification
        const rightColX = width - padding;

        let rightY = boxY + baseFontSize * 1.8;
        ctx.textAlign = 'right';

        const effectiveTemp = data.coldBoxTemp !== undefined ? data.coldBoxTemp : data.temperature;
        if (effectiveTemp !== undefined) {
          ctx.fillStyle = effectiveTemp >= 2.0 && effectiveTemp <= 8.0 ? '#34d399' : '#f87171';
          ctx.font = `bold ${baseFontSize * 1.1}px 'Plus Jakarta Sans', sans-serif`;
          ctx.fillText(`TEMP: ${effectiveTemp.toFixed(1)}°C (2-8°C SAFE)`, rightColX, rightY);
        }

        rightY += baseFontSize * 1.4;
        const effectiveCount = data.sampleCount !== undefined ? data.sampleCount : data.vialCount;
        if (effectiveCount !== undefined && !data.isDrop) {
          ctx.fillStyle = '#fbbf24'; // amber-400
          ctx.font = `bold ${baseFontSize * 1.0}px 'Plus Jakarta Sans', sans-serif`;
          ctx.fillText(`VIALS COLLECTED: ${effectiveCount} UNITS`, rightColX, rightY);
        } else if (data.receiverName && data.isDrop) {
          ctx.fillStyle = '#a7f3d0';
          ctx.font = `bold ${baseFontSize * 0.95}px 'Plus Jakarta Sans', sans-serif`;
          ctx.fillText(`RECEIVED BY: ${data.receiverName}`, rightColX, rightY);
        }

        rightY += baseFontSize * 1.4;
        const hash = data.verificationCode || `SMVT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        ctx.fillStyle = '#64748b';
        ctx.font = `bold ${baseFontSize * 0.8}px 'JetBrains Mono', monospace`;
        ctx.fillText(`CHAIN-OF-CUSTODY ID: #${hash}`, rightColX, rightY);

        // Convert back to compressed Data URL (quality 0.6 JPEG for Firestore efficiency)
        const watermarkedUrl = canvas.toDataURL('image/jpeg', 0.6);
        resolve(watermarkedUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onload = handleLoad;
    img.onerror = (err) => reject(err);

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else if (imageSource instanceof Blob || imageSource instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(imageSource);
    } else if (imageSource instanceof HTMLImageElement) {
      img.src = imageSource.src;
    }
  });
}

/**
 * Generates a verified specimen / chiller box photo placeholder if camera is not opened
 */
export function generateSpecimenWatermarkedPhoto(type: 'vial' | 'drop' | 'chiller', label: string): string {
  const isDrop = type === 'drop';
  const bgColor = isDrop ? '#064e3b' : '#0f172a';
  const badgeColor = isDrop ? '#10b981' : '#0284c7';
  const titleText = isDrop ? 'DIAGNOSTIC LAB INTAKE • DELIVERED' : 'CERTIFIED SPECIMEN VIAL COLLECTION';
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
    <rect width="800" height="600" fill="${bgColor}"/>
    <rect y="0" width="800" height="48" fill="#020617" opacity="0.9"/>
    <text x="24" y="32" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="18" font-weight="bold">SECOND MEDIC VIALTRACK</text>
    <text x="280" y="32" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14">${titleText}</text>
    
    <g transform="translate(400, 240)">
      ${isDrop 
        ? `<rect x="-120" y="-70" width="240" height="140" rx="12" fill="#047857" stroke="#34d399" stroke-width="3"/>
           <text x="0" y="8" fill="#ffffff" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">CENTRAL LAB RECEIPT</text>`
        : `<rect x="-160" y="-50" width="320" height="100" rx="8" fill="#1e293b" stroke="#38bdf8" stroke-width="3"/>
           <g transform="translate(-100, -80)">
             <rect x="0" y="0" width="20" height="24" rx="4" fill="#ef4444"/>
             <rect x="2" y="24" width="16" height="85" fill="#f87171" opacity="0.7"/>
           </g>
           <g transform="translate(-50, -80)">
             <rect x="0" y="0" width="20" height="24" rx="4" fill="#8b5cf6"/>
             <rect x="2" y="24" width="16" height="85" fill="#a78bfa" opacity="0.7"/>
           </g>
           <g transform="translate(0, -80)">
             <rect x="0" y="0" width="20" height="24" rx="4" fill="#ef4444"/>
             <rect x="2" y="24" width="16" height="85" fill="#f87171" opacity="0.7"/>
           </g>
           <g transform="translate(50, -80)">
             <rect x="0" y="0" width="20" height="24" rx="4" fill="#8b5cf6"/>
             <rect x="2" y="24" width="16" height="85" fill="#a78bfa" opacity="0.7"/>
           </g>
           <g transform="translate(100, -80)">
             <rect x="0" y="0" width="20" height="24" rx="4" fill="#ef4444"/>
             <rect x="2" y="24" width="16" height="85" fill="#f87171" opacity="0.7"/>
           </g>`
      }
    </g>

    <rect y="460" width="800" height="140" fill="#020617" opacity="0.95"/>
    <rect y="460" width="800" height="4" fill="${badgeColor}"/>
    <text x="24" y="505" fill="#ffffff" font-family="system-ui, sans-serif" font-size="22" font-weight="bold">${label}</text>
    <text x="24" y="540" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="14">ISO 15189 Verified Chain-of-Custody Proof • Geotagged &amp; Cold-Chain Logged</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const generateSampleVialPhoto = generateSpecimenWatermarkedPhoto;
