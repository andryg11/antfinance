import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export interface Barcode1DProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
  format?: 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'auto';
  background?: string;
  lineColor?: string;
}

/**
 * Barcode1D - Komponen untuk me-render Barcode Batang (Linear 1D) standar
 * Mendukung Code-128, EAN-13, EAN-8, UPC, Code-39 dengan fallback otomatis.
 */
export const Barcode1D: React.FC<Barcode1DProps> = ({
  value,
  width = 1.8,
  height = 50,
  displayValue = true,
  fontSize = 12,
  className = '',
  format = 'auto',
  background = 'transparent',
  lineColor = '#000000',
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value || !value.trim()) return;

    const clean = value.trim();

    // Tentukan format barcode yang cocok
    let targetFormat: string = format;
    if (targetFormat === 'auto') {
      if (/^\d{13}$/.test(clean)) {
        targetFormat = 'EAN13';
      } else if (/^\d{8}$/.test(clean)) {
        targetFormat = 'EAN8';
      } else if (/^\d{12}$/.test(clean)) {
        targetFormat = 'UPC';
      } else {
        targetFormat = 'CODE128';
      }
    }

    const renderBarcode = (fmt: string) => {
      if (!svgRef.current) return;
      try {
        JsBarcode(svgRef.current, clean, {
          format: fmt,
          width,
          height,
          displayValue,
          fontSize,
          textMargin: 3,
          margin: 4,
          background,
          lineColor,
          valid: (valid) => {
            if (!valid && fmt !== 'CODE128') {
              // Jika format seperti EAN13 gagal validasi checksum, fallback otomatis ke CODE128
              renderBarcode('CODE128');
            }
          },
        });
      } catch (err) {
        if (fmt !== 'CODE128') {
          // Fallback ke CODE128 yang mendukung seluruh karakter ASCII
          try {
            renderBarcode('CODE128');
          } catch {
            // ignore
          }
        }
      }
    };

    renderBarcode(targetFormat);
  }, [value, width, height, displayValue, fontSize, format, background, lineColor]);

  if (!value || !value.trim()) {
    return <span className="text-slate-400 text-xs italic">Tanpa barcode</span>;
  }

  return (
    <svg ref={svgRef} className={`max-w-full inline-block ${className}`} />
  );
};
