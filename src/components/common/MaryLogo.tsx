import type { SVGProps } from 'react';
import { cn } from '@/utils/cn';

type MaryLogoProps = SVGProps<SVGSVGElement> & {
  compact?: boolean;
};

export function MaryLogo({ className, compact = false, ...props }: MaryLogoProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 320 260"
      role="img"
      aria-label="Mary Driving School logo"
      className={cn('h-16 w-20 shrink-0', className)}
      {...props}
    >
      <rect width="320" height="260" fill="none" />
      <g transform="translate(160 126) rotate(45)">
        <rect x="-82" y="-82" width="164" height="164" rx="8" fill="white" stroke="#1f2a44" strokeWidth="8" />
      </g>

      <g fill="#df2335">
        <path d="M88 112h144l-13 28H101z" />
        <path d="M111 82h98c10 0 20 15 29 37H82c9-22 19-37 29-37z" />
        <path d="M121 92h78c6 0 12 8 18 19H103c6-11 12-19 18-19z" fill="white" />
        <path d="M79 119h38l-11 17H70z" fill="white" />
        <path d="M203 119h38l9 17h-36z" fill="white" />
        <path d="M86 84l-28-7 1 14 23 9z" />
        <path d="M234 84l28-7-1 14-23 9z" />
        <path d="M83 144h35l-8 10H76z" />
        <path d="M202 144h35l7 10h-34z" />
      </g>

      <rect x="31" y="136" width="258" height="47" rx="8" fill="white" stroke="#1f2a44" strokeWidth="7" />
      <text
        x="160"
        y="160"
        textAnchor="middle"
        fill="#1f2a44"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="22"
        fontWeight="800"
        letterSpacing="1"
      >
        MARY DRIVING SCHOOL
      </text>
      {!compact ? (
        <text
          x="160"
          y="178"
          textAnchor="middle"
          fill="#1f2a44"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="12"
          fontWeight="700"
        >
          (Towards Next-generations)
        </text>
      ) : null}

      <g fill="#1f2a44" transform="translate(0 4)">
        {[104, 126, 150, 174, 198, 220].map((x, index) => (
          <path
            key={x}
            d="M0 -9 2.8 -2.8 9 0 2.8 2.8 0 9 -2.8 2.8 -9 0 -2.8 -2.8z"
            transform={`translate(${x} ${203 + Math.abs(index - 2.5) * -7}) scale(0.9)`}
          />
        ))}
      </g>

      {!compact ? (
        <>
          <g transform="translate(52 166)">
            <rect x="9" y="5" width="18" height="9" rx="2" fill="#f2b705" />
            <rect x="2" y="8" width="10" height="6" rx="1" fill="#1d4ed8" />
            <circle cx="8" cy="17" r="3" fill="#1f2a44" />
            <circle cx="25" cy="17" r="3" fill="#1f2a44" />
          </g>
          <g transform="translate(254 164)" fill="#df2335">
            <circle cx="7" cy="18" r="4" />
            <circle cx="25" cy="18" r="4" />
            <path d="M7 18 15 8h10l8 10h-8l-5-7h-3l-6 7z" />
            <path d="M18 8h10l2-7h-8z" />
          </g>
        </>
      ) : null}
    </svg>
  );
}
