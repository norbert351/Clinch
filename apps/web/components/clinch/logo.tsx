import Image from 'next/image';

interface LogoProps {
  size?: number;
  showText?: boolean;
  textSize?: string;
}

export function ClinchLogo({
  size = 32,
  showText = true,
  textSize = 'text-lg',
}: LogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <Image
          src="/logo.png"
          alt="Clinch"
          width={size}
          height={size}
          className="object-contain"
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span
            className={[
              'font-display font-bold italic tracking-tight',
              'gradient-brand-text',
              textSize,
            ].join(' ')}
          >
            Clinch
          </span>
        </div>
      )}
    </div>
  );
}

export function Logo(props: LogoProps) {
  return <ClinchLogo {...props} />;
}
