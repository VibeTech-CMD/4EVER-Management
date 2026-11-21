import React from 'react';

interface LogoProps {
  variant?: 'dark-on-light' | 'light-on-dark';
  className?: string;
}

export const OFFICIAL_FULL_LOGO_DARK = '/assets/aistudio/Logo-Verde_Escuro_com_bege__2__d0f0c663.png';
export const OFFICIAL_FULL_LOGO_LIGHT = '/assets/aistudio/Code_Generated_Image_bab81833.png';
export const OFFICIAL_MONOGRAM_GREEN = '/assets/aistudio/Monograma-4Ever-VerdeEscuro-Bege_cda07930.png';
export const OFFICIAL_MONOGRAM_BROWN = '/assets/aistudio/Monograma-4Ever-Marrom-Original_91bc583e.png';

export const FourEverFullLogo: React.FC<LogoProps> = ({
  variant = 'dark-on-light',
  className = 'h-10 w-auto',
}) => {
  const src = variant === 'light-on-dark' ? OFFICIAL_FULL_LOGO_LIGHT : OFFICIAL_FULL_LOGO_DARK;

  return (
    <img
      src={src}
      alt="4EVER Cerimonial"
      referrerPolicy="no-referrer"
      className={`object-contain select-none ${className}`}
    />
  );
};

interface MonogramProps {
  variant?: 'green' | 'brown' | 'on-dark';
  size?: number;
  className?: string;
}

export const Monogram4E: React.FC<MonogramProps> = ({
  variant = 'green',
  size = 36,
  className = '',
}) => {
  const src = variant === 'brown' ? OFFICIAL_MONOGRAM_BROWN : OFFICIAL_MONOGRAM_GREEN;
  const isDarkSurface = variant === 'on-dark';

  return (
    <span
      style={{ width: size, height: size }}
      className={`inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden select-none ${
        isDarkSurface ? 'bg-white p-[2px] ring-1 ring-[#A99A83]/50' : ''
      } ${className}`}
    >
      <img
        src={src}
        alt="Monograma 4E"
        referrerPolicy="no-referrer"
        className={`w-full h-full object-contain rounded-full ${
          !isDarkSurface ? 'mix-blend-multiply' : ''
        }`}
      />
    </span>
  );
};
